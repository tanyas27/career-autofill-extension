const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('ATS Fixture: Virtusa, SelectMinds & Oracle Taleo (OTAC) - Skeptical Tester Audit', () => {
  let dom;
  let window;
  let document;
  let FieldDetector;
  let bg;

  const mockProfile = {
    firstName: 'Devon',
    lastName: 'Vance',
    fullName: 'Devon Vance',
    email: 'devon.vance@example.com',
    phone: '555-876-5432',
    address: '100 Technology Parkway',
    city: 'Reston',
    state: 'Virginia',
    zipCode: '20190',
    country: 'United States',
    workAuth: 'Yes',
    sponsorship: 'No',
    whyUs: 'Excited by Virtusa deep digital engineering and cloud transformation footprint across global enterprises.',
    projectHighlight: 'Architected high-scale Kafka ingestion pipeline processing 50M events daily with 99.99% uptime.'
  };

  beforeEach(() => {
    // Model realistic Virtusa / SelectMinds / Oracle Taleo (OTAC) application page
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Data Engineer - Virtusa Careers (SelectMinds OTAC)</title>
      </head>
      <body>
        <div id="portal-header">
          <h1>Data Engineer - Healthcare</h1>
          <div class="job-meta">Chennai, India | Job ID: 79947</div>
        </div>

        <!-- Embedded Taleo Application Frame / Form Container -->
        <div id="apply-modal-otac" class="taleo-container">
          <form id="requisitionForm" name="requisitionForm">
            <table class="form-table" border="0" cellpadding="4">
              <tbody>
                <!-- Table layout: First Name with label in left td -->
                <tr class="form-row">
                  <td class="labelcell">
                    First Name <span class="input-required">*</span>
                  </td>
                  <td class="valuecell">
                    <input type="text" id="c_candidate_firstName" name="candidate.firstName" value="" />
                  </td>
                </tr>

                <!-- Table layout: Last Name -->
                <tr class="form-row">
                  <td class="labelcell">
                    Last Name <span class="input-required">*</span>
                  </td>
                  <td class="valuecell">
                    <input type="text" id="c_candidate_lastName" name="candidate.lastName" value="" />
                  </td>
                </tr>

                <!-- Sibling non-label element: Email -->
                <tr class="form-row">
                  <td colspan="2">
                    <div class="field-container">
                      <span class="field-title">Primary Email Address: <span class="mandatory">*</span></span>
                      <input type="email" id="u_10823_email" name="u_email" value="" />
                    </div>
                  </td>
                </tr>

                <!-- Phone with obfuscated name -->
                <tr class="form-row">
                  <td class="labelcell">Phone Number:</td>
                  <td class="valuecell">
                    <input type="tel" id="c_primary_phone" name="c_phone" value="" />
                  </td>
                </tr>

                <!-- Address & City -->
                <tr class="form-row">
                  <td class="labelcell">Street Address:</td>
                  <td class="valuecell">
                    <input type="text" id="c_address" name="candidate.address" value="" />
                  </td>
                </tr>
                <tr class="form-row">
                  <td class="labelcell">City:</td>
                  <td class="valuecell">
                    <input type="text" id="c_city" name="candidate.city" value="" />
                  </td>
                </tr>

                <!-- Work Authorization Dropdown -->
                <tr class="form-row">
                  <td class="labelcell">
                    Are you legally authorized to work in the United States? <span class="input-required">*</span>
                  </td>
                  <td class="valuecell">
                    <select id="u_auth_select" name="custom.work_auth">
                      <option value="">-- Please Select --</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </td>
                </tr>

                <!-- Sponsorship Dropdown -->
                <tr class="form-row">
                  <td class="labelcell">
                    Will you now or in the future require visa sponsorship? <span class="input-required">*</span>
                  </td>
                  <td class="valuecell">
                    <select id="u_sponsor_select" name="custom.sponsorship">
                      <option value="">-- Please Select --</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </td>
                </tr>

                <!-- Essay / Textarea: Why Virtusa -->
                <tr class="form-row">
                  <td colspan="2">
                    <div class="textarea-block">
                      <div class="form-label">Why do you want to work at Virtusa?</div>
                      <textarea id="u_why_virtusa" name="custom.why_us" rows="4"></textarea>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </form>
        </div>
      </body>
      </html>
    `;

    dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://virtusapolaris.referrals.selectminds.com/jobs/data-engineer-79947' });
    window = dom.window;
    document = window.document;

    // Load field-detector into JSDOM window
    const detectorCode = fs.readFileSync(path.join(__dirname, '../field-detector.js'), 'utf-8');
    window.eval(detectorCode);
    FieldDetector = window.FieldDetector;

    // Load background.js
    delete require.cache[require.resolve('../background.js')];
    bg = require('../background.js');
  });

  it('SKEPTICAL TEST: Extracts accurate labels from Oracle Taleo table-based td layouts', () => {
    const fnInput = document.getElementById('c_candidate_firstName');
    const label = FieldDetector.getLabel(fnInput);

    assert.ok(label, 'Must resolve label from preceding table cell');
    assert.match(FieldDetector.getLabelText(fnInput), /First Name/i);

    const emailInput = document.getElementById('u_10823_email');
    assert.match(FieldDetector.getLabelText(emailInput), /Primary Email Address/i);
  });

  it('SKEPTICAL TEST: Detects Taleo custom mandatory markers (.input-required, .mandatory)', () => {
    const fnInput = document.getElementById('c_candidate_firstName');
    assert.equal(FieldDetector.isMandatory(fnInput), true, 'Taleo .input-required must register as mandatory');

    const emailInput = document.getElementById('u_10823_email');
    assert.equal(FieldDetector.isMandatory(emailInput), true, 'Taleo .mandatory must register as mandatory');
  });

  it('SKEPTICAL TEST: Discovers all fillable fields on Virtusa/SelectMinds application page', () => {
    const fields = FieldDetector.getFields();
    // 6 text/tel/email inputs + 2 selects + 1 textarea = 9 interactive fields
    assert.equal(fields.length, 9, 'All 9 interactive fields must be discovered');
  });

  it('SKEPTICAL TEST: AI Enforced Mode resolves Virtusa/Taleo form with 100% precision', async () => {
    const fields = FieldDetector.getFields();
    const sft = FieldDetector.buildSemanticFormTree(fields);

    const aiResult = await bg.matchFieldsWithAi(sft, mockProfile, { isAiEnforced: true });

    assert.ok(aiResult.mappings.length >= 7, 'AI Arbiter must resolve core fields and questions');

    // Apply mappings to DOM
    let filledCount = 0;
    for (const m of aiResult.mappings) {
      const el = document.querySelector(`[data-ca-field-id="${m.fieldId}"]`);
      if (el) {
        const val = m.selectedOption || mockProfile[m.profileKey];
        if (val) {
          const ok = FieldDetector.setValue(el, val);
          if (ok) filledCount++;
        }
      }
    }

    assert.equal(document.getElementById('c_candidate_firstName').value, 'Devon');
    assert.equal(document.getElementById('c_candidate_lastName').value, 'Vance');
    assert.equal(document.getElementById('u_10823_email').value, 'devon.vance@example.com');
    assert.equal(document.getElementById('c_primary_phone').value, '555-876-5432');
    assert.equal(document.getElementById('c_city').value, 'Reston');
    assert.equal(document.getElementById('u_auth_select').value, 'Yes');
    assert.equal(document.getElementById('u_sponsor_select').value, 'No');
    assert.ok(document.getElementById('u_why_virtusa').value.includes('Virtusa'));
  });
});
