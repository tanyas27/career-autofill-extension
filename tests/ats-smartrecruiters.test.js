const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const fieldDetectorCode = fs.readFileSync(path.join(__dirname, '../field-detector.js'), 'utf-8');
const backgroundCode = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf-8');

function setupSmartRecruitersPage() {
  const dom = new JSDOM(`<!DOCTYPE html><html><head><title>SmartRecruiters Job Portal</title></head><body></body></html>`, {
    runScripts: 'dangerously',
    url: 'https://jobs.smartrecruiters.com/AcmeCorp/12345-senior-frontend-engineer'
  });

  const { window } = dom;
  const { document } = window;

  // Polyfill Custom Elements for SmartRecruiters Web Components
  class SplBaseElement extends window.HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }
  }

  class SplInput extends SplBaseElement {
    connectedCallback() {
      this.shadowRoot.innerHTML = `<input type="text" class="spl-native-input">`;
    }
  }

  class SplTextarea extends SplBaseElement {
    connectedCallback() {
      this.shadowRoot.innerHTML = `<textarea class="spl-native-textarea"></textarea>`;
    }
  }

  class SplCheckbox extends SplBaseElement {
    connectedCallback() {
      this.shadowRoot.innerHTML = `<input type="checkbox" class="spl-native-checkbox">`;
    }
  }

  class SplDateField extends SplBaseElement {
    connectedCallback() {
      this.shadowRoot.innerHTML = `<spl-date-picker></spl-date-picker>`;
      const picker = this.shadowRoot.querySelector('spl-date-picker');
      picker.attachShadow({ mode: 'open' });
      picker.shadowRoot.innerHTML = `<input type="text" class="spl-native-date">`;
    }
  }

  window.customElements.define('spl-input', SplInput);
  window.customElements.define('spl-textarea', SplTextarea);
  window.customElements.define('spl-checkbox', SplCheckbox);
  window.customElements.define('spl-date-field', SplDateField);

  document.body.innerHTML = `
    <form id="sr-application-form">
      <!-- First Name -->
      <div class="field-container">
        <label for="sr-fn">First Name *</label>
        <spl-input id="sr-fn" required label="First Name"></spl-input>
      </div>

      <!-- Last Name -->
      <div class="field-container">
        <label for="sr-ln">Last Name *</label>
        <spl-input id="sr-ln" required label="Last Name"></spl-input>
      </div>

      <!-- Email -->
      <div class="field-container">
        <label for="sr-email">Email Address *</label>
        <spl-input id="sr-email" required label="Email Address"></spl-input>
      </div>

      <!-- Phone -->
      <div class="field-container">
        <label for="sr-phone">Phone Number *</label>
        <spl-input id="sr-phone" required label="Phone Number"></spl-input>
      </div>

      <!-- Cover Letter Textarea Component -->
      <div class="field-container">
        <label for="sr-cl">Cover Letter / Message to Hiring Team</label>
        <spl-textarea id="sr-cl" label="Cover Letter"></spl-textarea>
      </div>

      <!-- Why Us Textarea Component -->
      <div class="field-container">
        <label for="sr-why">Why are you interested in joining AcmeCorp?</label>
        <spl-textarea id="sr-why" label="Why are you interested in joining AcmeCorp"></spl-textarea>
      </div>

      <!-- Date Component -->
      <div class="field-container">
        <label for="sr-start">Earliest Start Date</label>
        <spl-date-field id="sr-start" label="Earliest Start Date"></spl-date-field>
      </div>

      <!-- Checkbox Component -->
      <div class="field-container">
        <label for="sr-agree">I confirm all submitted information is accurate *</label>
        <spl-checkbox id="sr-agree" required></spl-checkbox>
      </div>
    </form>
  `;

  window.eval(fieldDetectorCode);

  const bgFn = new Function('chrome', 'console', `${backgroundCode}; return { matchFieldsWithAi };`);
  const { matchFieldsWithAi } = bgFn({
    runtime: { onInstalled: { addListener: ()=>{} }, onMessage: { addListener: ()=>{} } }
  }, console);

  return {
    window,
    document,
    FieldDetector: window.FieldDetector,
    matchFieldsWithAi
  };
}

describe('ATS Fixture: SmartRecruiters Web Components & Shadow DOM - Skeptical Tester Audit', () => {
  let ctx;
  const profile = {
    firstName: 'Jordan',
    lastName: 'Lee',
    fullName: 'Jordan Lee',
    email: 'jordan.lee@example.com',
    phone: '+1 (555) 456-7890',
    whyUs: 'I am excited by AcmeCorp scale and open-source contributions.',
    coverLetter: 'Dear Hiring Manager, Please consider my application for the Senior Frontend Engineer role.'
  };

  beforeEach(() => {
    ctx = setupSmartRecruitersPage();
  });

  test('discovers all custom SmartRecruiters web components (spl-*) on the page', () => {
    const { FieldDetector } = ctx;
    const fields = FieldDetector.getFields();
    assert.ok(fields.length >= 7, `Expected at least 7 custom elements, found ${fields.length}`);
  });

  test('SKEPTICAL TEST: Sets values through Shadow DOM barriers into inner native inputs', () => {
    const { document, FieldDetector } = ctx;
    const fnElement = document.getElementById('sr-fn');
    const ok = FieldDetector.setValue(fnElement, 'Jordan');
    assert.equal(ok, true);
    assert.equal(fnElement.getAttribute('value'), 'Jordan');

    const innerInput = fnElement.shadowRoot.querySelector('input');
    assert.ok(innerInput, 'Inner input must exist in shadow root');
    assert.equal(innerInput.value, 'Jordan', 'Inner native input value must be updated');
  });

  test('SKEPTICAL TEST: Sets value on spl-textarea and spl-checkbox', () => {
    const { document, FieldDetector } = ctx;
    const clElement = document.getElementById('sr-cl');
    const agreeElement = document.getElementById('sr-agree');

    const okCl = FieldDetector.setValue(clElement, profile.coverLetter);
    assert.equal(okCl, true);
    const innerTextarea = clElement.shadowRoot.querySelector('textarea');
    assert.equal(innerTextarea.value, profile.coverLetter);

    const okAgree = FieldDetector.setValue(agreeElement, true);
    assert.equal(okAgree, true);
    const innerCheckbox = agreeElement.shadowRoot.querySelector('input[type="checkbox"]');
    assert.equal(innerCheckbox.checked, true);
  });

  test('SKEPTICAL TEST: AI Enforced Mode resolves SmartRecruiters form fields', async () => {
    const { document, FieldDetector, matchFieldsWithAi } = ctx;
    const fields = FieldDetector.getFields();
    const sft = FieldDetector.buildSemanticFormTree(fields);

    const result = await matchFieldsWithAi(sft, profile, { aiEnforced: true });
    assert.ok(result.mappings?.length >= 5);

    for (const m of result.mappings) {
      const el = document.querySelector(`[data-ca-field-id="${m.fieldId}"]`);
      assert.ok(el);
      const val = m.selectedOption || profile[m.profileKey];
      if (val) {
        FieldDetector.setValue(el, val);
      }
    }

    assert.equal(document.getElementById('sr-fn').shadowRoot.querySelector('input').value, 'Jordan');
    assert.equal(document.getElementById('sr-ln').shadowRoot.querySelector('input').value, 'Lee');
    assert.equal(document.getElementById('sr-email').shadowRoot.querySelector('input').value, 'jordan.lee@example.com');
    assert.equal(document.getElementById('sr-cl').shadowRoot.querySelector('textarea').value, profile.coverLetter);
    assert.equal(document.getElementById('sr-why').shadowRoot.querySelector('textarea').value, profile.whyUs);
  });
});
