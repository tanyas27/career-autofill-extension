const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Load background module exports / globals
let bg;

describe('Gemini Nano Prompt API Contract & Live Runtime Verification', () => {
  let originalGlobalThisLM;
  let originalGlobalThisAi;
  let originalSelfLM;
  let originalSelfAi;

  beforeEach(() => {
    // Save original environment
    originalGlobalThisLM = globalThis.LanguageModel;
    originalGlobalThisAi = globalThis.ai;
    originalSelfLM = typeof self !== 'undefined' ? self.LanguageModel : undefined;
    originalSelfAi = typeof self !== 'undefined' ? self.ai : undefined;

    // Clear module cache to test fresh initialization
    delete require.cache[require.resolve('../background.js')];
  });

  afterEach(() => {
    // Restore environment
    if (originalGlobalThisLM !== undefined) globalThis.LanguageModel = originalGlobalThisLM;
    else delete globalThis.LanguageModel;

    if (originalGlobalThisAi !== undefined) globalThis.ai = originalGlobalThisAi;
    else delete globalThis.ai;

    if (typeof self !== 'undefined') {
      if (originalSelfLM !== undefined) self.LanguageModel = originalSelfLM;
      else delete self.LanguageModel;
      if (originalSelfAi !== undefined) self.ai = originalSelfAi;
      else delete self.ai;
    }
  });

  it('SKEPTICAL TEST: Detects Gemini Nano as ready when LanguageModel.availability() is "available"', async () => {
    // Mock native Chromium LanguageModel
    globalThis.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => '{"mappings": []}',
        destroy: () => {}
      })
    };

    bg = require('../background.js');
    const caps = await bg.checkAiCapabilities();

    assert.equal(caps.available, true);
    assert.equal(caps.status, 'ready');
    assert.equal(caps.engine, 'gemini-nano');
    assert.match(caps.message, /On-Device Gemini Nano is ready/i);
  });

  it('SKEPTICAL TEST: Detects Gemini Nano under self.ai.languageModel namespace (Chrome 138+)', async () => {
    delete globalThis.LanguageModel;
    globalThis.ai = {
      languageModel: {
        availability: async () => 'readily',
        create: async () => ({
          prompt: async () => '{"mappings": []}',
          destroy: () => {}
        })
      }
    };

    bg = require('../background.js');
    const caps = await bg.checkAiCapabilities();

    assert.equal(caps.available, true);
    assert.equal(caps.status, 'ready');
    assert.equal(caps.engine, 'gemini-nano');
  });

  it('SKEPTICAL TEST: Executes Gemini Nano session prompt and maps fields accurately with JSON schema', async () => {
    let sessionDestroyCalled = false;
    let createOptionsPassed = null;
    let promptTextPassed = null;

    globalThis.LanguageModel = {
      availability: async () => 'available',
      create: async (opts) => {
        createOptionsPassed = opts;
        return {
          prompt: async (promptText) => {
            promptTextPassed = promptText;
            return JSON.stringify({
              mappings: [
                { fieldId: 'field_1', profileKey: 'firstName', confidence: 0.99 },
                { fieldId: 'field_2', profileKey: 'coverLetter', confidence: 0.95 },
                { fieldId: 'field_3', profileKey: 'whyUs', confidence: 0.92 }
              ]
            });
          },
          destroy: () => {
            sessionDestroyCalled = true;
          }
        };
      }
    };

    bg = require('../background.js');

    const fields = [
      { id: 'field_1', label: 'First Name', type: 'text' },
      { id: 'field_2', label: 'Cover Letter / Letter of Interest', type: 'textarea' },
      { id: 'field_3', label: 'Why are you interested in joining our company?', type: 'textarea' }
    ];

    const profile = {
      firstName: 'Jane',
      coverLetter: 'I am excited to apply for this engineering role.',
      whyUs: 'I love your mission and technical stack.'
    };

    const result = await bg.matchFieldsWithAi(fields, profile, { isAiEnforced: true });

    // Assertions on Gemini Nano session
    assert.ok(createOptionsPassed, 'LanguageModel.create must be invoked');
    assert.equal(createOptionsPassed.temperature, 0.1);
    assert.match(createOptionsPassed.systemPrompt, /expert AI form assistant/i);
    assert.ok(promptTextPassed.includes('field_1'));
    assert.ok(promptTextPassed.includes('field_2'));
    assert.ok(promptTextPassed.includes('field_3'));
    assert.equal(sessionDestroyCalled, true, 'session.destroy() MUST be called to release GPU/RAM');

    // Assertions on mappings
    assert.equal(result.mappings.length, 3);
    assert.equal(result.mappings[0].profileKey, 'firstName');
    assert.equal(result.mappings[1].profileKey, 'coverLetter');
    assert.equal(result.mappings[2].profileKey, 'whyUs');
  });

  it('SKEPTICAL TEST: Handles markdown code blocks, preambles, and trailing commas from Gemini Nano', async () => {
    globalThis.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => {
          // Real-world LLM output: preamble + markdown backticks + trailing commas
          return `Here is the JSON result requested:
\`\`\`json
{
  "mappings": [
    {
      "fieldId": "q_auth",
      "profileKey": "workAuth",
      "selectedOption": "Yes",
      "confidence": 0.98,
    },
    {
      "fieldId": "q_sponsor",
      "profileKey": "sponsorship",
      "selectedOption": "No",
      "confidence": 0.95,
    },
  ],
}
\`\`\`
Hope this helps!`;
        },
        destroy: () => {}
      })
    };

    bg = require('../background.js');

    const fields = [
      { id: 'q_auth', label: 'Are you authorized to work in the US?', type: 'select', options: ['Yes', 'No'] },
      { id: 'q_sponsor', label: 'Will you require visa sponsorship?', type: 'select', options: ['Yes', 'No'] }
    ];

    const profile = {
      workAuth: 'Yes',
      sponsorship: 'No',
      authorizedCountries: ['United States']
    };

    const result = await bg.matchFieldsWithAi(fields, profile);

    assert.equal(result.mappings.length, 2);
    assert.equal(result.mappings[0].fieldId, 'q_auth');
    assert.equal(result.mappings[0].selectedOption, 'Yes');
    assert.equal(result.mappings[1].fieldId, 'q_sponsor');
    assert.equal(result.mappings[1].selectedOption, 'No');
  });

  it('SKEPTICAL TEST: Fallbacks safely and releases session if Gemini Nano throws an execution error', async () => {
    let sessionDestroyCalled = false;

    globalThis.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => {
          throw new Error('GPU context lost / Out of memory');
        },
        destroy: () => {
          sessionDestroyCalled = true;
        }
      })
    };

    bg = require('../background.js');

    const fields = [
      { id: 'f_email', label: 'Email Address', type: 'email' }
    ];
    const profile = {
      email: 'alex@example.com'
    };

    // Should NOT throw! Must catch error, cleanup session, and fall back to local semantic arbiter
    const result = await bg.matchFieldsWithAi(fields, profile);

    assert.equal(sessionDestroyCalled, true, 'Session must still be destroyed on error');
    assert.ok(result.mappings.length > 0, 'Local semantic arbiter must succeed as fallback');
    assert.equal(result.mappings[0].profileKey, 'email');
  });
});
