const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const fieldDetectorCode = fs.readFileSync(path.join(__dirname, '../field-detector.js'), 'utf-8');
const backgroundCode = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf-8');

function setupGreenhousePage() {
  const html = `
  <!DOCTYPE html>
  <html>
  <head><title>Greenhouse Job Application</title></head>
  <body>
    <form id="application_form">
      <div class="field">
        <label for="first_name">First Name <span class="asterisk">*</span></label>
        <input type="text" id="first_name" name="job_application[first_name]" required autocomplete="given-name">
      </div>

      <div class="field">
        <label for="last_name">Last Name <span class="asterisk">*</span></label>
        <input type="text" id="last_name" name="job_application[last_name]" required autocomplete="family-name">
      </div>

      <div class="field">
        <label for="email">Email <span class="asterisk">*</span></label>
        <input type="email" id="email" name="job_application[email]" required autocomplete="email">
      </div>

      <div class="field">
        <label for="phone">Phone <span class="asterisk">*</span></label>
        <input type="tel" id="phone" name="job_application[phone]" required autocomplete="tel">
      </div>

      <!-- File inputs (must be ignored by field detector) -->
      <div class="field">
        <label for="resume">Resume / CV <span class="asterisk">*</span></label>
        <input type="file" id="resume" name="job_application[resume]">
      </div>

      <!-- Social Links -->
      <div class="field">
        <label for="linkedin">LinkedIn Profile</label>
        <input type="url" id="linkedin" name="job_application[answers][linkedin]">
      </div>

      <div class="field">
        <label for="github">GitHub Profile</label>
        <input type="url" id="github" name="job_application[answers][github]">
      </div>

      <div class="field">
        <label for="website">Portfolio / Personal Website</label>
        <input type="url" id="website" name="job_application[answers][website]">
      </div>

      <!-- Custom Questions (Greenhouse style) -->
      <div class="field">
        <label for="why_us">Why are you excited to work at this company? <span class="asterisk">*</span></label>
        <textarea id="why_us" name="job_application[answers][why_us]" required></textarea>
      </div>

      <div class="field">
        <label for="technical_project">Tell us about an impactful technical system you designed or built</label>
        <textarea id="technical_project" name="job_application[answers][technical_project]"></textarea>
      </div>

      <!-- Country specific work authorization select -->
      <div class="field">
        <label for="work_auth">Are you legally authorized to work in the United States? <span class="asterisk">*</span></label>
        <select id="work_auth" name="job_application[answers][work_auth]" required>
          <option value="">-- Please select --</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </div>

      <!-- Sponsorship Select -->
      <div class="field">
        <label for="sponsorship">Will you now or in the future require visa sponsorship for employment in the United States? <span class="asterisk">*</span></label>
        <select id="sponsorship" name="job_application[answers][sponsorship]" required>
          <option value="">-- Please select --</option>
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </div>

      <!-- Salary Expectations -->
      <div class="field">
        <label for="salary">Desired Compensation / Salary Expectations</label>
        <input type="text" id="salary" name="job_application[answers][salary]">
      </div>
    </form>
  </body>
  </html>
  `;

  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://boards.greenhouse.io/stripe/jobs/456789' });
  dom.window.eval(fieldDetectorCode);

  const bgFn = new Function('chrome', 'console', `${backgroundCode}; return { matchFieldsWithAi };`);
  const { matchFieldsWithAi } = bgFn({
    runtime: { onInstalled: { addListener: ()=>{} }, onMessage: { addListener: ()=>{} } }
  }, console);

  return {
    window: dom.window,
    document: dom.window.document,
    FieldDetector: dom.window.FieldDetector,
    matchFieldsWithAi
  };
}

describe('ATS Fixtures: Greenhouse & Lever Portals - Skeptical Tester Audit', () => {
  let ctx;
  const profile = {
    firstName: 'Morgan',
    lastName: 'Riley',
    fullName: 'Morgan Riley',
    email: 'morgan.riley@example.com',
    phone: '+1 (555) 987-6543',
    country: 'United States',
    workAuthCountries: 'United States',
    workAuth: 'Yes',
    sponsorship: 'No',
    linkedin: 'https://linkedin.com/in/morganriley',
    github: 'https://github.com/morganriley',
    portfolio: 'https://morganriley.dev',
    whyUs: 'I am excited by the mission to power the economic engine of the internet.',
    projectHighlight: 'Built an open-source real-time distributed tracing platform handling 1B spans/day.',
    salaryExpectations: '$180,000 USD'
  };

  beforeEach(() => {
    ctx = setupGreenhousePage();
  });

  test('ignores file input type="file" completely', () => {
    const { document, FieldDetector } = ctx;
    const fields = FieldDetector.getFields();
    const resumeField = document.getElementById('resume');
    assert.equal(fields.includes(resumeField), false, 'File inputs must never be treated as autofillable text fields');
  });

  test('identifies mandatory fields marked with asterisk span', () => {
    const { document, FieldDetector } = ctx;
    assert.equal(FieldDetector.isMandatory(document.getElementById('first_name')), true);
    assert.equal(FieldDetector.isMandatory(document.getElementById('why_us')), true);
    assert.equal(FieldDetector.isMandatory(document.getElementById('salary')), false);
  });

  test('SKEPTICAL TEST: AI Enforced Mode completes Greenhouse form with zero errors', async () => {
    const { document, FieldDetector, matchFieldsWithAi } = ctx;
    const fields = FieldDetector.getFields();
    const sft = FieldDetector.buildSemanticFormTree(fields);

    const aiResult = await matchFieldsWithAi(sft, profile, { aiEnforced: true });
    assert.ok(aiResult.mappings?.length >= 9, `Expected at least 9 mappings, got ${aiResult.mappings?.length}`);

    for (const mapping of aiResult.mappings) {
      const el = document.querySelector(`[data-ca-field-id="${mapping.fieldId}"]`);
      assert.ok(el);
      const val = mapping.selectedOption || profile[mapping.profileKey];
      if (val) {
        FieldDetector.setValue(el, val);
      }
    }

    assert.equal(document.getElementById('first_name').value, 'Morgan');
    assert.equal(document.getElementById('last_name').value, 'Riley');
    assert.equal(document.getElementById('email').value, 'morgan.riley@example.com');
    assert.equal(document.getElementById('phone').value, '+1 (555) 987-6543');
    assert.equal(document.getElementById('linkedin').value, profile.linkedin);
    assert.equal(document.getElementById('github').value, profile.github);
    assert.equal(document.getElementById('website').value, profile.portfolio);
    assert.equal(document.getElementById('why_us').value, profile.whyUs);
    assert.equal(document.getElementById('technical_project').value, profile.projectHighlight);
    assert.equal(document.getElementById('work_auth').value, 'Yes');
    assert.equal(document.getElementById('sponsorship').value, 'No');
    assert.equal(document.getElementById('salary').value, profile.salaryExpectations);
  });
});
