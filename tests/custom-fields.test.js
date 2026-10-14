const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const fieldDetectorCode = fs.readFileSync(path.join(__dirname, '../field-detector.js'), 'utf-8');
const backgroundCode = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf-8');
const contentCode = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf-8');

describe('Custom Fields & Profile Integrity Test Suite', () => {

  test('FieldDetector identifies canonical custom fields (workExperience, skills, education, yearsOfExperience)', () => {
    const dom = new JSDOM(`
      <form id="custom-test">
        <label for="f_exp">Relevant Work Experience</label>
        <textarea id="f_exp" name="work_experience"></textarea>

        <label for="f_yrs">Total Years of Experience</label>
        <input type="number" id="f_yrs" name="years_of_experience">

        <label for="f_skills">Technical Skills & Technologies</label>
        <textarea id="f_skills" name="skills"></textarea>

        <label for="f_edu">Highest Level of Education Completed</label>
        <input type="text" id="f_edu" name="education">

        <label for="f_cert">Professional Certifications</label>
        <input type="text" id="f_cert" name="certifications">
      </form>
    `, { runScripts: 'dangerously' });

    const { window } = dom;
    window.eval(fieldDetectorCode);
    const detector = window.FieldDetector;

    const fExp = window.document.getElementById('f_exp');
    const fYrs = window.document.getElementById('f_yrs');
    const fSkills = window.document.getElementById('f_skills');
    const fEdu = window.document.getElementById('f_edu');
    const fCert = window.document.getElementById('f_cert');

    const clsExp = detector.classify(fExp);
    assert.equal(clsExp.key, 'workExperience');

    const clsYrs = detector.classify(fYrs);
    assert.equal(clsYrs.key, 'yearsOfExperience');

    const clsSkills = detector.classify(fSkills);
    assert.equal(clsSkills.key, 'skills');

    const clsEdu = detector.classify(fEdu);
    assert.equal(clsEdu.key, 'education');

    const clsCert = detector.classify(fCert);
    assert.equal(clsCert.key, 'certifications');
  });

  test('FieldDetector.arbitrateSemanticFields resolves custom fields from profile.customFields and camelCase keys', () => {
    const dom = new JSDOM(`
      <form id="ats-form">
        <label for="exp_field">Describe your past work experience and systems built</label>
        <textarea id="exp_field"></textarea>

        <label for="niche_q">Security Clearance Level</label>
        <input type="text" id="niche_q">
      </form>
    `, { runScripts: 'dangerously' });

    const { window } = dom;
    window.eval(fieldDetectorCode);
    const detector = window.FieldDetector;

    const profile = {
      workExperience: '7 years engineering distributed cloud infrastructures at ScaleCorp.',
      customFields: [
        {
          id: 'cf_clearance',
          label: 'Security Clearance Level',
          key: 'securityClearance',
          value: 'Top Secret / SCI',
          multiline: false
        }
      ]
    };

    const fields = detector.getFields();
    const sft = detector.buildSemanticFormTree(fields);
    const result = detector.arbitrateSemanticFields(sft, profile, { minConfidence: 0.70 });

    assert.ok(result.mappings.length >= 2, 'Should map both work experience and custom clearance field');

    const expMap = result.mappings.find(m => m.profileKey === 'workExperience');
    assert.ok(expMap, 'Should map workExperience');

    const clearanceMap = result.mappings.find(m => m.profileKey === 'securityClearance' || m.profileKey === 'Security Clearance Level');
    assert.ok(clearanceMap, 'Should map clearance from customFields array');
  });

  test('background.js localSemanticArbiter matches custom fields and Distills customFields for Gemini Prompt API', async () => {
    const fakeChrome = {
      runtime: { onInstalled: { addListener: ()=>{} }, onMessage: { addListener: ()=>{} } },
      storage: { local: { get: async () => ({}), set: async () => {} } }
    };

    const bgFn = new Function('chrome', 'console', `${backgroundCode}; return { localSemanticArbiter, matchFieldsWithAi };`);
    const bgModule = bgFn(fakeChrome, console);

    const fields = [
      {
        id: 'f_work_exp',
        type: 'textarea',
        label: 'Summary of Work Experience',
        context: '',
        placeholder: 'Detail your past employment and achievements'
      },
      {
        id: 'f_pub',
        type: 'textarea',
        label: 'Academic Publications and Research',
        context: '',
        placeholder: ''
      }
    ];

    const profile = {
      workExperience: '5 years at Acme Corp leading frontend infrastructure.',
      customFields: [
        {
          id: 'cf_pub',
          label: 'Academic Publications and Research',
          key: 'publications',
          value: 'Authored 3 peer-reviewed IEEE papers on distributed consensus.'
        }
      ]
    };

    const result = bgModule.localSemanticArbiter(fields, profile);
    assert.ok(result.mappings.length >= 2, 'Local arbiter should match both custom fields');

    const expMapping = result.mappings.find(m => m.fieldId === 'f_work_exp');
    assert.equal(expMapping.profileKey, 'workExperience');

    const pubMapping = result.mappings.find(m => m.fieldId === 'f_pub');
    assert.ok(pubMapping.profileKey === 'publications' || pubMapping.profileKey === 'Academic Publications and Research');

    // Verify Prompt API distilled input includes custom fields
    let capturedPrompt = null;
    globalThis.LanguageModel = {
      availability: async () => 'readily',
      create: async () => ({
        prompt: async (userPrompt) => {
          capturedPrompt = userPrompt;
          return JSON.stringify({ mappings: [] });
        }
      })
    };

    try {
      await bgModule.matchFieldsWithAi(fields, profile);
      assert.ok(capturedPrompt, 'Prompt API should be invoked');
      assert.ok(capturedPrompt.includes('Academic Publications and Research') || capturedPrompt.includes('publications'), 'Prompt API prompt includes custom field');
    } finally {
      delete globalThis.LanguageModel;
    }
  });

  test('Autofill populates custom fields into matching inputs and textareas end-to-end', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <form id="job-app">
          <label for="cand_name">Full Name *</label>
          <input type="text" id="cand_name" name="name" required>

          <label for="cand_exp">Relevant Work Experience</label>
          <textarea id="cand_exp" name="work_experience"></textarea>

          <label for="cand_skills">Technical Skills</label>
          <input type="text" id="cand_skills" name="skills">

          <label for="cand_gpa">Cumulative GPA</label>
          <input type="text" id="cand_gpa" name="gpa">
        </form>
      </body>
      </html>
    `, { runScripts: 'dangerously', url: 'https://careers.example.com/apply' });

    const { window } = dom;

    const storageState = {
      profile: {
        firstName: 'Taylor',
        lastName: 'Swift',
        fullName: 'Taylor Swift',
        workExperience: '10 years software architecture delivering web platforms.',
        skills: 'JavaScript, TypeScript, React, Node.js, GraphQL',
        customFields: [
          {
            id: 'cf_gpa',
            label: 'Cumulative GPA',
            key: 'gpa',
            value: '3.95'
          }
        ]
      },
      fillAllMode: true,
      aiEnforcedMode: true
    };

    const bgFn = new Function('chrome', 'console', `${backgroundCode}; return { matchFieldsWithAi };`);
    const bgModule = bgFn({}, console);

    window.chrome = {
      runtime: {
        id: 'test-id',
        onInstalled: { addListener: ()=>{} },
        onMessage: { addListener: ()=>{} },
        sendMessage: async (msg) => {
          if (msg.action === 'aiMatchFields') {
            const res = await bgModule.matchFieldsWithAi(msg.fields, msg.profile, msg.options || {});
            return { success: true, mappings: res.mappings || [] };
          }
          return { success: true };
        }
      },
      storage: {
        local: {
          get: async () => storageState,
          set: async () => {}
        }
      }
    };

    window.eval(fieldDetectorCode);
    window.eval(contentCode);

    const count = await window.autofillExtension({ profile: storageState.profile, fillAll: true, aiEnforced: true });
    assert.ok(count >= 3, `Expected at least 3 fields filled, got ${count}`);

    const expEl = window.document.getElementById('cand_exp');
    const skillsEl = window.document.getElementById('cand_skills');
    const gpaEl = window.document.getElementById('cand_gpa');

    assert.equal(expEl.value, storageState.profile.workExperience);
    assert.equal(skillsEl.value, storageState.profile.skills);
    assert.equal(gpaEl.value, '3.95');
  });

  test('Page change events do NOT mutate or scrape data back into stored profile (Profile Integrity Protection)', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <form id="application">
          <label for="inp_name">First Name</label>
          <input type="text" id="inp_name" name="firstName" value="Initial">
        </form>
      </body>
      </html>
    `, { runScripts: 'dangerously', url: 'https://careers.example.com/apply' });

    const { window } = dom;

    let storageSetCalled = false;
    const initialProfile = { firstName: 'OriginalUser', email: 'user@example.com' };

    window.chrome = {
      runtime: {
        id: 'test-id',
        onInstalled: { addListener: ()=>{} },
        onMessage: { addListener: ()=>{} }
      },
      storage: {
        local: {
          get: async () => ({ profile: initialProfile }),
          set: async () => {
            storageSetCalled = true;
          }
        }
      }
    };

    window.eval(fieldDetectorCode);
    window.eval(contentCode);

    const input = window.document.getElementById('inp_name');
    input.value = 'DifferentCandidateNameForSomeoneElse';
    input.dispatchEvent(new window.Event('change', { bubbles: true }));

    // Wait 50ms to ensure no async listener executes storage.set
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.equal(storageSetCalled, false, 'Storage.set must NEVER be called by page input change events!');
    assert.equal(initialProfile.firstName, 'OriginalUser', 'Original profile must remain untouched!');
  });

  test('saveFormDataExtension does NOT mutate stored profile data', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <form id="application">
          <input type="text" id="inp_email" name="email" value="someone.else@other.org">
        </form>
      </body>
      </html>
    `, { runScripts: 'dangerously', url: 'https://careers.example.com/apply' });

    const { window } = dom;

    let storageSetCalled = false;
    window.chrome = {
      runtime: { id: 'test-id', onInstalled: { addListener: ()=>{} }, onMessage: { addListener: ()=>{} } },
      storage: {
        local: {
          get: async () => ({ profile: { email: 'my.real.email@example.com' } }),
          set: async () => { storageSetCalled = true; }
        }
      }
    };

    window.eval(fieldDetectorCode);
    window.eval(contentCode);

    assert.equal(typeof window.saveFormDataExtension, 'function');
    const result = await window.saveFormDataExtension();
    assert.equal(result, 0, 'saveFormDataExtension should return 0 (read-only no-op)');
    assert.equal(storageSetCalled, false, 'saveFormDataExtension must not call storage.local.set');
  });

});
