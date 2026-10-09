/**
 * Content Script - Handles autofill and field detection
 */

console.log('🟢 [Career Autofill] content.js LOADING...');

(function() {
  'use strict';

  console.log('🔵 [Career Autofill] Content script starting...');

  // Prevent multiple injections
  if (window.__CAREER_AUTOFILL_LOADED__) {
    console.log('⚠️ [Career Autofill] Already loaded, skipping');
    return;
  }
  window.__CAREER_AUTOFILL_LOADED__ = true;

  console.log('🔵 [Career Autofill] Checking for FieldDetector...');
  const detector = window.FieldDetector;
  if (!detector) {
    console.error('❌ [Career Autofill] FieldDetector not loaded! window.FieldDetector:', window.FieldDetector);
    console.error('❌ [Career Autofill] Available on window:', Object.keys(window).filter(k => k.includes('Field') || k.includes('Career')));
    return;
  }

  console.log('✅ [Career Autofill] FieldDetector found!', detector);

  /**
   * Autofill mandatory fields with saved data
   */
  async function autofill(fillAll = false) {
    try {
      console.log('[Career Autofill] Starting autofill, fillAll mode:', fillAll);
      console.log('[Career Autofill] Detector available:', !!detector);

      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        throw new Error('Extension context invalidated. Please refresh the page.');
      }

      // Get saved profile data
      const result = await chrome.storage.local.get(['profile', 'fillAllMode']);
      const profile = result.profile || {};
      const shouldFillAll = fillAll || result.fillAllMode || false;

      console.log('[Career Autofill] Profile data:', profile);
      console.log('[Career Autofill] Profile keys:', Object.keys(profile));
      console.log('[Career Autofill] Fill all mode:', shouldFillAll);

      const fields = detector.getFields();
      console.log('[Career Autofill] Total fields detected:', fields.length);
      let filledCount = 0;

      for (const field of fields) {
        const classification = detector.classify(field);

        if (!classification) {
          console.log('[Career Autofill] Field not classified:', field);
          continue;
        }

        console.log('[Career Autofill] Classified field:', classification.label, 'key:', classification.key, 'mandatory:', classification.isMandatory);

        // Skip fields that should never be auto-filled
        const skipFields = ['countryCode', 'country code'];
        if (skipFields.includes(classification.key.toLowerCase())) {
          console.log('[Career Autofill] Skipping blacklisted field:', classification.label);
          continue;
        }

        // Only fill mandatory fields (unless debug mode is on)
        if (!shouldFillAll && !classification.isMandatory) {
          console.log('[Career Autofill] Skipping non-mandatory field:', classification.label);
          continue;
        }

        // Skip if field already has a value
        const currentValue = detector.getValue(field);
        if (currentValue && String(currentValue).trim().length > 0) {
          console.log('[Career Autofill] Field already has value:', classification.label, '=', currentValue);
          continue;
        }

        // Get value from profile
        let value = null;

        // Special handling for today's date field
        if (classification.key === 'todaysDate') {
          // Check if it's a date input
          const isDateInput = field.type === 'date';
          value = detector.getTodaysDate(isDateInput ? 'iso' : 'text');
        } else if (classification.isCustom) {
          // Custom field - check if we have it saved
          value = profile[classification.key];
        } else {
          // Standard field
          value = profile[classification.key];
        }

        console.log('[Career Autofill] Attempting to fill:', classification.label, 'with value:', value);

        // Fill the field
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          const success = detector.setValue(field, value);
          console.log('[Career Autofill] Fill result for', classification.label, ':', success);
          if (success) {
            filledCount++;
            try {
              field.style.outline = '2px solid #10b981';
              setTimeout(() => {
                field.style.outline = '';
              }, 2000);
            } catch (styleError) {
              console.warn('[Career Autofill] Could not set outline on field:', styleError);
            }
          }
        } else {
          console.log('[Career Autofill] No value in profile for:', classification.label);
        }
      }

      console.log('[Career Autofill] ✅ Autofill complete. Filled', filledCount, 'fields');
      return filledCount;
    } catch (error) {
      console.error('[Career Autofill] ❌ Autofill error:', error);
      console.error('[Career Autofill] Error stack:', error.stack);
      return 0;
    }
  }

  /**
   * Save current form data
   */
  async function saveFormData() {
    try {
      const result = await chrome.storage.local.get(['profile']);
      const profile = result.profile || {};

      const fields = detector.getFields();
      let savedCount = 0;
      const processedRadioGroups = new Set();

      console.log('[Career Autofill] Saving form data, found fields:', fields.length);

      for (const field of fields) {
        // Never save password fields
        if (field.type === 'password') continue;

        const classification = detector.classify(field);

        // Save all classified fields (not just mandatory ones)
        if (!classification) {
          console.log('[Career Autofill] Field not classified:', field);
          continue;
        }

        // Skip fields that should never be saved
        const skipFields = ['countrycode', 'country code'];
        if (skipFields.includes(classification.key.toLowerCase())) {
          console.log('[Career Autofill] Skipping blacklisted field from save:', classification.label);
          continue;
        }

        // For radio buttons (standard or custom), only process each group once
        const isRadio = field.type === 'radio' || field.getAttribute('role') === 'radio';
        if (isRadio) {
          const radioName = field.name || field.getAttribute('name');
          const radioGroupKey = radioName ? `${radioName}_radio` : `${field.id}_radio`;
          if (processedRadioGroups.has(radioGroupKey)) {
            console.log('[Career Autofill] Radio group already processed:', radioGroupKey);
            continue;
          }
          processedRadioGroups.add(radioGroupKey);
          console.log('[Career Autofill] Processing radio group:', radioGroupKey);
        }

        const value = detector.getValue(field);
        console.log('[Career Autofill] Field value:', classification.key, '=', value);

        if (value === null || value === undefined) continue;

        const trimmedValue = String(value).trim();
        if (trimmedValue.length === 0) continue;

        // Save to profile
        profile[classification.key] = trimmedValue;
        savedCount++;
        console.log('[Career Autofill] Saved:', classification.key, '=', trimmedValue);
      }

      if (savedCount > 0) {
        await chrome.storage.local.set({ profile });
        console.log('[Career Autofill] Saved profile to storage:', profile);
      }

      return savedCount;
    } catch (error) {
      console.error('Save error:', error);
      return 0;
    }
  }

  /**
   * Get page info
   */
  function getPageInfo() {
    console.log('[Career Autofill] getPageInfo called');
    console.log('[Career Autofill] DOM ready state:', document.readyState);
    console.log('[Career Autofill] Total inputs in page:', document.querySelectorAll('input').length);
    console.log('[Career Autofill] Total textareas in page:', document.querySelectorAll('textarea').length);
    console.log('[Career Autofill] Total selects in page:', document.querySelectorAll('select').length);

    const fields = detector.getFields();
    let mandatoryCount = 0;

    // Debug: log field detection
    console.log('[Career Autofill] Analyzing fields:', fields.length);

    const mandatoryFields = fields.filter(f => {
      const isMandatory = detector.isMandatory(f);
      const classification = detector.classify(f);

      if (isMandatory) {
        mandatoryCount++;
        const labelText = detector.getLabelText(f);
        console.log('[Career Autofill] Mandatory field found:', {
          label: labelText,
          type: f.type,
          name: f.name,
          classification: classification
        });
      }

      return classification && classification.isMandatory;
    });

    console.log('[Career Autofill] Total mandatory fields:', mandatoryCount);

    return {
      totalFields: fields.length,
      mandatoryFields: mandatoryFields.length,
      url: window.location.href,
      hostname: window.location.hostname
    };
  }

  /**
   * Auto-save on field changes
   */
  function setupAutoSave() {
    document.addEventListener('change', async (e) => {
      const target = e.target;
      if (!target.matches('input, select, textarea')) return;

      // Never save password fields
      if (target.type === 'password') return;

      const classification = detector.classify(target);
      if (!classification) return;

      const value = detector.getValue(target);
      if (!value || String(value).trim().length === 0) return;

      try {
        const result = await chrome.storage.local.get(['profile']);
        const profile = result.profile || {};
        profile[classification.key] = String(value).trim();
        await chrome.storage.local.set({ profile });
      } catch (error) {
        console.error('Auto-save error:', error);
      }
    }, true);
  }

  // Setup auto-save
  setupAutoSave();

  /**
   * Check if current page is a job application page
   */
  function isJobApplicationPage() {
    const url = window.location.href.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();

    // Check URL patterns for known job application sites
    const jobSitePatterns = [
      'workday.com',
      'myworkdayjobs.com',
      'smartrecruiters.com',
      'greenhouse.io',
      'lever.co',
      'ashbyhq.com',
      'recruitee.com',
      'breezy.hr',
      'icims.com',
      'ultipro.com',
      'jobvite.com',
      'taleo.net',
      'successfactors.com',
      'apply.workable.com',
      'jobs.lever.co',
      'boards.greenhouse.io',
      '/careers',
      '/jobs',
      '/apply',
      '/application',
      '/job-application',
      '/career',
      '/opportunities'
    ];

    // Check if URL matches any job site pattern
    const matchesPattern = jobSitePatterns.some(pattern =>
      hostname.includes(pattern) || url.includes(pattern)
    );

    if (matchesPattern) {
      console.log('[Career Autofill] ✓ Job application page detected by URL pattern');
      return true;
    }

    // Check for form fields that suggest this is a job application
    const fields = detector.getFields();
    if (fields.length >= 3) {
      // Check if we have typical job application fields
      const hasJobFields = fields.some(field => {
        const classification = detector.classify(field);
        if (!classification) return false;

        const jobRelatedKeys = ['firstName', 'lastName', 'email', 'phone', 'workAuth', 'sponsorship'];
        return jobRelatedKeys.includes(classification.key);
      });

      if (hasJobFields) {
        console.log('[Career Autofill] ✓ Job application page detected by form fields');
        return true;
      }
    }

    console.log('[Career Autofill] ✗ Not a job application page');
    return false;
  }

  /**
   * Create floating action button
   */
  function createFloatingButton() {
    // Check if button already exists
    if (document.getElementById('career-autofill-fab')) return;

    // Only show button on job application pages
    if (!isJobApplicationPage()) {
      console.log('[Career Autofill] Skipping FAB - not a job application page');
      return;
    }

    // Create button
    const fab = document.createElement('div');
    fab.id = 'career-autofill-fab';
    fab.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="12" y1="18" x2="12" y2="12"></line>
        <line x1="9" y1="15" x2="15" y2="15"></line>
      </svg>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #career-autofill-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 999999;
        user-select: none;
      }

      #career-autofill-fab:hover {
        transform: scale(1.1) translateY(-2px);
        box-shadow: 0 8px 20px rgba(16, 185, 129, 0.5);
      }

      #career-autofill-fab:active {
        transform: scale(0.95);
      }

      #career-autofill-fab.filling {
        animation: pulse 1s ease-in-out infinite;
      }

      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 8px 20px rgba(16, 185, 129, 0.6);
        }
      }

      #career-autofill-fab .tooltip {
        position: absolute;
        right: 70px;
        top: 50%;
        transform: translateY(-50%);
        background: #18181b;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
        font-weight: 500;
      }

      #career-autofill-fab:hover .tooltip {
        opacity: 1;
      }
    `;

    document.head.appendChild(style);

    // Add tooltip
    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    tooltip.textContent = 'Autofill form';
    fab.appendChild(tooltip);

    // Add click handler
    fab.addEventListener('click', async () => {
      console.log('[Career Autofill FAB] Button clicked');
      fab.classList.add('filling');
      tooltip.textContent = 'Filling...';

      try {
        // Check if we have profile data
        const result = await chrome.storage.local.get(['profile']);
        const profile = result.profile || {};
        const fieldCount = Object.keys(profile).length;

        console.log('[Career Autofill FAB] Profile has', fieldCount, 'fields');

        if (fieldCount === 0) {
          tooltip.textContent = 'No saved data';
          fab.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
          setTimeout(() => {
            tooltip.textContent = 'Autofill form';
            fab.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
          }, 2000);
          fab.classList.remove('filling');
          return;
        }

        const count = await autofill(true);
        console.log('[Career Autofill FAB] Filled', count, 'fields');

        if (count === 0) {
          tooltip.textContent = 'No fields to fill';
          fab.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        } else {
          tooltip.textContent = `Filled ${count} field${count !== 1 ? 's' : ''}`;
          fab.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        }

        setTimeout(() => {
          tooltip.textContent = 'Autofill form';
          fab.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        }, 2000);
      } catch (error) {
        console.error('[Career Autofill FAB] Error:', error);

        // Handle extension context invalidated error
        if (error.message.includes('Extension context invalidated') || error.message.includes('refresh')) {
          tooltip.textContent = 'Please refresh page';
          fab.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        } else {
          tooltip.textContent = 'Failed to autofill';
          fab.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        }

        setTimeout(() => {
          tooltip.textContent = 'Autofill form';
          fab.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        }, 3000);
      }

      fab.classList.remove('filling');
    });

    // Add to page
    document.body.appendChild(fab);
  }

  // Create floating button after a short delay to ensure page is ready
  setTimeout(createFloatingButton, 500);

  // Debug phone field specifically
  window.debugPhoneField = function() {
    console.log('=== Phone Field Debug ===');
    const fields = detector.getFields();
    console.log('Total fields:', fields.length);

    fields.forEach((field, index) => {
      const classification = detector.classify(field);
      if (classification && classification.key.toLowerCase().includes('phone')) {
        console.log(`\n--- Phone Field #${index} ---`);
        console.log('Element:', field);
        console.log('Tag name:', field.tagName);
        console.log('Type:', field.type);
        console.log('Classification:', classification);
        console.log('Current value:', detector.getValue(field));
        console.log('Has shadowRoot:', !!field.shadowRoot);

        if (field.shadowRoot) {
          console.log('Shadow DOM children:', Array.from(field.shadowRoot.children).map(c => c.tagName));
          const nestedFormField = field.shadowRoot.querySelector('spl-internal-form-field');
          if (nestedFormField) {
            console.log('Found nested form field, has shadowRoot:', !!nestedFormField.shadowRoot);
            if (nestedFormField.shadowRoot) {
              const input = nestedFormField.shadowRoot.querySelector('input');
              console.log('Nested input found:', !!input);
              if (input) {
                console.log('Input type:', input.type);
                console.log('Input value:', input.value);
                console.log('Input id:', input.id);
              }
            }
          }
        }
      }
    });
  };

  // Expose debug function for testing
  window.debugCareerAutofill = function() {
    console.log('=== Career Autofill Debug ===');
    console.log('Page info:');
    console.log('- URL:', window.location.href);
    console.log('- All inputs:', document.querySelectorAll('input').length);
    console.log('- All textareas:', document.querySelectorAll('textarea').length);
    console.log('- All selects:', document.querySelectorAll('select').length);
    console.log('- Hidden inputs:', document.querySelectorAll('input[type="hidden"]').length);

    const fields = detector.getFields();
    console.log(`\nTotal fillable fields found: ${fields.length}`);

    const results = [];
    fields.forEach((field, index) => {
      const isMandatory = detector.isMandatory(field);
      const labelText = detector.getLabelText(field);
      const classification = detector.classify(field);

      const info = {
        index: index + 1,
        type: field.type || field.tagName,
        name: field.name || '(no name)',
        id: field.id || '(no id)',
        label: labelText || '(no label)',
        isMandatory,
        classification: classification ? classification.key : null
      };

      results.push(info);

      if (isMandatory) {
        console.log(`✓ MANDATORY: ${info.label} (${info.type})`, field);
      }
    });

    console.log(`\nMandatory fields: ${results.filter(r => r.isMandatory).length}`);
    console.log('\nAll fields:', results);
    return results;
  };

  console.log('✅ [Career Autofill] Ready. Run debugCareerAutofill() in console for details.');
  console.log('✅ [Career Autofill] Content script fully loaded and initialized!');

  // Message handler
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 [Career Autofill] Received message:', request.action);
    if (request.action === 'autofill') {
      const fillAll = request.fillAll || false;
      autofill(fillAll).then(count => {
        sendResponse({ success: true, count });
      });
      return true; // Keep channel open for async response
    }

    if (request.action === 'save') {
      saveFormData().then(count => {
        sendResponse({ success: true, count });
      });
      return true;
    }

    if (request.action === 'getPageInfo') {
      const info = getPageInfo();
      sendResponse({ success: true, info });
      return false;
    }

    if (request.action === 'ping') {
      sendResponse({ success: true });
      return false;
    }
  });

  console.log('Career Autofill: Content script loaded');
})();
