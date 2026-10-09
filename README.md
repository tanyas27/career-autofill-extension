# Career Autofill Extension

A Chrome extension that automatically fills mandatory fields on job application forms (Workday, SmartRecruiters, and other career sites).

## Features

- **Mandatory Fields Only**: Only saves and fills required fields marked with * or `required` attribute
- **Auto-save**: Automatically saves your input as you fill forms
- **Simple Profile**: Manage your basic information in one place
- **Import/Export**: Backup and restore your data
- **Clean UI**: Simple, focused interface

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `career-autofill-extension` folder
5. The extension icon should appear in your toolbar

## How to Use

### First Time Setup

1. Click the extension icon
2. Fill in your profile information
3. Click "Save Profile"

### On Job Application Sites

**Autofill**: Navigate to job page → Click extension icon → Click "⚡ Autofill"
**Save**: Fill form manually → Click "💾 Save Current Form"

### Supported Sites

- Workday, SmartRecruiters, Greenhouse, Lever
- Any career/jobs page with standard HTML forms

## Privacy

- 100% Local - All data stored in your browser only
- No external servers or tracking

## File Structure

```
career-autofill-extension/
├── manifest.json
├── background.js
├── field-detector.js
├── content.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── icons/
```

## License

Free to use and modify.
