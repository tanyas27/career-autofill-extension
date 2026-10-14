const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// We will test background.js logic in isolation
// Let's create helper to load background.js functions in a simulated chrome runtime environment
function setupBackgroundContext(mockLanguageModel = null) {
  const storageState = {
    profile: {},
    fillAllMode: false,
    aiEnforcedMode: true
  };

  const listeners = [];
  const fakeChrome = {
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: {
        addListener: (fn) => listeners.push(fn)
      }
    },
    storage: {
      local: {
        get: async (keys) => {
          if (Array.isArray(keys)) {
            const res = {};
            keys.forEach(k => { if (storageState[k] !== undefined) res[k] = storageState[k]; });
            return res;
          }
          return { ...storageState };
        },
        set: async (items) => {
          Object.assign(storageState, items);
        }
      }
    }
  };

  const sandbox = {
    chrome: fakeChrome,
    console: console,
    LanguageModel: mockLanguageModel,
    globalThis: {
      LanguageModel: mockLanguageModel
    },
    self: {
      LanguageModel: mockLanguageModel
    }
  };

  const code = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf-8');
  const fn = new Function('chrome', 'console', 'LanguageModel', 'globalThis', 'self', `
    ${code}
    return {
      checkAiCapabilities,
      matchFieldsWithAi,
      extractJsonFromModelOutput,
      getLanguageModelApi,
      semanticArbiter: typeof localSemanticArbiter !== 'undefined' ? localSemanticArbiter : null
    };
  `);

  const exports = fn(fakeChrome, console, mockLanguageModel, sandbox.globalThis, sandbox.self);
  return { ...exports, fakeChrome, storageState };
}

describe('AI Semantic Arbiter & Background Engine - Skeptical Tester Audit', () => {
  describe('JSON Sanitization & Extraction', () => {
    test('parses pure JSON output', () => {
      const { extractJsonFromModelOutput } = setupBackgroundContext();
      const raw = '{"mappings": [{"fieldId": "ca_1", "profileKey": "email"}]}';
      const parsed = extractJsonFromModelOutput(raw);
      assert.equal(parsed.mappings?.length, 1);
      assert.equal(parsed.mappings[0].profileKey, 'email');
    });

    test('extracts JSON wrapped in markdown code blocks', () => {
      const { extractJsonFromModelOutput } = setupBackgroundContext();
      const raw = '```json\n{"mappings": [{"fieldId": "ca_1", "profileKey": "firstName"}]}\n```';
      const parsed = extractJsonFromModelOutput(raw);
      assert.equal(parsed.mappings?.length, 1);
      assert.equal(parsed.mappings[0].profileKey, 'firstName');
    });

    test('recovers from preambles, postambles, and conversational text', () => {
      const { extractJsonFromModelOutput } = setupBackgroundContext();
      const raw = `Here is your requested mapping for the form:
      {
        "mappings": [
          {"fieldId": "ca_why", "profileKey": "whyUs"}
        ]
      }
      Let me know if you need anything else!`;
      const parsed = extractJsonFromModelOutput(raw);
      assert.equal(parsed.mappings?.length, 1);
      assert.equal(parsed.mappings[0].profileKey, 'whyUs');
    });

    test('SKEPTICAL TEST: Strips trailing commas that break JSON.parse', () => {
      const { extractJsonFromModelOutput } = setupBackgroundContext();
      const raw = `{
        "mappings": [
          {
            "fieldId": "ca_1",
            "profileKey": "coverLetter",
          },
        ],
      }`;
      const parsed = extractJsonFromModelOutput(raw);
      assert.equal(parsed.mappings?.length, 1);
      assert.equal(parsed.mappings[0].profileKey, 'coverLetter');
    });

    test('handles empty or completely invalid outputs gracefully without throwing', () => {
      const { extractJsonFromModelOutput } = setupBackgroundContext();
      assert.deepEqual(extractJsonFromModelOutput(''), { mappings: [] });
      assert.deepEqual(extractJsonFromModelOutput(null), { mappings: [] });
      assert.deepEqual(extractJsonFromModelOutput('Sorry, I cannot answer this.'), { mappings: [] });
    });
  });

  describe('AI Capability Check', () => {
    test('reports active AI capability with engine fallback', async () => {
      const { checkAiCapabilities } = setupBackgroundContext();
      const status = await checkAiCapabilities();
      assert.equal(status.available, true);
      assert.ok(status.engine);
    });

    test('detects Prompt API when available', async () => {
      const mockLM = {
        availability: async () => 'readily',
        create: async () => ({})
      };
      const { checkAiCapabilities } = setupBackgroundContext(mockLM);
      const status = await checkAiCapabilities();
      assert.equal(status.available, true);
      assert.equal(status.status, 'ready');
      assert.equal(status.engine, 'gemini-nano');
    });
  });

  describe('Semantic Arbiter Field Matching', () => {
    const profile = {
      firstName: 'Alex',
      lastName: 'Morgan',
      fullName: 'Alex Morgan',
      email: 'alex.morgan@example.com',
      phone: '+1 (555) 234-5678',
      country: 'United States',
      workAuthCountries: 'United States, Canada',
      workAuth: 'Yes',
      sponsorship: 'No',
      sponsorshipOtherCountries: 'Yes',
      currentCompany: 'Stripe',
      currentTitle: 'Staff Software Engineer',
      whyUs: 'I am deeply inspired by your mission to streamline global infrastructure and technical elegance.',
      projectHighlight: 'Architected a distributed event ingestion pipeline scaling to 50k events/sec with sub-second latency.',
      coverLetter: 'Dear Hiring Manager, I am excited to apply for the Staff Software Engineer role at your company.'
    };

    test('SKEPTICAL TEST: Semantically disambiguates multiple essay textareas', async () => {
      const { matchFieldsWithAi } = setupBackgroundContext();
      const fields = [
        {
          id: 'field_why',
          type: 'textarea',
          label: 'Why do you want to join our team?',
          context: 'Section: Candidate Motivation | Help: Tell us what excites you about this mission'
        },
        {
          id: 'field_project',
          type: 'textarea',
          label: 'Tell us about a notable technical project or system challenge you spearheaded',
          context: 'Section: Engineering Experience'
        },
        {
          id: 'field_cover',
          type: 'textarea',
          label: 'Cover Letter / Note to Hiring Team',
          context: 'Section: Additional Documents'
        }
      ];

      const result = await matchFieldsWithAi(fields, profile);
      assert.ok(result.mappings?.length >= 3);

      const whyMatch = result.mappings.find(m => m.fieldId === 'field_why');
      const projMatch = result.mappings.find(m => m.fieldId === 'field_project');
      const coverMatch = result.mappings.find(m => m.fieldId === 'field_cover');

      assert.equal(whyMatch?.profileKey, 'whyUs');
      assert.equal(projMatch?.profileKey, 'projectHighlight');
      assert.equal(coverMatch?.profileKey, 'coverLetter');
    });

    test('SKEPTICAL TEST: Accurately resolves country-specific work authorization questions', async () => {
      const { matchFieldsWithAi } = setupBackgroundContext();
      const fields = [
        {
          id: 'field_us_auth',
          type: 'select',
          label: 'Are you legally authorized to work in the United States?',
          context: 'Location: United States',
          options: ['Please select', 'Yes, authorized without sponsorship', 'No, not authorized']
        },
        {
          id: 'field_germany_auth',
          type: 'select',
          label: 'Are you legally authorized to work in Germany without restriction?',
          context: 'Location: Berlin, Germany',
          options: ['Please select', 'Yes', 'No']
        }
      ];

      const result = await matchFieldsWithAi(fields, profile);
      const usMatch = result.mappings.find(m => m.fieldId === 'field_us_auth');
      const deMatch = result.mappings.find(m => m.fieldId === 'field_germany_auth');

      // US: candidate is authorized in US -> selects option 'Yes, authorized without sponsorship'
      assert.equal(usMatch?.profileKey, 'workAuth');
      assert.equal(usMatch?.selectedOption, 'Yes, authorized without sponsorship');

      // Germany: candidate is NOT authorized in Germany -> selects option 'No'
      assert.equal(deMatch?.profileKey, 'workAuth');
      assert.equal(deMatch?.selectedOption, 'No');
    });

    test('SKEPTICAL TEST: Omits irrelevant/unmatched fields from output in AI Enforced Mode', async () => {
      const { matchFieldsWithAi } = setupBackgroundContext();
      const fields = [
        {
          id: 'field_valid',
          type: 'text',
          label: 'Email Address'
        },
        {
          id: 'field_irrelevant',
          type: 'text',
          label: 'What is your favorite cooking recipe?'
        }
      ];

      const result = await matchFieldsWithAi(fields, profile);
      const validMatch = result.mappings.find(m => m.fieldId === 'field_valid');
      const irrelevantMatch = result.mappings.find(m => m.fieldId === 'field_irrelevant');

      assert.equal(validMatch?.profileKey, 'email');
      assert.equal(irrelevantMatch, undefined, 'Irrelevant fields should not be matched');
    });
  });
});
