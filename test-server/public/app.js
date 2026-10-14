/**
 * Career Autofill - Test Suite Live Inspector & Utility Script
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  const countDisplay = document.getElementById('filledCountDisplay');
  const logBody = document.getElementById('logBody');
  const clearBtn = document.getElementById('clearFormBtn');
  const inspectBtn = document.getElementById('inspectFormBtn');

  function updateCounts() {
    if (!form || !countDisplay) return;
    const inputs = form.querySelectorAll('input:not([type="submit"]):not([type="button"]), select, textarea');
    let filled = 0;
    inputs.forEach(input => {
      let val = '';
      if (input.type === 'checkbox' || input.type === 'radio') {
        if (input.checked) val = input.value;
      } else {
        val = input.value || '';
      }
      if (val && val.trim().length > 0 && !val.toLowerCase().startsWith('select') && !val.toLowerCase().startsWith('choose')) {
        filled++;
      }
    });
    countDisplay.textContent = `${filled} of ${inputs.length} fields filled`;
  }

  function log(msg, type = 'info') {
    if (!logBody) return;
    const item = document.createElement('div');
    item.className = `log-item ${type}`;
    item.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logBody.prepend(item);
  }

  // Clear form inputs
  if (clearBtn && form) {
    clearBtn.addEventListener('click', () => {
      form.reset();
      const allInputs = form.querySelectorAll('input, select, textarea');
      allInputs.forEach(i => {
        if (i.type === 'checkbox' || i.type === 'radio') {
          i.checked = false;
        } else {
          i.value = '';
        }
      });
      updateCounts();
      log('Form cleared. Ready for autofill testing.', 'warn');
    });
  }

  // Inspect form using injected FieldDetector if available
  if (inspectBtn) {
    inspectBtn.addEventListener('click', () => {
      if (window.FieldDetector) {
        const fields = window.FieldDetector.getFields();
        let mandatoryCount = 0;
        const classifications = fields.map(f => {
          const isMand = window.FieldDetector.isMandatory(f);
          if (isMand) mandatoryCount++;
          const c = window.FieldDetector.classify(f);
          return {
            id: f.id || f.name || '(unnamed)',
            label: window.FieldDetector.getLabelText(f),
            key: c ? c.key : 'unclassified',
            mandatory: isMand,
            val: window.FieldDetector.getValue(f)
          };
        });
        log(`FieldDetector active: ${fields.length} interactive fields discovered (${mandatoryCount} mandatory)`, 'success');
        console.table(classifications);
      } else {
        log('FieldDetector not loaded yet. Open Career Autofill popup to inject it into this page.', 'warn');
      }
      updateCounts();
    });
  }

  // Listen to input and change events
  if (form) {
    form.addEventListener('input', updateCounts);
    form.addEventListener('change', updateCounts);
  }

  updateCounts();
  log('Test page loaded. Open Career Autofill extension popup to test autofill.', 'info');
});
