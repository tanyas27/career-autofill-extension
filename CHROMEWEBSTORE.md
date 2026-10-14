# Chrome Web Store Listing — Career Autofill

> Last Updated: 2026-10-09

## Store Listing

**Extension Name** [REQUIRED]
Career Autofill

**Short Description** [REQUIRED]
Automatically fill job application forms on Workday, SmartRecruiters, and ATS portals using on-device semantic AI. 100% private.

**Detailed Description** [REQUIRED]
Career Autofill is a lightweight, privacy-first browser extension that automates job applications across modern Applicant Tracking Systems (ATS) including Workday, SmartRecruiters, Greenhouse, Lever, Ashby, and BambooHR.

Unlike standard browser autofill tools that frequently fail on custom Web Components, nested Shadow DOMs, and synthetic React/Vue inputs, Career Autofill features a specialized DOM traversal engine combined with On-Device Semantic AI (powered by Chrome's Built-in Gemini Nano).

Key Features:
- AI Enforced Mode (Recommended): Converts forms into a Semantic Form Tree and requires strict AI arbitration before filling. Completely eliminates false-positive heuristic fills with visual purple verification glows.
- Dual-Engine AI Reasoning: Runs Chrome's on-device Gemini Nano Prompt API with instant fallback to a deterministic Local Semantic Reasoning Arbiter. 100% offline, zero cloud calls.
- Mandatory Fields First: Automatically detects and fills required fields marked with * or required attributes, saving time without filling unwanted optional fields.
- Deep ATS & Shadow DOM Compatibility: Seamlessly penetrates complex web components (such as SmartRecruiters spl-* inputs and Workday reactive components).
- Multiple Textarea Disambiguation: Intelligently distinguishes between multiple long-form questions on a single application (e.g. "Cover Letter" vs "Why Us" vs "Key Technical Project").
- React & Vue Synthetic Event Support: Injects values via native prototype descriptors so forms register state changes and don't reset when submitting.
- 100% Local Privacy: All data is stored in chrome.storage.local. Zero external server calls, zero tracking, zero cloud data transfer.
- Profile Integrity Protection: Protects candidate profile from unintentional web form pollution; easily manage profile data directly in the popup or JSON editor.
- Dynamic Custom Fields: Easily add work experience, skills, education, certifications, and bespoke ATS questions with instant auto-matching.

How to Use:
1. Click the Career Autofill icon in your toolbar to fill in your profile once.
2. Navigate to any job application or career portal.
3. Click "Autofill Form" in the popup or use the in-page floating action button to fill the form in seconds.
4. Review your inputs and submit your application!

Privacy Note:
Career Autofill does not transmit any personal data off your computer. Form filling and AI semantic analysis run 100% locally on your machine.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Automatically detects and fills candidate profile information into job application web forms.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
| :--- | :--- | :---: | :--- |
| Store Icon [REQUIRED] | 128×128 PNG | Ready | `icons/icon-128.png` |
| Small Icon | 48×48 PNG | Ready | `icons/icon-48.png` |
| Toolbar Icon | 16×16 PNG | Ready | `icons/icon-16.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | Pending | Extension popup with profile form and AI status |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | Pending | In-page autofill action on Workday/SmartRecruiters |
| Small Promo Tile [RECOMMENDED] | 440×280 | Pending | Promo banner with Career Autofill branding |

---

## Permissions Justification

| Permission | Type | Justification |
| :--- | :--- | :--- |
| `storage` | permissions | Used to store the user's career profile (contact info, work history, links, and essay responses) locally on the device using chrome.storage.local. |
| `activeTab` | permissions | Used to inspect the active tab and trigger autofill or form capture only on the tab the user is actively viewing. |
| `scripting` | permissions | Used to programmatically inject the field detector and content scripts onto the active tab when the user triggers autofill. |
| `tabs` | permissions | Used to check the URL of the active tab to confirm if it is a job application portal or an internal chrome:// page, and display the relevant page status. |
| `<all_urls>` | host_permissions | Job application portals run on diverse, unpredictable company domains (e.g. careers.uber.com, jobs.stripe.com, apply.deloitte.com). Broad host permissions are necessary to detect and fill forms on all employer portals. |

---

## Privacy & Data Use

### Data Collection
**Does the extension collect user data?** No (No data is transmitted off the device).

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
| :--- | :---: | :---: | :--- | :---: |
| Personally identifiable info | Locally only | No | User profile form autofilling | No |
| Health info | No | No | N/A | No |
| Financial info | No | No | N/A | No |
| Authentication info | No | No | N/A | No |
| Personal communications | No | No | N/A | No |
| Location | No | No | N/A | No |
| Web history | No | No | N/A | No |
| User activity | No | No | N/A | No |
| Website content | Locally only | No | Analyzed in-memory to classify form inputs | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL**: https://github.com/tanyas27/career-autofill-extension/blob/main/SECURITY.md

Career Autofill is completely local-first. We do not operate external servers, telemetry, or user tracking. All profile data stays inside your browser's local storage.

---

## Distribution

**Visibility**: Public  
**Regions**: All regions  
**Pricing**: Free  

---

## Version History

| Version | Date | Changes | Status |
| :--- | :--- | :--- | :---: |
| 2.2.0 | 2026-10-14 | Added Dynamic Custom Fields Manager, AI Enforced Mode default, Virtusa/Taleo table layout & iframe autofill, profile integrity protection, and 59 automated test suites. | Current |
| 2.1.0 | 2026-10-09 | Added On-Device Gemini Nano AI semantic matching, expanded essay fields, SFT abstraction, and updated UI. | Previous |
| 2.0.0 | 2026-10-09 | Initial Manifest V3 release with Shadow DOM support and JSON editor. | Archive |
