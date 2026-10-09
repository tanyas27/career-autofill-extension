/**
 * Background Service Worker
 */

console.log('🟢 [Career Autofill] Background service worker starting...');

// Initialize storage on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('🔵 [Career Autofill] Extension installed/updated:', details.reason);

  try {
    const result = await chrome.storage.local.get(['profile']);
    if (!result.profile) {
      await chrome.storage.local.set({ profile: {} });
      console.log('✅ [Career Autofill] Initialized empty profile');
    } else {
      console.log('✅ [Career Autofill] Profile exists:', Object.keys(result.profile).length, 'fields');
    }
  } catch (error) {
    console.error('❌ [Career Autofill] Installation error:', error);
  }
});

console.log('✅ [Career Autofill] Background service worker ready!');
