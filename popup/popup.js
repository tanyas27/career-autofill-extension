/**
 * Career Autofill - Popup Script
 * Manages user profile data, AI status indicators, and background/content coordination.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const aiBadge = document.getElementById('aiBadge');
  const aiBadgeText = document.getElementById('aiBadgeText');
  const pageBadge = document.getElementById('pageBadge');
  const pageStatus = document.getElementById('pageStatus');
  const fieldCount = document.getElementById('fieldCount');
  const rescanBtn = document.getElementById('rescanBtn');
  const emptyProfileBanner = document.getElementById('emptyProfileBanner');
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  const autofillBtn = document.getElementById('autofillBtn');
  const saveBtn = document.getElementById('saveBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const clearBtn = document.getElementById('clearBtn');
  const aiEnforcedMode = document.getElementById('aiEnforcedMode');
  const fillAllFields = document.getElementById('fillAllFields');
  const overwriteFields = document.getElementById('overwriteFields');
  const generateEssaysBtn = document.getElementById('generateEssaysBtn');
  const profileForm = document.getElementById('profileForm');
  const viewFormBtn = document.getElementById('viewFormBtn');
  const viewJsonBtn = document.getElementById('viewJsonBtn');
  const formView = document.getElementById('formView');
  const jsonView = document.getElementById('jsonView');
  const jsonEditor = document.getElementById('jsonEditor');
  const formatJsonBtn = document.getElementById('formatJsonBtn');
  const copyJsonBtn = document.getElementById('copyJsonBtn');
  const saveJsonBtn = document.getElementById('saveJsonBtn');
  const jsonStats = document.getElementById('jsonStats');
  const debugBtn = document.getElementById('debugBtn');
  const toast = document.getElementById('toast');
  const reloadExtBtn = document.getElementById('reloadExtBtn');
  const customFieldsContainer = document.getElementById('customFieldsContainer');
  const addCustomFieldBtn = document.getElementById('addCustomFieldBtn');
  const presetChips = document.querySelectorAll('.preset-chip');

  const EXTENSION_VERSION = '2.2.0';

  let currentTab = null;

  const STANDARD_FORM_KEYS = new Set([
    'firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zipCode', 'country',
    'linkedin', 'github', 'portfolio', 'currentCompany', 'currentTitle',
    'workAuthCountries', 'workAuth', 'sponsorship', 'sponsorshipOtherCountries',
    'noticePeriod', 'salaryExpectations',
    'whyUs', 'projectHighlight', 'coverLetter', 'aboutMe',
    'customFields'
  ]);

  const SAMPLE_PROFILE = {
    firstName: 'Alex',
    lastName: 'Morgan',
    email: 'alex.morgan@example.com',
    phone: '+1 (555) 234-5678',
    address: '100 Market St, Apt 4B',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94105',
    country: 'United States',
    linkedin: 'https://linkedin.com/in/alexmorgan',
    github: 'https://github.com/alexmorgan',
    portfolio: 'https://alexmorgan.dev',
    currentCompany: 'Tech Corp',
    currentTitle: 'Senior Software Engineer',
    workExperience: '5+ years designing distributed backend services and high-scale APIs with 99.99% uptime. Led teams delivering event-driven architecture and cloud native infrastructure.',
    yearsOfExperience: '5',
    skills: 'TypeScript, Node.js, Go, Python, React, PostgreSQL, Distributed Systems, Docker, Kubernetes',
    education: 'Bachelor of Science in Computer Science',
    workAuthCountries: 'United States, Canada',
    workAuth: 'Yes',
    sponsorship: 'No',
    sponsorshipOtherCountries: 'Yes',
    noticePeriod: '2 weeks',
    salaryExpectations: '$160,000',
    whyUs: 'I am passionate about building scalable, user-centric software that makes a real-world impact. Your engineering culture and mission align closely with my values.',
    projectHighlight: 'Architected and deployed a distributed real-time processing system serving millions of events daily with 99.99% reliability.',
    coverLetter: 'Dear Hiring Team,\n\nI am writing to express my strong enthusiasm for joining your organization. With extensive experience in full-stack engineering and distributed systems, I look forward to contributing to your team\'s mission.\n\nSincerely,\nAlex Morgan',
    aboutMe: 'Full-stack software engineer specializing in scalable web applications, modern APIs, and high-performance cloud architectures.',
    customFields: [
      {
        id: 'cf_sample_1',
        label: 'Work Experience',
        key: 'workExperience',
        value: '5+ years designing distributed backend services and high-scale APIs with 99.99% uptime. Led teams delivering event-driven architecture and cloud native infrastructure.',
        multiline: true
      },
      {
        id: 'cf_sample_2',
        label: 'Years of Experience',
        key: 'yearsOfExperience',
        value: '5',
        multiline: false
      },
      {
        id: 'cf_sample_3',
        label: 'Technical Skills',
        key: 'skills',
        value: 'TypeScript, Node.js, Go, Python, React, PostgreSQL, Distributed Systems, Docker, Kubernetes',
        multiline: true
      },
      {
        id: 'cf_sample_4',
        label: 'Highest Education',
        key: 'education',
        value: 'Bachelor of Science in Computer Science',
        multiline: false
      }
    ]
  };

  /**
   * Display temporary toast notification
   */
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  /**
   * Switch to form view tab
   */
  function switchToFormView() {
    formView.style.display = 'block';
    jsonView.style.display = 'none';
    viewFormBtn.classList.add('active');
    viewJsonBtn.classList.remove('active');
  }

  /**
   * Query the active tab safely
   */
  async function getActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.id) return tab;
    } catch (e) {}
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) return tab;
    } catch (e) {}
    return null;
  }

  /**
   * Check and display On-Device Gemini Nano & AI Enforced status
   */
  async function updateAiStatus() {
    try {
      const [storageRes, response] = await Promise.all([
        chrome.storage.local.get(['aiEnforcedMode']),
        chrome.runtime.sendMessage({ action: 'getAiStatus' }).catch(e => ({ success: false, error: e.message }))
      ]);

      const isEnforced = storageRes.aiEnforcedMode !== false;

      if (response && response.success && response.status) {
        const status = response.status;
        const isNano = status.engine === 'gemini-nano';

        if (isEnforced) {
          aiBadge.className = 'ai-badge badge-enforced';
          aiBadgeText.textContent = isNano ? 'AI Enforced (Nano)' : 'AI Enforced Active';
          aiBadge.title = 'AI Enforced Mode is active: Deep semantic arbitration is enforced on all candidate fields.';
        } else if (isNano) {
          aiBadge.className = 'ai-badge badge-ready';
          aiBadgeText.textContent = 'Gemini Nano Active';
          aiBadge.title = 'On-Device Gemini AI is active in hybrid mode.';
        } else if (status.status === 'downloading') {
          aiBadge.className = 'ai-badge badge-loading';
          aiBadgeText.textContent = 'AI Downloading';
          aiBadge.title = 'Gemini Nano is downloading locally onto your machine.';
        } else {
          aiBadge.className = 'ai-badge badge-ready';
          aiBadgeText.textContent = 'Local AI Active';
          aiBadge.title = 'On-Device Semantic AI is active.';
        }
      } else {
        aiBadge.className = isEnforced ? 'ai-badge badge-enforced' : 'ai-badge badge-ready';
        aiBadgeText.textContent = isEnforced ? 'AI Enforced Active' : 'Local AI Active';
      }
    } catch (e) {
      aiBadge.className = 'ai-badge badge-enforced';
      aiBadgeText.textContent = 'AI Enforced Active';
    }
  }

  /**
   * Inject content scripts if not already present on page or if version is stale.
   * If force is true, always re-injects to ensure fresh code execution.
   */
  async function ensureScriptsInjected(tabId, force = false) {
    if (!force) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        if (response && response.success && response.version === EXTENSION_VERSION) {
          return true;
        }
      } catch (e) {
        // Not yet injected or context invalidated
      }
    }

    let mainInjected = false;

    // 1. Inject into main frame first (safest and required)
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['field-detector.js']
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      mainInjected = true;
    } catch (mainErr) {
      console.warn('[Popup] Main frame injection notice:', mainErr);
    }

    // 2. Attempt child frames (iframes) in fail-safe try/catch (ignore sandboxed or restricted subframes)
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['field-detector.js']
      });
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content.js']
      });
    } catch (subframeErr) {
      // Ignore subframe restriction errors
    }

    if (mainInjected) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    }

    // Fallback: ping
    try {
      const ping = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return !!(ping && ping.success);
    } catch (e) {
      return false;
    }
  }

  /**
   * Refresh current tab info and field counts (aggregating across all frames/iframes)
   */
  async function updatePageInfo() {
    try {
      const tab = await getActiveTab();
      currentTab = tab;

      if (!tab || !tab.id) {
        pageStatus.textContent = 'No active tab';
        fieldCount.textContent = '-';
        autofillBtn.disabled = true;
        saveBtn.disabled = true;
        return;
      }

      // Check for restricted URLs
      if (tab.url?.startsWith('chrome://') ||
          tab.url?.startsWith('chrome-extension://') ||
          tab.url?.startsWith('edge://') ||
          tab.url?.startsWith('about:')) {
        pageStatus.textContent = 'System / Extension page';
        pageBadge.textContent = 'Idle';
        pageBadge.className = 'status-pill';
        fieldCount.textContent = '-';
        autofillBtn.disabled = true;
        saveBtn.disabled = true;
        return;
      }

      const injected = await ensureScriptsInjected(tab.id);
      if (!injected) {
        pageStatus.textContent = 'Protected page / Access restricted';
        fieldCount.textContent = '-';
        autofillBtn.disabled = true;
        saveBtn.disabled = true;
        return;
      }

      let totalFields = 0;
      let mandatoryFields = 0;
      let detectedAny = false;

      const scanFunc = () => {
        if (typeof window.getPageInfoExtension === 'function') {
          return window.getPageInfoExtension();
        }
        if (window.FieldDetector) {
          const fields = window.FieldDetector.getFields();
          let mandatory = 0;
          fields.forEach(f => {
            if (window.FieldDetector.isMandatory(f)) mandatory++;
          });
          return { totalFields: fields.length, mandatoryFields: mandatory };
        }
        return { totalFields: 0, mandatoryFields: 0 };
      };

      try {
        const frameResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: scanFunc
        });

        if (frameResults && frameResults.length > 0) {
          detectedAny = true;
          frameResults.forEach(r => {
            if (r.result) {
              totalFields += r.result.totalFields || 0;
              mandatoryFields += r.result.mandatoryFields || 0;
            }
          });
        }
      } catch (scriptErr) {
        // Multi-frame scripting can fail if there are restricted cross-origin subframes; fallback to main frame
        try {
          const mainResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scanFunc
          });
          if (mainResult && mainResult.length > 0 && mainResult[0].result) {
            detectedAny = true;
            totalFields = mainResult[0].result.totalFields || 0;
            mandatoryFields = mainResult[0].result.mandatoryFields || 0;
          }
        } catch (mainErr) {}

        if (!detectedAny) {
          try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
            if (response && response.success && response.info) {
              detectedAny = true;
              totalFields = response.info.totalFields || 0;
              mandatoryFields = response.info.mandatoryFields || 0;
            }
          } catch (e) {}
        }
      }

      if (detectedAny) {
        pageStatus.textContent = totalFields > 0 ? 'Ready to autofill' : 'No inputs detected';
        pageBadge.textContent = totalFields > 0 ? 'Detected' : 'Idle';
        pageBadge.className = totalFields > 0 ? 'status-pill ready' : 'status-pill';
        fieldCount.textContent = totalFields > 0 ? `${mandatoryFields} mandatory (${totalFields} total)` : '0 fields';
        // Keep buttons enabled for dynamic single page apps
        autofillBtn.disabled = false;
        saveBtn.disabled = false;
      } else {
        pageStatus.textContent = 'Ready';
        pageBadge.textContent = 'Ready';
        pageBadge.className = 'status-pill ready';
        autofillBtn.disabled = false;
        saveBtn.disabled = false;
      }
    } catch (error) {
      console.error('[Popup] Page info error:', error);
      pageStatus.textContent = 'Ready';
      autofillBtn.disabled = false;
      saveBtn.disabled = false;
    }
  }

  /**
   * Load stored profile data into form fields
   */
  async function loadProfile() {
    try {
      const result = await chrome.storage.local.get(['profile', 'fillAllMode', 'aiEnforcedMode', 'overwriteMode']);
      const profile = result.profile || {};

      fillAllFields.checked = result.fillAllMode !== false;
      aiEnforcedMode.checked = result.aiEnforcedMode !== false;
      if (overwriteFields) overwriteFields.checked = result.overwriteMode === true;

      const filledKeys = Object.keys(profile).filter(k => profile[k] && String(profile[k]).trim().length > 0);
      if (emptyProfileBanner) {
        emptyProfileBanner.style.display = filledKeys.length === 0 ? 'flex' : 'none';
      }

      const inputs = profileForm.querySelectorAll('input:not(.custom-field-label-input):not(.custom-field-value-input), select, textarea:not(.custom-field-value-input)');
      inputs.forEach(input => {
        const name = input.name;
        if (profile[name] !== undefined) {
          input.value = profile[name];
        } else {
          input.value = '';
        }
      });

      renderCustomFields(profile);
      updateJsonStats(profile);
    } catch (error) {
      console.error('[Popup] Error loading profile:', error);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderCustomFieldsEmptyState() {
    if (!customFieldsContainer) return;
    customFieldsContainer.innerHTML = `
      <div class="empty-custom-state">
        No custom fields added yet. Click a Quick Add button above or "Add Custom Field" below to add work experience, skills, or niche ATS questions.
      </div>
    `;
  }

  function createCustomFieldCard({ id, label, key, value, multiline }) {
    const card = document.createElement('div');
    card.className = 'custom-field-card';
    card.dataset.id = id || ('cf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4));
    if (key) card.dataset.key = key;

    const isMulti = multiline || (value && (String(value).length > 80 || String(value).includes('\n')));

    card.innerHTML = `
      <div class="custom-field-header">
        <div class="custom-field-label-group">
          <input type="text" class="custom-field-label-input" value="${escapeHtml(label || '')}" placeholder="Field Name (e.g. Work Experience, Skills)">
        </div>
        <button type="button" class="btn-remove-custom" title="Remove custom field">Remove</button>
      </div>
      <div class="custom-field-value-group">
        ${isMulti ? `
          <textarea class="custom-field-value-input custom-field-value-textarea" rows="3" placeholder="Enter details...">${escapeHtml(value || '')}</textarea>
        ` : `
          <input type="text" class="custom-field-value-input" value="${escapeHtml(value || '')}" placeholder="Enter details...">
        `}
      </div>
    `;

    const removeBtn = card.querySelector('.btn-remove-custom');
    removeBtn.addEventListener('click', () => {
      card.remove();
      const remainingCards = customFieldsContainer ? customFieldsContainer.querySelectorAll('.custom-field-card') : [];
      if (remainingCards.length === 0) {
        renderCustomFieldsEmptyState();
      }
      saveProfileFromInputs(false);
    });

    const labelInput = card.querySelector('.custom-field-label-input');
    const valueInput = card.querySelector('.custom-field-value-input');

    labelInput.addEventListener('input', () => {
      clearTimeout(autoSaveTimeout);
      autoSaveTimeout = setTimeout(() => saveProfileFromInputs(false), 250);
    });

    valueInput.addEventListener('input', () => {
      clearTimeout(autoSaveTimeout);
      autoSaveTimeout = setTimeout(() => saveProfileFromInputs(false), 250);
    });

    return card;
  }

  function renderCustomFields(profile) {
    if (!customFieldsContainer) return;
    customFieldsContainer.innerHTML = '';

    const customFieldsMap = new Map();

    // 1. Add fields from profile.customFields if present
    if (Array.isArray(profile.customFields)) {
      profile.customFields.forEach(cf => {
        if (cf && (cf.label || cf.key)) {
          const id = cf.id || ('cf_' + Math.random().toString(36).substr(2, 6));
          customFieldsMap.set(cf.key || cf.label, {
            id: id,
            label: cf.label || cf.key,
            key: cf.key || cf.label,
            value: cf.value || (profile[cf.key] || ''),
            multiline: cf.multiline !== undefined ? cf.multiline : (String(cf.value || '').length > 80 || String(cf.value || '').includes('\n'))
          });
        }
      });
    }

    // 2. Discover non-standard top-level profile keys (from JSON editor or imports)
    Object.keys(profile).forEach(k => {
      if (STANDARD_FORM_KEYS.has(k)) return;
      if (customFieldsMap.has(k)) return;
      const val = profile[k];
      if (val === null || val === undefined) return;
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
      customFieldsMap.set(k, {
        id: 'cf_' + Math.random().toString(36).substr(2, 6),
        label: label,
        key: k,
        value: String(val),
        multiline: String(val).length > 80 || String(val).includes('\n')
      });
    });

    if (customFieldsMap.size === 0) {
      renderCustomFieldsEmptyState();
      return;
    }

    customFieldsMap.forEach(cf => {
      const card = createCustomFieldCard(cf);
      customFieldsContainer.appendChild(card);
    });
  }

  /**
   * Update JSON editor statistics counter
   */
  function updateJsonStats(profile) {
    const count = Object.keys(profile).length;
    jsonStats.textContent = `${count} field${count !== 1 ? 's' : ''}`;
  }

  // =========================================================================
  // User Actions & Event Handlers
  // =========================================================================

  // Re-scan button
  if (rescanBtn) {
    rescanBtn.addEventListener('click', async () => {
      rescanBtn.disabled = true;
      const originalText = rescanBtn.textContent;
      rescanBtn.textContent = 'Scanning...';
      await updatePageInfo();
      rescanBtn.disabled = false;
      rescanBtn.textContent = originalText;
      showToast('Page re-scanned');
    });
  }

  // Reload Extension & active tab (Development only — never shown on Web Store releases)
  const manifest = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) ? chrome.runtime.getManifest() : {};
  const isUnpackedDev = !manifest.update_url;
  if (isUnpackedDev && reloadExtBtn) {
    reloadExtBtn.style.display = 'inline-flex';
    reloadExtBtn.addEventListener('click', async () => {
      reloadExtBtn.disabled = true;
      reloadExtBtn.textContent = 'Reloading...';
      try {
        const tab = await getActiveTab();
        if (tab?.id) {
          try { await chrome.tabs.reload(tab.id); } catch (e) {}
        }
        showToast('Extension and page reloaded.');
        setTimeout(() => {
          try {
            chrome.runtime.reload();
          } catch (e) {
            window.location.reload();
          }
        }, 200);
      } catch (err) {
        window.location.reload();
      }
    });
  } else if (reloadExtBtn) {
    reloadExtBtn.remove();
  }

  // Load sample profile button
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', async () => {
      await chrome.storage.local.set({ profile: SAMPLE_PROFILE });
      await loadProfile();
      if (emptyProfileBanner) emptyProfileBanner.style.display = 'none';
      showToast('Sample profile loaded! Ready to autofill.');
    });
  }

  /**
   * Persist active inputs from profileForm DOM directly into chrome.storage.local
   */
  async function saveProfileFromInputs(showToastNotification = false) {
    try {
      const result = await chrome.storage.local.get(['profile']);
      const profile = result.profile || {};

      const formData = new FormData(profileForm);
      for (const [key, value] of formData.entries()) {
        const trimmed = value.trim();
        if (trimmed) {
          profile[key] = trimmed;
        } else {
          delete profile[key];
        }
      }

      // Collect custom fields
      const customFieldCards = customFieldsContainer ? customFieldsContainer.querySelectorAll('.custom-field-card') : [];
      const customFieldsList = [];
      const activeCustomKeys = new Set();

      customFieldCards.forEach(card => {
        const labelInput = card.querySelector('.custom-field-label-input');
        const valueInput = card.querySelector('.custom-field-value-input');
        if (!labelInput || !valueInput) return;
        const label = labelInput.value.trim();
        const value = valueInput.value.trim();
        const isMultiline = valueInput.tagName.toLowerCase() === 'textarea';
        if (!label) return;

        let key = card.dataset.key;
        if (!key) {
          key = label
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .split(/\s+/)
            .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join('') || label.toLowerCase().replace(/\s+/g, '_');
          card.dataset.key = key;
        }

        activeCustomKeys.add(key);

        customFieldsList.push({
          id: card.dataset.id || ('cf_' + Date.now()),
          label: label,
          key: key,
          value: value,
          multiline: isMultiline
        });

        if (value) {
          profile[key] = value;
        } else {
          delete profile[key];
        }
      });

      // Clean up deleted custom keys from flat profile
      for (const k of Object.keys(profile)) {
        if (!STANDARD_FORM_KEYS.has(k) && !activeCustomKeys.has(k)) {
          delete profile[k];
        }
      }

      if (customFieldsList.length > 0) {
        profile.customFields = customFieldsList;
      } else {
        delete profile.customFields;
      }

      await chrome.storage.local.set({ profile });
      updateJsonStats(profile);
      const filledKeys = Object.keys(profile).filter(k => profile[k] && String(profile[k]).trim().length > 0);
      if (emptyProfileBanner) {
        emptyProfileBanner.style.display = filledKeys.length === 0 ? 'flex' : 'none';
      }
      if (showToastNotification) {
        showToast('Profile saved successfully');
      }
      return profile;
    } catch (error) {
      console.error('[Popup] Save profile error:', error);
      if (showToastNotification) showToast('Error saving profile');
      return null;
    }
  }

  let autoSaveTimeout = null;
  profileForm.addEventListener('input', () => {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      saveProfileFromInputs(false);
    }, 250);
  });
  profileForm.addEventListener('change', () => {
    clearTimeout(autoSaveTimeout);
    saveProfileFromInputs(false);
  });

  // Autofill button (supports multi-frame and iframes)
  autofillBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      showToast('No active tab found');
      return;
    }
    currentTab = tab;

    // Immediately persist any pending unsubmitted form inputs into storage
    clearTimeout(autoSaveTimeout);
    const savedProfile = await saveProfileFromInputs(false);
    const profileRes = await chrome.storage.local.get(['profile']);
    const profile = savedProfile || profileRes.profile || {};
    const filledKeys = Object.keys(profile).filter(k => profile[k] && String(profile[k]).trim().length > 0);

    if (filledKeys.length === 0) {
      showToast('Profile is empty! Fill in your details below or load sample data.');
      if (emptyProfileBanner) {
        emptyProfileBanner.style.display = 'flex';
      }
      switchToFormView();
      return;
    }

    autofillBtn.disabled = true;
    const originalText = autofillBtn.textContent;
    autofillBtn.textContent = 'Filling...';

    // 1. Force fresh injection of latest field-detector.js and content.js into the tab
    await ensureScriptsInjected(currentTab.id, true);

    try {
      const fillAll = fillAllFields.checked;
      const aiEnforced = aiEnforcedMode.checked;
      const overwrite = overwriteFields ? overwriteFields.checked : false;

      let filledTotal = 0;
      let executedViaScript = false;

      const autofillFunc = async (opts) => {
        if (typeof window.autofillExtension === 'function') {
          return await window.autofillExtension(opts);
        }
        // Direct resilient fallback if window.autofillExtension hasn't attached yet
        if (window.FieldDetector) {
          const detector = window.FieldDetector;
          const fields = detector.getFields();
          const sft = detector.buildSemanticFormTree(fields);
          const arbiterRes = detector.arbitrateSemanticFields(sft, opts.profile, { aiEnforced: opts.aiEnforced });
          let count = 0;
          if (arbiterRes && arbiterRes.mappings) {
            for (const m of arbiterRes.mappings) {
              const el = document.querySelector(`[data-ca-field-id="${m.fieldId}"]`) || document.getElementById(m.fieldId);
              if (!el) continue;
              if (!opts.overwrite && detector.getValue(el)) continue;
              let v = m.selectedOption || opts.profile[m.profileKey];
              if (!v && m.profileKey === 'firstName') v = opts.profile.firstName;
              if (!v && m.profileKey === 'workAuth') v = opts.profile.workAuth || 'Yes';
              if (!v && m.profileKey === 'sponsorship') v = opts.profile.sponsorship || 'No';
              if (v && detector.setValue(el, v)) count++;
            }
          }
          return count;
        }
        return 0;
      };

      // 1. Run across all frames (including embedded Taleo / SelectMinds / Workday iframes)
      try {
        const frameResults = await chrome.scripting.executeScript({
          target: { tabId: currentTab.id, allFrames: true },
          func: autofillFunc,
          args: [{ fillAll, aiEnforced, overwrite, profile }]
        });

        if (frameResults && frameResults.length > 0) {
          executedViaScript = true;
          frameResults.forEach(fr => {
            if (typeof fr.result === 'number') {
              if (fr.result === -1) {
                if (filledTotal === 0) filledTotal = -1;
              } else if (fr.result === -2) {
                if (filledTotal === 0) filledTotal = -2;
              } else if (fr.result > 0) {
                if (filledTotal < 0) filledTotal = 0;
                filledTotal += fr.result;
              }
            }
          });
        }
      } catch (scriptErr) {
        console.warn('[Popup] Multi-frame script execution error, attempting main frame only:', scriptErr);
        // Fallback to main frame only
        try {
          const mainResult = await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: autofillFunc,
            args: [{ fillAll, aiEnforced, overwrite, profile }]
          });
          if (mainResult && mainResult.length > 0 && typeof mainResult[0].result === 'number') {
            executedViaScript = true;
            filledTotal = mainResult[0].result;
          }
        } catch (mainErr) {}
      }

      // 2. Fallback to standard broadcast message if scripting call returned 0 or didn't execute
      if (filledTotal <= 0) {
        try {
          const response = await chrome.tabs.sendMessage(currentTab.id, {
            action: 'autofill',
            fillAll: fillAll,
            aiEnforced: aiEnforced,
            overwrite: overwrite,
            profile: profile
          });
          if (response && response.success && typeof response.count === 'number') {
            if (response.count > 0 || response.count === -1 || response.count === -2) {
              filledTotal = response.count;
            }
          }
        } catch (msgErr) {
          console.warn('[Popup] Fallback message send notice:', msgErr);
        }
      }

      const modeLabel = aiEnforced ? 'AI Enforced: ' : '';
      if (filledTotal === -1) {
        showToast('Profile is empty! Please add profile details first.');
        if (emptyProfileBanner) emptyProfileBanner.style.display = 'flex';
        switchToFormView();
      } else if (filledTotal === -2) {
        showToast('All fields on page already contain values! Enable "Overwrite" to re-fill.');
      } else if (filledTotal > 0) {
        showToast(`${modeLabel}Filled ${filledTotal} field${filledTotal !== 1 ? 's' : ''}`);
      } else {
        if (!overwrite) {
          showToast('Fields on page already filled! Enable "Overwrite" or click "Generate AI Essays".');
        } else {
          showToast('No matching fields found on this page. Check profile details or re-scan.');
        }
      }
    } catch (error) {
      console.error('[Popup] Autofill error:', error);
      showToast('Failed to communicate with page');
    } finally {
      autofillBtn.disabled = false;
      autofillBtn.textContent = originalText;
    }
  });

  // Save current form button (safely guarded if present)
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      showToast('No active tab found');
      return;
    }
    currentTab = tab;

    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';

    try {
      let savedTotal = 0;
      let executedViaScript = false;

      const saveFunc = async () => {
        if (typeof window.saveFormDataExtension === 'function') {
          return await window.saveFormDataExtension();
        }
        return 0;
      };

      try {
        const frameResults = await chrome.scripting.executeScript({
          target: { tabId: currentTab.id, allFrames: true },
          func: saveFunc
        });

        if (frameResults && frameResults.length > 0) {
          executedViaScript = true;
          frameResults.forEach(fr => {
            savedTotal += (fr.result || 0);
          });
        }
      } catch (scriptErr) {
        console.warn('[Popup] Multi-frame save error, attempting main frame only:', scriptErr);
        try {
          const mainResult = await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: saveFunc
          });
          if (mainResult && mainResult.length > 0 && typeof mainResult[0].result === 'number') {
            executedViaScript = true;
            savedTotal = mainResult[0].result;
          }
        } catch (mainErr) {}
      }

      if (!executedViaScript) {
        const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'save' });
        if (response && response.success) {
          savedTotal = response.count || 0;
        }
      }

      if (savedTotal > 0) {
        showToast(`Captured ${savedTotal} field${savedTotal !== 1 ? 's' : ''}`);
        await loadProfile();
      } else {
        showToast('No new form values found on page');
      }
    } catch (error) {
      console.error('[Popup] Save error:', error);
      showToast('Failed to capture form data');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
}

  // Toggle AI Enforced Mode
  aiEnforcedMode.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ aiEnforcedMode: e.target.checked });
    await updateAiStatus();
    if (e.target.checked) {
      showToast('Mode: AI Enforced Active (Semantic Verification)');
    } else {
      showToast('Mode: Hybrid (Fast Regex + AI fallback)');
    }
  });

  // Toggle fill all mode
  fillAllFields.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ fillAllMode: e.target.checked });
    if (e.target.checked) {
      showToast('Mode: Fill all fields (including optional)');
    } else {
      showToast('Mode: Mandatory fields only');
    }
  });

  // Toggle overwrite mode
  if (overwriteFields) {
    overwriteFields.addEventListener('change', async (e) => {
      await chrome.storage.local.set({ overwriteMode: e.target.checked });
      if (e.target.checked) {
        showToast('Mode: Overwrite enabled (re-fill populated fields)');
      } else {
        showToast('Mode: Skip already filled fields');
      }
    });
  }

  // Generate AI Essays button
  if (generateEssaysBtn) {
    generateEssaysBtn.addEventListener('click', async () => {
      // First save current inputs so we have candidate's latest name, title, company
      const profile = (await saveProfileFromInputs(false)) || {};
      const candidateName = profile.fullName || (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : (profile.firstName || 'Candidate'));
      const title = profile.currentTitle || 'Software Engineer';
      const company = profile.currentCompany ? ` at ${profile.currentCompany}` : '';

      const generatedWhyUs = `I am excited to apply for this opportunity because your team's mission and engineering standards align closely with my career goals. With my background as a ${title}${company}, I look forward to contributing my technical problem-solving skills, collaborating on high-impact projects, and building resilient software with your team.`;
      const generatedProject = `In my experience as a ${title}, I spearheaded the architecture and delivery of a scalable, high-throughput feature from conception to production. I collaborated cross-functionally to optimize latency, implement comprehensive automated test suites, and ensure high availability while delivering measurable user value.`;
      const generatedCover = `Dear Hiring Team,\n\nI am writing to express my strong interest in joining your engineering organization as a ${title}. With a proven foundation in modern full-stack software development, distributed systems, and scalable APIs, I thrive when tackling complex technical challenges and turning product requirements into clean, scalable software.\n\nThroughout my career, I have prioritized engineering rigor, continuous learning, and close cross-functional collaboration. I would welcome the opportunity to bring my technical skills and dedication to your team.\n\nThank you for your time and consideration.\n\nSincerely,\n${candidateName}`;
      const generatedAbout = `${title} dedicated to developing scalable, high-performance applications and intuitive user experiences. Passionate about software craftsmanship, emerging technologies, and delivering impact.`;

      const whyUsEl = document.getElementById('whyUs');
      const projectHighlightEl = document.getElementById('projectHighlight');
      const coverLetterEl = document.getElementById('coverLetter');
      const aboutMeEl = document.getElementById('aboutMe');

      const isOverwrite = overwriteFields ? overwriteFields.checked : false;
      if (whyUsEl && (!whyUsEl.value.trim() || isOverwrite)) whyUsEl.value = generatedWhyUs;
      if (projectHighlightEl && (!projectHighlightEl.value.trim() || isOverwrite)) projectHighlightEl.value = generatedProject;
      if (coverLetterEl && (!coverLetterEl.value.trim() || isOverwrite)) coverLetterEl.value = generatedCover;
      if (aboutMeEl && (!aboutMeEl.value.trim() || isOverwrite)) aboutMeEl.value = generatedAbout;

      await saveProfileFromInputs(false);
      await loadProfile();
      showToast('AI Essays generated and saved.');
    });
  }

  // Save profile form submission
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProfileFromInputs(true);
    await loadProfile();
  });

  // Preset Quick Add Chips for Custom Fields
  if (presetChips && presetChips.length > 0) {
    presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const label = chip.dataset.label;
        const key = chip.dataset.key;
        const multiline = chip.dataset.multiline === 'true';

        // Check if field with this key or label already exists
        const existingInput = customFieldsContainer?.querySelector(`.custom-field-label-input[value="${label}"]`);
        if (existingInput) {
          const card = existingInput.closest('.custom-field-card');
          card?.querySelector('.custom-field-value-input')?.focus();
          showToast(`"${label}" is already added.`);
          return;
        }

        const emptyState = customFieldsContainer?.querySelector('.empty-custom-state');
        if (emptyState) emptyState.remove();

        const card = createCustomFieldCard({
          id: 'cf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          label: label,
          key: key,
          value: '',
          multiline: multiline
        });
        customFieldsContainer?.appendChild(card);
        const valueInput = card.querySelector('.custom-field-value-input');
        valueInput?.focus();
        saveProfileFromInputs(false);
      });
    });
  }

  // Add Custom Field button
  if (addCustomFieldBtn) {
    addCustomFieldBtn.addEventListener('click', () => {
      const emptyState = customFieldsContainer?.querySelector('.empty-custom-state');
      if (emptyState) emptyState.remove();

      const card = createCustomFieldCard({
        id: 'cf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        label: '',
        key: '',
        value: '',
        multiline: false
      });
      customFieldsContainer?.appendChild(card);
      const labelInput = card.querySelector('.custom-field-label-input');
      labelInput?.focus();
    });
  }

  // Tab View Switching
  viewFormBtn.addEventListener('click', () => {
    switchToFormView();
  });

  viewJsonBtn.addEventListener('click', async () => {
    formView.style.display = 'none';
    jsonView.style.display = 'block';
    viewFormBtn.classList.remove('active');
    viewJsonBtn.classList.add('active');

    const result = await chrome.storage.local.get(['profile']);
    const profile = result.profile || {};
    jsonEditor.value = JSON.stringify(profile, null, 2);
    updateJsonStats(profile);
  });

  // JSON controls
  formatJsonBtn.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(jsonEditor.value);
      jsonEditor.value = JSON.stringify(parsed, null, 2);
      showToast('JSON formatted');
    } catch (e) {
      showToast('Invalid JSON syntax');
    }
  });

  copyJsonBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(jsonEditor.value);
      showToast('Copied JSON to clipboard');
    } catch (e) {
      showToast('Failed to copy');
    }
  });

  saveJsonBtn.addEventListener('click', async () => {
    try {
      const parsed = JSON.parse(jsonEditor.value.trim());
      await chrome.storage.local.set({ profile: parsed });
      await loadProfile();
      showToast('Saved JSON changes to profile');
    } catch (e) {
      showToast('Invalid JSON format');
    }
  });

  // Export data
  exportBtn.addEventListener('click', async () => {
    try {
      const data = await chrome.storage.local.get(['profile']);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `career-autofill-profile-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();

      URL.revokeObjectURL(url);
      showToast('Profile exported');
    } catch (err) {
      showToast('Export failed');
    }
  });

  // Import data
  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const newProfile = parsed.profile || parsed;
      if (typeof newProfile === 'object' && newProfile !== null) {
        await chrome.storage.local.set({ profile: newProfile });
        await loadProfile();
        showToast('Profile imported');
      } else {
        showToast('Invalid JSON structure');
      }
    } catch (err) {
      showToast('Failed to import file');
    }

    importFile.value = '';
  });

  // Clear data
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all saved profile data?')) return;

    try {
      await chrome.storage.local.set({ profile: {} });
      await loadProfile();
      showToast('Profile cleared');
    } catch (err) {
      showToast('Failed to clear profile');
    }
  });

  // Run Page Diagnostics
  debugBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (typeof window.debugCareerAutofill === 'function') {
            window.debugCareerAutofill();
          } else {
            console.log('[Career Autofill] Diagnostic function not yet initialized. Refresh the page.');
          }
        }
      });
      showToast('Diagnostic printed to Console (F12)');
    } catch (e) {
      showToast('Could not run diagnostic on this page');
    }
  });

  // Initialization sequence
  await updateAiStatus();
  await loadProfile();
  await updatePageInfo();
});
