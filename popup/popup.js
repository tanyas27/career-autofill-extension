/**
 * Popup Script - Handles UI and communication
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const pageStatus = document.getElementById('pageStatus');
  const fieldCount = document.getElementById('fieldCount');
  const autofillBtn = document.getElementById('autofillBtn');
  const saveBtn = document.getElementById('saveBtn');
  const debugBtn = document.getElementById('debugBtn');
  const profileForm = document.getElementById('profileForm');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const clearBtn = document.getElementById('clearBtn');
  const toast = document.getElementById('toast');
  const viewFormBtn = document.getElementById('viewFormBtn');
  const viewJsonBtn = document.getElementById('viewJsonBtn');
  const formView = document.getElementById('formView');
  const jsonView = document.getElementById('jsonView');
  const jsonEditor = document.getElementById('jsonEditor');
  const saveJsonBtn = document.getElementById('saveJsonBtn');
  const fillAllFields = document.getElementById('fillAllFields');

  let currentTab = null;

  /**
   * Show toast notification
   */
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  /**
   * Inject content script into current tab
   */
  async function injectContentScript(tabId) {
    console.log('[Popup] Injecting scripts into tab:', tabId);

    try {
      // Check if already injected
      console.log('[Popup] Checking if already injected...');
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response && response.success) {
        console.log('[Popup] Already injected!');
        return true;
      }
    } catch (e) {
      console.log('[Popup] Not injected yet, injecting now...', e.message);
    }

    try {
      console.log('[Popup] Injecting field-detector.js...');
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['field-detector.js']
      });

      console.log('[Popup] Injecting content.js...');
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });

      console.log('[Popup] ✅ Scripts injected successfully!');

      // Wait a bit for scripts to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      return true;
    } catch (error) {
      console.error('[Popup] ❌ Injection error:', error);
      console.error('[Popup] Error message:', error.message);
      console.error('[Popup] Error stack:', error.stack);

      // Show user-friendly error
      if (error.message.includes('Cannot access')) {
        showToast('❌ Cannot access this page');
      } else {
        showToast('❌ Script injection failed');
      }

      return false;
    }
  }

  /**
   * Update page info
   */
  async function updatePageInfo() {
    console.log('[Popup] Updating page info...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTab = tab;

      console.log('[Popup] Current tab:', {
        id: tab?.id,
        url: tab?.url,
        title: tab?.title
      });

      if (!tab || !tab.id) {
        pageStatus.textContent = 'No active tab';
        fieldCount.textContent = '-';
        autofillBtn.disabled = true;
        saveBtn.disabled = true;
        return;
      }

      // Skip chrome:// and extension pages
      if (tab.url?.startsWith('chrome://') ||
          tab.url?.startsWith('chrome-extension://') ||
          tab.url?.startsWith('edge://') ||
          tab.url?.startsWith('about:')) {
        pageStatus.textContent = 'Not available on this page';
        fieldCount.textContent = '-';
        autofillBtn.disabled = true;
        saveBtn.disabled = true;
        console.log('[Popup] Skipping protected page:', tab.url);
        return;
      }

      // Inject content script
      const injected = await injectContentScript(tab.id);
      if (!injected) {
        pageStatus.textContent = 'Script injection failed';
        fieldCount.textContent = '-';
        autofillBtn.disabled = true;
        saveBtn.disabled = true;
        console.error('[Popup] Failed to inject scripts');
        return;
      }

      // Get page info
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
        if (response && response.success) {
          const info = response.info;
          pageStatus.textContent = 'Ready';
          fieldCount.textContent = info.mandatoryFields;
          // Don't disable autofill - we can fill fields even if no mandatory ones detected
          autofillBtn.disabled = info.totalFields === 0;
          saveBtn.disabled = false;
          console.log('[Popup] Page info:', info);
        } else {
          throw new Error('Invalid response from content script');
        }
      } catch (msgError) {
        console.error('[Popup] Failed to get page info:', msgError);
        pageStatus.textContent = 'Communication error';
        fieldCount.textContent = '-';
        autofillBtn.disabled = true;
        saveBtn.disabled = false; // Still allow saving if we managed to inject
      }
    } catch (error) {
      console.error('[Popup] Update page info error:', error);
      pageStatus.textContent = 'Error';
      fieldCount.textContent = '-';
      autofillBtn.disabled = true;
      saveBtn.disabled = true;
    }
  }

  /**
   * Autofill current page
   */
  // Load fill all mode setting (default to true)
  chrome.storage.local.get(['fillAllMode']).then(result => {
    // Default to true if not set
    const fillAll = result.fillAllMode !== undefined ? result.fillAllMode : true;
    fillAllFields.checked = fillAll;
    // Save the default if not set
    if (result.fillAllMode === undefined) {
      chrome.storage.local.set({ fillAllMode: true });
    }
  });

  // Save fill all mode setting
  fillAllFields.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ fillAllMode: e.target.checked });
    if (e.target.checked) {
      showToast('🔧 Debug mode ON: Will fill all fields');
    } else {
      showToast('✓ Normal mode: Only mandatory fields');
    }
  });

  autofillBtn.addEventListener('click', async () => {
    if (!currentTab || !currentTab.id) return;

    autofillBtn.disabled = true;
    autofillBtn.textContent = 'Filling...';

    try {
      const fillAll = fillAllFields.checked;
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'autofill',
        fillAll: fillAll
      });
      if (response && response.success) {
        showToast(`✅ Filled ${response.count} field${response.count !== 1 ? 's' : ''}`);
      } else {
        showToast('❌ Autofill failed');
      }
    } catch (error) {
      console.error('Autofill error:', error);
      showToast('❌ Autofill failed');
    }

    autofillBtn.disabled = false;
    autofillBtn.textContent = '⚡ Autofill';
  });

  /**
   * Save current form
   */
  saveBtn.addEventListener('click', async () => {
    if (!currentTab || !currentTab.id) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'save' });
      if (response && response.success) {
        showToast(`✅ Saved ${response.count} field${response.count !== 1 ? 's' : ''}`);
        await loadProfile();
      } else {
        showToast('❌ Save failed');
      }
    } catch (error) {
      console.error('Save error:', error);
      showToast('❌ Save failed');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Current Form';
  });

  /**
   * Load profile data
   */
  async function loadProfile() {
    try {
      const result = await chrome.storage.local.get(['profile']);
      const profile = result.profile || {};

      // Fill form fields
      const inputs = profileForm.querySelectorAll('input, select');
      inputs.forEach(input => {
        const name = input.name;
        if (profile[name]) {
          input.value = profile[name];
        }
      });
    } catch (error) {
      console.error('Load profile error:', error);
    }
  }

  /**
   * Debug button - runs debugCareerAutofill() in page console
   */
  debugBtn.addEventListener('click', async () => {
    if (!currentTab || !currentTab.id) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
          if (typeof window.debugCareerAutofill === 'function') {
            window.debugCareerAutofill();
          } else {
            console.error('[Career Autofill] Debug function not available. Refresh the page and try again.');
          }
        }
      });
      showToast('✅ Check browser console (F12)');
    } catch (error) {
      console.error('Debug error:', error);
      showToast('❌ Debug failed - refresh page');
    }
  });

  /**
   * View switching
   */
  viewFormBtn.addEventListener('click', () => {
    formView.style.display = 'block';
    jsonView.style.display = 'none';
    viewFormBtn.classList.add('active');
    viewJsonBtn.classList.remove('active');
  });

  /**
   * Update JSON stats
   */
  function updateJsonStats(profile) {
    const stats = document.getElementById('jsonStats');
    const fieldCount = Object.keys(profile).length;
    stats.textContent = `${fieldCount} field${fieldCount !== 1 ? 's' : ''}`;
  }

  /**
   * Format JSON
   */
  function formatJson() {
    try {
      const json = JSON.parse(jsonEditor.value);
      jsonEditor.value = JSON.stringify(json, null, 2);
      showToast('✅ JSON formatted');
    } catch (error) {
      showToast('❌ Invalid JSON');
    }
  }

  /**
   * Copy JSON to clipboard
   */
  async function copyJson() {
    try {
      await navigator.clipboard.writeText(jsonEditor.value);
      showToast('✅ Copied to clipboard');
    } catch (error) {
      showToast('❌ Failed to copy');
    }
  }

  viewJsonBtn.addEventListener('click', async () => {
    formView.style.display = 'none';
    jsonView.style.display = 'block';
    viewFormBtn.classList.remove('active');
    viewJsonBtn.classList.add('active');

    // Load current profile into JSON editor
    const result = await chrome.storage.local.get(['profile']);
    const profile = result.profile || {};
    jsonEditor.value = JSON.stringify(profile, null, 2);
    updateJsonStats(profile);
  });

  // Format JSON button
  document.getElementById('formatJsonBtn').addEventListener('click', formatJson);

  // Copy JSON button
  document.getElementById('copyJsonBtn').addEventListener('click', copyJson);

  /**
   * Save JSON
   */
  saveJsonBtn.addEventListener('click', async () => {
    try {
      const jsonText = jsonEditor.value.trim();
      const profile = JSON.parse(jsonText);

      await chrome.storage.local.set({ profile });
      await loadProfile();
      updateJsonStats(profile);
      showToast('✅ JSON saved');
    } catch (error) {
      console.error('JSON parse error:', error);
      showToast('❌ Invalid JSON format');
    }
  });

  /**
   * Save profile
   */
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const result = await chrome.storage.local.get(['profile']);
      const profile = result.profile || {};

      // Get form data
      const formData = new FormData(profileForm);
      for (const [key, value] of formData.entries()) {
        const trimmed = value.trim();
        if (trimmed) {
          profile[key] = trimmed;
        } else {
          delete profile[key];
        }
      }

      await chrome.storage.local.set({ profile });
      showToast('✅ Profile saved');
    } catch (error) {
      console.error('Save profile error:', error);
      showToast('❌ Failed to save profile');
    }
  });

  /**
   * Export data
   */
  exportBtn.addEventListener('click', async () => {
    try {
      const data = await chrome.storage.local.get(['profile']);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `career-autofill-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();

      URL.revokeObjectURL(url);
      showToast('✅ Data exported');
    } catch (error) {
      console.error('Export error:', error);
      showToast('❌ Export failed');
    }
  });

  /**
   * Import data
   */
  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.profile) {
        await chrome.storage.local.set({ profile: data.profile });
        await loadProfile();
        showToast('✅ Data imported');
      } else {
        showToast('❌ Invalid file format');
      }
    } catch (error) {
      console.error('Import error:', error);
      showToast('❌ Import failed');
    }

    importFile.value = '';
  });

  /**
   * Clear all data
   */
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all saved data? This cannot be undone.')) return;

    try {
      await chrome.storage.local.clear();
      await loadProfile();
      showToast('✅ All data cleared');
    } catch (error) {
      console.error('Clear error:', error);
      showToast('❌ Failed to clear data');
    }
  });

  // Initialize
  await updatePageInfo();
  await loadProfile();
});
