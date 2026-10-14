const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Read field-detector.js code
const fieldDetectorCode = fs.readFileSync(path.join(__dirname, '../field-detector.js'), 'utf-8');

function setupDOM(html = '<!DOCTYPE html><html><body></body></html>') {
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  dom.window.eval(fieldDetectorCode);
  return {
    window: dom.window,
    document: dom.window.document,
    FieldDetector: dom.window.FieldDetector
  };
}

describe('FieldDetector - Skeptical Tester Audit', () => {
  let ctx;

  beforeEach(() => {
    ctx = setupDOM();
  });

  describe('Text Normalization', () => {
    test('normalizes punctuation, special characters, and extra spaces', () => {
      const { FieldDetector } = ctx;
      assert.equal(FieldDetector.normalize('  First Name* : '), 'first name');
      assert.equal(FieldDetector.normalize('Why Us? (Required)'), 'why us required');
      assert.equal(FieldDetector.normalize('Street Address, Apt / Suite #'), 'street address apt suite #');
      assert.equal(FieldDetector.normalize(null), '');
      assert.equal(FieldDetector.normalize(undefined), '');
    });
  });

  describe('Field Classification', () => {
    test('correctly classifies standard contact fields', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `
        <form>
          <label for="fn">First Name</label>
          <input id="fn" type="text" name="first_name" required>

          <label for="ln">Last Name</label>
          <input id="ln" type="text" name="last_name" required>

          <label for="em">Email Address</label>
          <input id="em" type="email" name="email" required>

          <label for="ph">Phone Number</label>
          <input id="ph" type="tel" name="phone">
        </form>
      `;

      const fn = document.getElementById('fn');
      const ln = document.getElementById('ln');
      const em = document.getElementById('em');
      const ph = document.getElementById('ph');

      assert.equal(FieldDetector.classify(fn)?.key, 'firstName');
      assert.equal(FieldDetector.classify(ln)?.key, 'lastName');
      assert.equal(FieldDetector.classify(em)?.key, 'email');
      assert.equal(FieldDetector.classify(ph)?.key, 'phone');
    });

    test('SKEPTICAL TEST: Country Code input must NOT be classified as country', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `
        <form>
          <label for="cc">Country Code</label>
          <input id="cc" type="text" name="countryCode" placeholder="+1">

          <label for="country">Country of Residence</label>
          <input id="country" type="text" name="country">
        </form>
      `;

      const cc = document.getElementById('cc');
      const country = document.getElementById('country');

      const ccClass = FieldDetector.classify(cc);
      const countryClass = FieldDetector.classify(country);

      assert.equal(countryClass?.key, 'country', 'Country field should classify as country');
      // SKEPTICAL AUDIT: Does cc classify as countryCode? Or does it erroneously classify as country?
      assert.equal(ccClass?.key, 'countryCode', `countryCode field must classify as countryCode, but got: ${ccClass?.key}`);
    });

    test('SKEPTICAL TEST: Distinguishes multiple textareas for long-form answers', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `
        <form>
          <label for="cl">Cover Letter / Note to Hiring Manager</label>
          <textarea id="cl"></textarea>

          <label for="wu">Why do you want to work at this company?</label>
          <textarea id="wu"></textarea>

          <label for="tp">Describe your proudest technical achievement or project</label>
          <textarea id="tp"></textarea>

          <label for="bio">Tell us about yourself (Brief Bio)</label>
          <textarea id="bio"></textarea>
        </form>
      `;

      const cl = document.getElementById('cl');
      const wu = document.getElementById('wu');
      const tp = document.getElementById('tp');
      const bio = document.getElementById('bio');

      assert.equal(FieldDetector.classify(cl)?.key, 'coverLetter');
      assert.equal(FieldDetector.classify(wu)?.key, 'whyUs');
      assert.equal(FieldDetector.classify(tp)?.key, 'projectHighlight');
      assert.equal(FieldDetector.classify(bio)?.key, 'aboutMe');
    });
  });

  describe('Mandatory Field Detection', () => {
    test('detects HTML5 required, aria-required, asterisk labels, and class markers', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `
        <form>
          <input id="f1" type="text" required>
          <input id="f2" type="text" aria-required="true">
          <input id="f3" type="text" class="required">
          <label for="f4">First Name <span class="asterisk">*</span></label>
          <input id="f4" type="text">
          <label for="f5">City (optional)</label>
          <input id="f5" type="text">
        </form>
      `;

      assert.equal(FieldDetector.isMandatory(document.getElementById('f1')), true);
      assert.equal(FieldDetector.isMandatory(document.getElementById('f2')), true);
      assert.equal(FieldDetector.isMandatory(document.getElementById('f3')), true);
      assert.equal(FieldDetector.isMandatory(document.getElementById('f4')), true);
      assert.equal(FieldDetector.isMandatory(document.getElementById('f5')), false);
    });

    test('SKEPTICAL TEST: detects mandatory status from CSS pseudo-element asterisks', () => {
      const { document, window, FieldDetector } = ctx;
      document.body.innerHTML = `
        <form>
          <label id="l1" for="f1">First Name</label>
          <input id="f1" type="text">
        </form>
      `;
      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = (el, pseudo) => {
        if (el.id === 'l1' && pseudo === '::after') {
          return { content: '"*"' };
        }
        return { content: 'none' };
      };
      try {
        assert.equal(FieldDetector.isMandatory(document.getElementById('f1')), true);
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });
  });

  describe('Readonly & Interactive Field Discovery', () => {
    test('SKEPTICAL TEST: retains readonly comboboxes and dropdowns while excluding static readonly fields', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `
        <form>
          <!-- Workday / Oracle style interactive combobox -->
          <input id="wd_combo" type="text" readonly role="combobox" aria-haspopup="listbox">
          <!-- Normal static readonly text -->
          <input id="static_ro" type="text" readonly value="Fixed Reference ID">
          <!-- Standard editable input -->
          <input id="normal_inp" type="text" name="firstName">
        </form>
      `;
      const fields = FieldDetector.getFields(document);
      const fieldIds = fields.map(f => f.id);
      assert.ok(fieldIds.includes('wd_combo'), 'Interactive readonly combobox must be included in getFields()');
      assert.ok(fieldIds.includes('normal_inp'), 'Editable input must be included in getFields()');
      assert.ok(!fieldIds.includes('static_ro'), 'Static readonly input must be excluded from getFields()');
    });

    test('SKEPTICAL TEST: treats placeholder strings as empty in getValue()', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `
        <select id="sel_ph">
          <option value="">Select an option...</option>
          <option value="usa">United States</option>
        </select>
        <input id="combo_ph" type="text" role="combobox" value="Choose an option">
        <input id="inp_ph" type="text" placeholder="First Name" value="First Name">
      `;
      const sel = document.getElementById('sel_ph');
      const combo = document.getElementById('combo_ph');
      const inp = document.getElementById('inp_ph');
      assert.equal(FieldDetector.getValue(sel), '');
      assert.equal(FieldDetector.getValue(combo), '');
      assert.equal(FieldDetector.getValue(inp), '');
    });
  });

  describe('Setting Values (DOM Interaction & Framework State)', () => {
    test('sets standard text input value and dispatches input, change, blur events', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `<input id="name" type="text">`;
      const input = document.getElementById('name');

      let inputFired = false;
      let changeFired = false;
      input.addEventListener('input', () => { inputFired = true; });
      input.addEventListener('change', () => { changeFired = true; });

      const ok = FieldDetector.setValue(input, 'Alex Morgan');
      assert.equal(ok, true);
      assert.equal(input.value, 'Alex Morgan');
      assert.equal(inputFired, true);
      assert.equal(changeFired, true);
    });

    test('SKEPTICAL TEST: Sets value on <input role="combobox">', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `<input id="combo" role="combobox" value="">`;
      const input = document.getElementById('combo');

      const ok = FieldDetector.setValue(input, 'San Francisco, CA');
      assert.equal(ok, true);
      assert.equal(input.value, 'San Francisco, CA', '<input role="combobox"> must have its .value set, not just textContent');
    });

    test('SKEPTICAL TEST: Select matching with underscores or special value formats', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `
        <select id="sponsorship">
          <option value="">Please select an option</option>
          <option value="no_sponsorship">I will not require sponsorship</option>
          <option value="yes_sponsorship">I require sponsorship</option>
        </select>
      `;
      const select = document.getElementById('sponsorship');

      const ok = FieldDetector.setValue(select, 'No');
      assert.equal(ok, true);
      assert.equal(select.value, 'no_sponsorship', 'Select should match "No" to "no_sponsorship" or "I will not require sponsorship"');
    });

    test('sets radio button value in a named radio group', () => {
      const { document, FieldDetector } = ctx;
      document.body.innerHTML = `
        <form>
          <label><input type="radio" name="work_auth" value="yes"> Yes, authorized</label>
          <label><input type="radio" name="work_auth" value="no"> No, not authorized</label>
        </form>
      `;
      const radio = document.querySelector('input[type="radio"]');

      const ok = FieldDetector.setValue(radio, 'Yes');
      assert.equal(ok, true);
      const checked = document.querySelector('input[type="radio"]:checked');
      assert.ok(checked);
      assert.equal(checked.value, 'yes');
    });
  });

  describe('Country-Aware Work Authorization', () => {
    test('correctly evaluates authorization for specific country mentioned in question', () => {
      const { FieldDetector } = ctx;
      const profile = {
        workAuthCountries: 'United States, Canada',
        country: 'United States',
        workAuth: 'Yes',
        sponsorship: 'No',
        sponsorshipOtherCountries: 'Yes'
      };

      // Question mentioning United States
      const usCheck = FieldDetector.evaluateCountryWorkAuth('Are you authorized to work in the United States?', profile);
      assert.equal(usCheck.hasCountryContext, true);
      assert.equal(usCheck.isAuthorized, true);

      // Question mentioning Germany
      const deCheck = FieldDetector.evaluateCountryWorkAuth('Are you legally eligible to work in Germany without restriction?', profile);
      assert.equal(deCheck.hasCountryContext, true);
      assert.equal(deCheck.isAuthorized, false);

      // Generic question with no country
      const genericCheck = FieldDetector.evaluateCountryWorkAuth('Are you legally authorized to work?', profile);
      assert.equal(genericCheck.hasCountryContext, false);
    });
  });
});
