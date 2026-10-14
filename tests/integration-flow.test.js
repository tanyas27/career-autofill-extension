const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const fieldDetectorCode = fs.readFileSync(path.join(__dirname, '../field-detector.js'), 'utf-8');
const backgroundCode = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf-8');

const contentCode = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf-8');

function setupIntegrationContext() {
  const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
  <body>
    <form id="test-form">
      <label for="first_name">First Name *</label>
      <input type="text" id="first_name" name="first_name" required>

      <label for="last_name">Last Name *</label>
      <input type="text" id="last_name" name="last_name" required>

      <label for="email">Email *</label>
      <input type="email" id="email" name="email" required>

      <label for="why_us">Why do you want to join our engineering organization?</label>
      <textarea id="why_us" name="why_us"></textarea>
    </form>
  </body>
  </html>
  `, { runScripts: 'dangerously', url: 'https://careers.example.com/apply' });

  const { window } = dom;
  const { document } = window;

  const storageState = {
    profile: {
      firstName: 'Riley',
      lastName: 'Chen',
      fullName: 'Riley Chen',
      email: 'riley.chen@example.com',
      whyUs: 'Passionate about distributed storage and reliability.'
    },
    fillAllMode: false,
    aiEnforcedMode: true
  };

  const fakeChrome = {
    runtime: {
      id: 'test-extension-id',
      onInstalled: { addListener: ()=>{} },
      onMessage: { addListener: ()=>{} },
      sendMessage: async (msg) => {
        if (msg.action === 'aiMatchFields') {
          const res = await bgExports.matchFieldsWithAi(msg.fields, msg.profile, msg.options || {});
          return { success: true, mappings: res.mappings || [] };
        }
        if (msg.action === 'getAiStatus') {
          return { success: true, status: await bgExports.checkAiCapabilities() };
        }
        return { success: false };
      }
    },
    storage: {
      local: {
        get: async (keys) => {
          if (Array.isArray(keys)) {
            const out = {};
            keys.forEach(k => { if (storageState[k] !== undefined) out[k] = storageState[k]; });
            return out;
          }
          return { ...storageState };
        },
        set: async (items) => {
          Object.assign(storageState, items);
        }
      }
    }
  };

  window.chrome = fakeChrome;
  window.eval(fieldDetectorCode);

  const bgFn = new Function('chrome', 'console', `${backgroundCode}; return { matchFieldsWithAi, checkAiCapabilities };`);
  const bgExports = bgFn(fakeChrome, console);

  window.eval(contentCode);

  return {
    window,
    document,
    FieldDetector: window.FieldDetector,
    fakeChrome,
    storageState,
    bgExports,
    autofillExtension: window.autofillExtension,
    getPageInfoExtension: window.getPageInfoExtension
  };
}

describe('Integration Flow: AI Enforced Mode & System Verification', () => {
  let ctx;

  beforeEach(() => {
    ctx = setupIntegrationContext();
  });

  test('SKEPTICAL TEST: AI Enforced Mode completes application without unverified heuristics', async () => {
    const { document, FieldDetector, bgExports, storageState } = ctx;
    const fields = FieldDetector.getFields();

    // Build SFT
    const sft = FieldDetector.buildSemanticFormTree(fields);
    const aiResult = await bgExports.matchFieldsWithAi(sft, storageState.profile, { aiEnforced: true });

    assert.ok(aiResult.mappings?.length >= 3);

    for (const m of aiResult.mappings) {
      const el = document.querySelector(`[data-ca-field-id="${m.fieldId}"]`);
      if (el && storageState.profile[m.profileKey]) {
        FieldDetector.setValue(el, storageState.profile[m.profileKey]);
      }
    }

    assert.equal(document.getElementById('first_name').value, 'Riley');
    assert.equal(document.getElementById('last_name').value, 'Chen');
    assert.equal(document.getElementById('email').value, 'riley.chen@example.com');
    assert.equal(document.getElementById('why_us').value, storageState.profile.whyUs);
  });

  test('Profile Import/Export and JSON integrity', () => {
    const rawProfile = {
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex@example.com',
      workAuthCountries: 'United States'
    };

    const exportedJson = JSON.stringify({ profile: rawProfile }, null, 2);
    const parsed = JSON.parse(exportedJson);

    assert.deepEqual(parsed.profile, rawProfile);
    assert.equal(parsed.profile.firstName, 'Alex');
  });

  test('Diagnostic function inspects all page fields without throwing', () => {
    const { window, document, FieldDetector } = ctx;
    window.debugCareerAutofill = function() {
      const fields = FieldDetector.getFields();
      return fields.map(f => FieldDetector.classify(f));
    };

    const diagnostics = window.debugCareerAutofill();
    assert.equal(diagnostics.length, 4);
    assert.equal(diagnostics[0].key, 'firstName');
    assert.equal(diagnostics[1].key, 'lastName');
    assert.equal(diagnostics[2].key, 'email');
    assert.equal(diagnostics[3].key, 'whyUs');
  });

  test('SKEPTICAL TEST: autofillExtension returns -1 when profile is empty', async () => {
    const { storageState, autofillExtension } = ctx;
    storageState.profile = {};
    const result = await autofillExtension({ fillAll: true, aiEnforced: true });
    assert.equal(result, -1, 'Empty profile in storage must return -1 so popup can alert user to load profile');
  });

  test('SKEPTICAL TEST: autofillExtension populates all matching fields end-to-end', async () => {
    const { document, autofillExtension } = ctx;
    const count = await autofillExtension({ fillAll: true, aiEnforced: true });
    assert.ok(count > 0, `autofillExtension should return filled count > 0, got: ${count}`);
    assert.equal(document.getElementById('first_name').value, 'Riley');
    assert.equal(document.getElementById('last_name').value, 'Chen');
    assert.equal(document.getElementById('email').value, 'riley.chen@example.com');
  });

  test('SKEPTICAL TEST: getPageInfoExtension accurately counts form fields', () => {
    const { getPageInfoExtension } = ctx;
    const info = getPageInfoExtension();
    assert.equal(info.totalFields, 4);
    assert.equal(info.mandatoryFields, 3);
  });

  test('SKEPTICAL TEST: AI Enforced Mode works with partial profile (firstName and email only)', async () => {
    const { document, storageState, autofillExtension } = ctx;
    storageState.profile = {
      firstName: 'Tanya',
      email: 'tanyacs27@example.com'
    };

    const count = await autofillExtension({ fillAll: true, aiEnforced: true });
    assert.ok(count >= 2, `Expected at least 2 fields filled, got: ${count}`);
    assert.equal(document.getElementById('first_name').value, 'Tanya');
    assert.equal(document.getElementById('email').value, 'tanyacs27@example.com');
  });

  test('SKEPTICAL TEST: AI Enforced Mode resolves element when AI returns HTML id instead of ca_field_N', async () => {
    const { document, fakeChrome, storageState, autofillExtension } = ctx;
    storageState.profile = {
      firstName: 'Tanya',
      email: 'tanyacs27@example.com'
    };

    // Override mock to simulate an LLM returning HTML element IDs directly
    fakeChrome.runtime.sendMessage = async (msg) => {
      if (msg.action === 'aiMatchFields') {
        return {
          success: true,
          mappings: [
            { fieldId: 'first_name', profileKey: 'firstName', confidence: 0.95 },
            { fieldId: 'email', profileKey: 'email', confidence: 0.95 }
          ]
        };
      }
      return { success: false };
    };

    const count = await autofillExtension({ fillAll: true, aiEnforced: true });
    assert.equal(count, 2);
    assert.equal(document.getElementById('first_name').value, 'Tanya');
    assert.equal(document.getElementById('email').value, 'tanyacs27@example.com');
  });

  test('SKEPTICAL TEST: Returns -2 when all candidate fields on the page already contain values', async () => {
    const { document, autofillExtension } = ctx;
    document.getElementById('first_name').value = 'Existing';
    document.getElementById('last_name').value = 'User';
    document.getElementById('email').value = 'existing@example.com';
    document.getElementById('why_us').value = 'Already answered.';

    const result = await autofillExtension({ fillAll: true, aiEnforced: true });
    assert.equal(result, -2, 'When all form fields are filled, should return -2 to alert user that form is already completed');
  });

  test('SKEPTICAL TEST: Overwrite mode re-populates fields even when all fields are already filled', async () => {
    const { document, storageState, autofillExtension } = ctx;
    document.getElementById('first_name').value = 'OldName';
    document.getElementById('last_name').value = 'OldLast';
    document.getElementById('email').value = 'old@example.com';
    document.getElementById('why_us').value = 'Old answer';

    storageState.profile = {
      firstName: 'NewAlex',
      lastName: 'NewMorgan',
      email: 'newalex@example.com',
      whyUs: 'New mission interest.'
    };

    const count = await autofillExtension({ fillAll: true, aiEnforced: true, overwrite: true });
    assert.equal(count, 4, `Expected all 4 fields overwritten, got: ${count}`);
    assert.equal(document.getElementById('first_name').value, 'NewAlex');
    assert.equal(document.getElementById('email').value, 'newalex@example.com');
    assert.equal(document.getElementById('why_us').value, 'New mission interest.');
  });

  test('SKEPTICAL TEST: AI Enforced Mode synthesizes essay when candidate has no pre-filled whyUs in profile', async () => {
    const { document, storageState, autofillExtension } = ctx;
    storageState.profile = {
      firstName: 'Tanya',
      lastName: 'Singh',
      email: 'tanyacs27@example.com',
      currentTitle: 'Software Engineer',
      currentCompany: 'Google'
    };

    const count = await autofillExtension({ fillAll: true, aiEnforced: true });
    assert.ok(count >= 4, `Expected at least 4 fields filled including synthesized essay, got: ${count}`);
    assert.equal(document.getElementById('first_name').value, 'Tanya');
    assert.ok(document.getElementById('why_us').value.length > 20, 'Why Us textarea should be populated with synthesized essay response');
    assert.ok(document.getElementById('why_us').value.includes('Software Engineer'), 'Synthesized essay should contain candidate title');
  });
});

