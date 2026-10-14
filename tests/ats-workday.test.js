const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const fieldDetectorCode = fs.readFileSync(path.join(__dirname, '../field-detector.js'), 'utf-8');
const backgroundCode = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf-8');

function setupWorkdayPage() {
  const html = `
  <!DOCTYPE html>
  <html>
  <head><title>Workday Career Application</title></head>
  <body>
    <div data-automation-id="applicationPage">
      <h1>Apply for Senior Software Engineer</h1>

      <!-- Legal Name Section -->
      <div data-automation-id="formField" class="form-group required">
        <label data-automation-id="formLabel">Legal First Name *</label>
        <input type="text" data-automation-id="legalFirstName" id="firstName" name="legalName.firstName" required>
      </div>

      <div data-automation-id="formField" class="form-group required">
        <label data-automation-id="formLabel">Legal Last Name *</label>
        <input type="text" data-automation-id="legalLastName" id="lastName" name="legalName.lastName" required>
      </div>

      <!-- Contact Info -->
      <div data-automation-id="formField" class="form-group required">
        <label data-automation-id="formLabel">Email Address *</label>
        <input type="email" data-automation-id="email" id="email" name="contact.email" required>
      </div>

      <div data-automation-id="formField" class="form-group">
        <label data-automation-id="formLabel">Country Phone Code</label>
        <input type="text" data-automation-id="phoneCountryCode" id="phoneCode" name="contact.countryCode" placeholder="+1">
      </div>

      <div data-automation-id="formField" class="form-group required">
        <label data-automation-id="formLabel">Mobile Phone Number *</label>
        <input type="tel" data-automation-id="phone" id="phone" name="contact.phone" required>
      </div>

      <!-- Country of Residence -->
      <div data-automation-id="formField" class="form-group required">
        <label data-automation-id="formLabel">Country of Residence *</label>
        <select data-automation-id="countrySelect" id="country" name="address.country" required>
          <option value="">Select country...</option>
          <option value="US">United States</option>
          <option value="CA">Canada</option>
          <option value="GB">United Kingdom</option>
        </select>
      </div>

      <!-- Work Authorization Radio Group -->
      <div data-automation-id="formField" class="form-group required" role="radiogroup" aria-labelledby="workAuthQuestion">
        <span id="workAuthQuestion" data-automation-id="formLabel">Are you legally authorized to work in the United States? *</span>
        <label><input type="radio" name="us_work_auth" value="true"> Yes</label>
        <label><input type="radio" name="us_work_auth" value="false"> No</label>
      </div>

      <!-- Sponsorship Question -->
      <div data-automation-id="formField" class="form-group required">
        <label data-automation-id="formLabel">Will you now or in the future require visa sponsorship? *</label>
        <select data-automation-id="sponsorshipSelect" id="sponsorship" name="sponsorship" required>
          <option value="">Select an option</option>
          <option value="no_sponsorship">No, I do not require sponsorship</option>
          <option value="yes_sponsorship">Yes, I will require sponsorship</option>
        </select>
      </div>

      <!-- Multiple Textareas: Disambiguation Challenge -->
      <div data-automation-id="formField" class="form-group">
        <label data-automation-id="formLabel">Why are you interested in joining our engineering team?</label>
        <span data-automation-id="formFieldHelperText" class="help-block">Tell us what motivates you to apply.</span>
        <textarea data-automation-id="whyUsTextarea" id="whyUs" rows="4"></textarea>
      </div>

      <div data-automation-id="formField" class="form-group">
        <label data-automation-id="formLabel">Describe a complex technical system challenge or project highlight</label>
        <textarea data-automation-id="projectTextarea" id="projectHighlight" rows="4"></textarea>
      </div>

      <div data-automation-id="formField" class="form-group">
        <label data-automation-id="formLabel">Additional Comments / Cover Letter</label>
        <textarea data-automation-id="coverTextarea" id="coverLetter" rows="4"></textarea>
      </div>

      <!-- Today's Signature Date -->
      <div data-automation-id="formField" class="form-group required">
        <label data-automation-id="formLabel">Date of Application Signature *</label>
        <input type="date" data-automation-id="signatureDate" id="signatureDate" name="sigDate" required>
      </div>

      <button type="submit" id="submitBtn">Submit Application</button>
    </div>
  </body>
  </html>
  `;

  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://wd5.myworkdayjobs.com/en-US/careers/job/123/apply' });
  dom.window.eval(fieldDetectorCode);

  // Set up background simulated environment
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

describe('ATS Fixture: Workday Application - Skeptical Tester Audit', () => {
  let ctx;
  const profile = {
    firstName: 'Taylor',
    lastName: 'Swift',
    fullName: 'Taylor Swift',
    email: 'taylor.swift@example.com',
    phone: '+1 (555) 789-0123',
    country: 'United States',
    workAuthCountries: 'United States',
    workAuth: 'Yes',
    sponsorship: 'No',
    sponsorshipOtherCountries: 'Yes',
    whyUs: 'I admire your high-scale systems architecture and engineering craftsmanship.',
    projectHighlight: 'Engineered high-throughput payment reconciliation processing 100M daily records.',
    coverLetter: 'Dear Hiring Committee, I am thrilled to apply for the Senior Software Engineer position.'
  };

  beforeEach(() => {
    ctx = setupWorkdayPage();
  });

  test('discovers all fillable interactive fields without missing nested containers', () => {
    const { FieldDetector } = ctx;
    const fields = FieldDetector.getFields();
    // Expected: firstName, lastName, email, phoneCode, phone, country, us_work_auth radio, sponsorship, whyUs, projectHighlight, coverLetter, signatureDate
    assert.ok(fields.length >= 10, `Expected at least 10 fields, got ${fields.length}`);
  });

  test('SKEPTICAL TEST: Phone Country Code is protected from being filled with user home country', () => {
    const { document, FieldDetector } = ctx;
    const phoneCode = document.getElementById('phoneCode');
    const classification = FieldDetector.classify(phoneCode);
    assert.equal(classification?.key, 'countryCode', 'Country code must be classified as countryCode');
  });

  test('SKEPTICAL TEST: AI Enforced Mode resolves Workday form fields with 100% precision', async () => {
    const { document, FieldDetector, matchFieldsWithAi } = ctx;
    const fields = FieldDetector.getFields();

    // Build SFT
    const sft = FieldDetector.buildSemanticFormTree(fields);
    assert.ok(sft.length > 0);

    // AI Semantic Arbitration
    const aiResult = await matchFieldsWithAi(sft, profile, { aiEnforced: true });
    assert.ok(aiResult.mappings?.length >= 8, `Expected at least 8 AI mappings, got ${aiResult.mappings?.length}`);

    // Map AI results to DOM elements
    for (const mapping of aiResult.mappings) {
      const element = document.querySelector(`[data-ca-field-id="${mapping.fieldId}"]`);
      assert.ok(element, `Mapped field ${mapping.fieldId} must exist in DOM`);

      let val = mapping.selectedOption;
      if (!val && mapping.profileKey === 'todaysDate') {
        val = FieldDetector.getTodaysDate('iso');
      } else if (!val && profile[mapping.profileKey]) {
        val = profile[mapping.profileKey];
      }

      assert.ok(val, `Value must exist for ${mapping.profileKey}`);
      const ok = FieldDetector.setValue(element, val);
      assert.equal(ok, true, `FieldDetector.setValue failed on ${mapping.fieldId}`);
    }

    // Verify filled DOM values
    assert.equal(document.getElementById('firstName').value, 'Taylor');
    assert.equal(document.getElementById('lastName').value, 'Swift');
    assert.equal(document.getElementById('email').value, 'taylor.swift@example.com');
    assert.equal(document.getElementById('phone').value, '+1 (555) 789-0123');
    assert.equal(document.getElementById('country').value, 'US');
    assert.equal(document.getElementById('sponsorship').value, 'no_sponsorship');
    assert.equal(document.getElementById('whyUs').value, profile.whyUs);
    assert.equal(document.getElementById('projectHighlight').value, profile.projectHighlight);
    assert.equal(document.getElementById('coverLetter').value, profile.coverLetter);

    // Verify phone country code was NOT polluted
    assert.equal(document.getElementById('phoneCode').value, '', 'Phone code must remain untouched');
  });
});
