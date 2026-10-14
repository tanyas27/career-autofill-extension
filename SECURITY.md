# Security Audit & Privacy Policy

**Last Audit:** October 9, 2026  
**Status:** Passed — Professional Grade, Zero Cloud Egress

## Security Measures Implemented

### 1. Content Security Policy (CSP)
- Strict CSP enforced in `manifest.json`: `"extension_pages": "script-src 'self'; object-src 'self'"`.
- No inline scripts or `eval()` allowed.
- Only self-sourced scripts packaged in the extension are permitted.

### 2. Input Sanitization & Data Safety
- All user profile data stored and retrieved exclusively via `chrome.storage.local`.
- No dynamic code execution (`eval`, `new Function()`, or dynamic script tags).
- No unsafe `innerHTML` assignments with user profile data.
- Form values are set directly via DOM properties (`.value`, `HTMLInputElement.prototype.set`) with bubbling event dispatch.

### 3. Safe DOM Manipulation
- Static SVG icons use safe, hardcoded strings.
- DOM traversal is strictly read-and-fill for interactive form elements.
- Sensitive elements (`type="password"`) are strictly ignored and never saved or autofilled.

### 4. Permissions
- Minimal required permissions:
  - `storage` — for saving user profile data locally.
  - `activeTab` — for triggering autofill on the active tab only.
  - `scripting` — for executing the content scripts upon user request.
  - `tabs` — for inspecting tab URLs to determine whether a page is an ATS portal.
  - `host_permissions: <all_urls>` — required because employer career portals run on unpredictable corporate domains.

### 5. Data Storage
- All user data stored locally via Chrome Storage API.
- Zero external data transmission.
- Zero tracking or analytics.
- Zero third-party cloud API calls.

### 6. Cross-Site Scripting (XSS) Prevention
- No `postMessage` with wildcard origins.
- Content scripts operate strictly in isolated worlds from page scripts.
- No remote script loading.

### 7. On-Device AI Security (Gemini Nano)
- **Zero Cloud Egress**: Semantic AI matching uses Chrome's Prompt API (`LanguageModel`), which executes on-device via local GPU/NPU/CPU.
- **No Remote LLM Endpoints**: No data, resume text, or form contents are sent to external OpenAI, Anthropic, or cloud Gemini servers.
- **Strict JSON Schema Constraints**: AI inference outputs are constrained by structured JSON schemas to prevent unpredictable or malicious outputs.

## Safe Practices Confirmed
- No `eval()` or `Function()`
- No `document.write()`
- No unsafe `innerHTML` with user data
- No external HTTP requests (`fetch` / `XMLHttpRequest`)
- Passwords excluded from detection and saving
- Console logging for debugging (no sensitive data logged)
