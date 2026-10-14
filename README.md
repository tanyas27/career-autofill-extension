# Career Autofill Extension

[![Latest Release](https://img.shields.io/github/v/release/tanyas27/career-autofill-extension?color=brightgreen&label=Latest%20Release)](https://github.com/tanyas27/career-autofill-extension/releases/latest)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](manifest.json)
[![AI Engine](https://img.shields.io/badge/AI-On--Device%20Gemini%20Nano-purple)](https://developer.chrome.com/docs/ai)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Brave-orange)](https://github.com/tanyas27/career-autofill-extension)

A lightweight, professional-grade Chrome extension that automatically detects and fills job application forms across modern Applicant Tracking Systems (ATS) including **Workday, SmartRecruiters, Greenhouse, Lever, Ashby, and BambooHR**.

Powered by a **Tiered Hybrid Engine** combining deep Shadow DOM traversal with **On-Device Gemini AI (Chrome Prompt API)** for semantic understanding of complex questions and multiple textareas—with **100% local privacy and zero cloud data transfer**.

---

## Quick Installation (For Users)

Install the extension directly in under a minute without needing Git or coding tools:

1. **Download the latest release**:
   Go to [**GitHub Releases**](https://github.com/tanyas27/career-autofill-extension/releases/latest) and download `career-autofill-v*.zip`.
2. **Extract the ZIP**:
   Unzip the file into a permanent folder on your computer.
3. **Open Chrome Extensions**:
   Navigate to `chrome://extensions/` (or Edge at `edge://extensions/`).
4. **Enable Developer Mode**:
   Toggle on the **Developer mode** switch in the top-right corner.
5. **Load Extension**:
   Click **Load unpacked** (top-left) and select the extracted folder (containing `manifest.json`).
6. **Pin to Toolbar**:
   Click the puzzle piece icon in Chrome's toolbar and pin **Career Autofill**.

---

## How the AI Works: AI Enforced Mode & Dual Semantic Engine

Traditional autofill extensions break on modern career portals because they rely purely on rigid CSS selectors and keyword regexes. When a portal presents multiple essay boxes (*"Why Us"*, *"Cover Letter"*, *"Technical Project"*) or ambiguous custom dropdowns, static heuristic tools fail or overwrite wrong fields.

Career Autofill introduces **AI Enforced Mode**: rather than blindly guessing with heuristics, every field is extracted into a **Semantic Form Tree (SFT)** and submitted to an AI Arbiter. Fields are only populated when the AI validates the field with high confidence (>= 0.70), providing purple glowing verification indicators.

```
+-----------------------------------------------------------------------------------+
| 1. Form Scanning & Semantic Form Tree (SFT) Extraction                            |
|    Deep DOM & open Shadow DOM traversal extracts interactive fields & context.     |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 2. AI Semantic Arbiter (Dual-Engine)                                              |
|    - Engine A: Chrome Built-in Gemini Nano (On-Device Prompt API)                  |
|    - Engine B: Local Semantic Reasoning Arbiter (Deterministic Offline Engine)     |
|    Resolves complex question intent, multi-textarea essays, and selects.          |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. Execution & Verification Feedback                                              |
|    - High Confidence (>= 0.70): Field populated via native prototype setters.     |
|    - Low Confidence / Irrelevant: Untouched (prevents data corruption).           |
|    - AI Enforced Visuals: Distinct purple glow feedback (#8b5cf6) on filled inputs.|
+-----------------------------------------------------------------------------------+
```

### AI Enforced Mode vs Classic Mode
- **AI Enforced Mode (Recommended)**: Strict AI arbitration is mandatory. Every target field is vetted by the AI before writing. Zero false positives on phone country codes, custom essays, or ambiguous legal checkboxes.
- **Classic Fast Mode**: Runs instantaneous heuristic pattern matching first, invoking the AI arbiter only for ambiguous or long-form textarea questions.

### Enabling Gemini Nano Locally (Optional)
To activate on-device Gemini Nano in Chrome:
1. Open `chrome://flags/` in Chrome.
2. Set `#prompt-api-for-gemini-nano` to **Enabled**.
3. Set `#optimization-guide-on-device-model` to **Enabled BypassPerfRequirement**.
4. Relaunch Chrome, open `chrome://components/`, and ensure **Optimization Guide On Device Model** is updated.
5. The extension popup will display **Gemini Nano Active**!

---

## Core Features

- **Mandatory Fields First**: Focuses on required fields marked with `*` or `required` attributes, saving time without filling unwanted optional fields.
- **Deep ATS & Shadow DOM Support**: Traverses open Shadow DOMs (e.g. SmartRecruiters `spl-*` components and Workday dynamic containers).
- **Multiple Textarea Disambiguation**: Intelligently maps separate textareas for *Cover Letter*, *Why Us*, *Technical Project Highlight*, and *About Me*.
- **Profile Integrity Protection**: User profile data is guarded against web-form pollution; candidate profiles are securely managed and persisted via the popup interface and JSON editor.
- **Dynamic Custom Fields Manager**: Seamlessly configure custom questions (e.g., Work Experience, Technical Skills, Education, Certifications, Years of Exp, Clearance).
- **React & Vue State Compatibility**: Bypasses synthetic event suppression using native prototype setters so forms don't clear upon submit.
- **100% Local Privacy**: Zero external API calls, zero analytics, zero data leaves your computer.
- **Power-User JSON Editor**: Direct dark-mode JSON editor for inspecting raw profile data, formatting, copying, or adding custom fields.

---

## Developer Installation & Packaging

1. Clone this repository:
   ```bash
   git clone https://github.com/tanyas27/career-autofill-extension.git
   cd career-autofill-extension
   ```
2. In `chrome://extensions/`, click **Load unpacked** and select this directory.

### Run Automated Test Suite
The extension includes a comprehensive 59-test suite auditing DOM traversal, the AI Semantic Arbiter, Gemini Nano Prompt API contract, Workday/SmartRecruiters/Greenhouse/Lever/Taleo fixtures, and custom fields:
```bash
npm install
npm test
```

### Build Production Archive
To test and bundle the production `.zip` with SHA-256 integrity checksums:
```bash
./scripts/package.sh
```

---

## Security & Privacy

- **100% Local Storage**: All profile data is saved in `chrome.storage.local`.
- **Zero Cloud Egress**: Form analysis and Gemini Nano AI inference run entirely on your local GPU/CPU.
- **Password Guards**: Form elements with `type="password"` are strictly ignored.
- **Auditable**: Fully open source. See [SECURITY.md](SECURITY.md) for full audit disclosures.

---

## License

Free to use and modify under standard open-source principles.
