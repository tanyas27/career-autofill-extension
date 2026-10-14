/**
 * Field Detector - Identifies, classifies, and interacts with form fields.
 * Supports standard HTML5 inputs, React/Vue synthetic inputs, deep Shadow DOM,
 * and ATS custom Web Components (SmartRecruiters, Workday, Greenhouse, Lever, etc.).
 */

console.log('[Career Autofill] field-detector.js initializing...');

var FieldDetector = window.FieldDetector || {
  // Canonical field mappings for Tier 1 heuristic matching
  FIELDS: {
    // High-priority essay / long-form fields (checked first for textareas to prevent false-positives)
    whyUs: ['why do you want to work', 'why us', 'why this company', 'why are you interested', 'why this role', 'what excites you', 'why join', 'reason for applying', 'why are you applying'],
    projectHighlight: ['challenging project', 'technical achievement', 'project highlight', 'most proud of', 'technical challenge', 'impactful project', 'technical experience', 'proud project'],
    coverLetter: ['cover letter', 'letter of interest', 'message to hiring manager', 'note to hiring manager', 'coverletter', 'optional cover letter'],
    aboutMe: ['about yourself', 'tell us about yourself', 'summary', 'bio', 'brief bio', 'professional summary', 'elevator pitch', 'candidate summary'],

    // Contact & Name Fields
    fullName: ['full name', 'fullname', 'legal name', 'complete name', 'your name', 'candidate name'],
    firstName: ['first name', 'given name', 'firstname', 'fname'],
    lastName: ['last name', 'surname', 'lastname', 'lname', 'family name'],
    email: ['email', 'e-mail', 'email address'],
    countryCode: ['country phone code', 'country code', 'countrycode', 'country_code', 'dial code', 'dialing code', 'phone code', 'calling code'], // Blacklisted to protect dial selectors
    phone: ['phone number', 'phone', 'telephone', 'mobile number', 'mobile', 'cell phone', 'cell'],
    address: ['address', 'street', 'street address', 'address line 1'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region', 'state/province'],
    zipCode: ['zip', 'postal', 'postcode', 'zip code', 'postal code'],
    country: ['country', 'country/region'],
    linkedin: ['linkedin', 'linkedin profile', 'linkedin url'],
    github: ['github', 'github profile', 'github url'],
    portfolio: ['portfolio', 'website', 'personal site', 'portfolio url', 'personal website'],
    currentCompany: ['current company', 'most recent company', 'current employer', 'employer', 'company'],
    currentTitle: ['current title', 'job title', 'title', 'position', 'current position', 'most recent title'],
    workAuth: ['authorized to work', 'work authorization', 'legal authorization', 'legally authorized', 'authorized to work in'],
    sponsorship: ['visa sponsorship', 'require sponsorship', 'need sponsorship', 'sponsorship now or in the future', 'sponsorship'],
    workAuthCountries: ['citizenship', 'country of citizenship', 'authorized countries', 'countries authorized to work', 'work authorization country', 'eligible to work in', 'work eligible country', 'countries you are authorized to work in', 'country of nationality'],
    todaysDate: ['today s date', 'todays date', 'current date', 'date today', 'signature date', 'date of signature'],
    salaryExpectations: ['salary expectations', 'desired salary', 'expected salary', 'compensation expectation', 'target compensation', 'target salary', 'desired compensation'],
    noticePeriod: ['notice period', 'earliest start date', 'start date', 'how soon can you start', 'availability to start', 'available start date', 'start availability'],
    workExperience: ['work experience', 'relevant experience', 'employment history', 'experience summary', 'work history', 'professional experience', 'past experience', 'previous experience', 'summary of experience', 'job experience', 'describe your experience'],
    yearsOfExperience: ['years of experience', 'total experience', 'years of relevant experience', 'years experience', 'number of years of experience', 'how many years of experience'],
    skills: ['skills', 'technical skills', 'core competencies', 'technologies', 'programming languages', 'tools and technologies', 'key skills', 'relevant skills'],
    education: ['education', 'highest education', 'degree', 'university', 'college', 'highest degree', 'educational background', 'school', 'level of education', 'degree obtained'],
    certifications: ['certifications', 'licenses', 'certificates', 'accreditations', 'professional certifications'],
    pronouns: ['pronouns', 'preferred pronouns'],
    gender: ['gender', 'gender identity'],
    veteranStatus: ['veteran status', 'military status'],
    disabilityStatus: ['disability status', 'disability']
  },

  // Known country aliases for location-specific visa and authorization checks
  COUNTRY_ALIASES: {
    'united states': ['united states', 'usa', 'u.s.', 'u.s.a.', 'america', 'american'],
    'canada': ['canada', 'canadian'],
    'united kingdom': ['united kingdom', 'great britain', 'britain', 'british', 'england'],
    'india': ['india', 'indian'],
    'australia': ['australia', 'australian'],
    'germany': ['germany', 'german', 'deutschland'],
    'france': ['france', 'french'],
    'singapore': ['singapore', 'singaporean'],
    'ireland': ['ireland', 'irish'],
    'netherlands': ['netherlands', 'dutch', 'holland'],
    'european union': ['european union', 'eea']
  },

  /**
   * Detect if a question context explicitly mentions a specific country
   */
  detectCountryInText(text) {
    if (!text) return null;
    const normalized = ` ${this.normalize(text)} `;

    for (const [canonicalCountry, aliases] of Object.entries(this.COUNTRY_ALIASES)) {
      for (const alias of aliases) {
        const regex = new RegExp(`(^|\\s)${alias.trim()}($|\\s)`, 'i');
        if (regex.test(normalized)) {
          return canonicalCountry;
        }
      }
    }
    return null;
  },

  /**
   * Evaluate whether user has authorization in a target country mentioned in a question
   */
  evaluateCountryWorkAuth(questionText, profile) {
    const mentionedCountry = this.detectCountryInText(questionText);
    if (!mentionedCountry) {
      return { hasCountryContext: false, isAuthorized: true };
    }

    const userCountriesText = `${profile.workAuthCountries || ''} ${profile.country || ''}`.toLowerCase();
    const isAuthorized = userCountriesText.includes(mentionedCountry) ||
      (this.COUNTRY_ALIASES[mentionedCountry] && this.COUNTRY_ALIASES[mentionedCountry].some(a => userCountriesText.includes(a.trim())));

    return {
      hasCountryContext: true,
      targetCountry: mentionedCountry,
      isAuthorized: isAuthorized
    };
  },

  /**
   * Get today's date in various formats
   */
  getTodaysDate(format) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    if (format === 'iso') {
      return `${year}-${month}-${day}`;
    }
    return `${month}/${day}/${year}`;
  },

  /**
   * Normalize text for consistent comparisons
   */
  normalize(text) {
    if (!text) return '';
    return text.toLowerCase()
      .replace(/[*:,?_\-()[\]\/"'’]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Determine if a field is required / mandatory using multi-signal heuristics
   */
  isMandatory(element) {
    if (!element) return false;

    // 1. Native HTML5 required attribute
    if (element.required || element.hasAttribute('required')) {
      return true;
    }

    // 2. ARIA required
    if (element.getAttribute('aria-required') === 'true') {
      return true;
    }

    // 3. Class markers
    if (element.classList.contains('required') || element.classList.contains('is-required')) {
      return true;
    }

    // 4. Data attributes
    if (element.getAttribute('data-required') === 'true' || element.getAttribute('data-is-required') === 'true') {
      return true;
    }

    // 5. Placeholder asterisk
    const placeholder = element.getAttribute('placeholder') || '';
    if (placeholder.includes('*')) {
      return true;
    }

    // 6. Label inspections (including CSS ::after/::before pseudo-elements and SVG icons)
    const label = this.getLabel(element);
    if (label) {
      const labelText = label.textContent || '';
      if (labelText.includes('*')) {
        return true;
      }
      const labelLower = labelText.toLowerCase();
      if (labelLower.includes('required') && !labelLower.includes('not required') && !labelLower.includes('optional')) {
        return true;
      }
      if (label.querySelector('[aria-required="true"], .required, .is-required, abbr[title*="required" i], .req-star, .mandatory, .asterisk, [class*="required" i], svg[class*="required" i]')) {
        return true;
      }
      // Detect CSS pseudo-element asterisks (e.g. label::after { content: "*" } or Tailwind after:content-['*'])
      try {
        if (typeof window !== 'undefined' && window.getComputedStyle) {
          const afterContent = window.getComputedStyle(label, '::after')?.content || '';
          const beforeContent = window.getComputedStyle(label, '::before')?.content || '';
          if (afterContent.includes('*') || beforeContent.includes('*')) {
            return true;
          }
        }
      } catch (e) {}
    }

    // 7. Parent ATS container inspection
    const container = element.closest('[data-automation-id="formField"], .form-group, .c-form-item, .field-container, .form-field, spl-internal-form-field, .application-field, .application-question, .form-item, .ant-form-item, .chakra-form-control, .MuiFormControl-root, .form-row, .form_row');
    if (container) {
      if (container.classList.contains('required') || container.classList.contains('is-required') || container.getAttribute('data-required') === 'true') {
        return true;
      }
      const containerLabel = container.querySelector('label, [data-automation-id="formLabel"], .label, .field-label, [class*="label"]');
      if (containerLabel) {
        if (containerLabel.textContent && containerLabel.textContent.includes('*')) {
          return true;
        }
        try {
          if (typeof window !== 'undefined' && window.getComputedStyle) {
            const afterContent = window.getComputedStyle(containerLabel, '::after')?.content || '';
            if (afterContent.includes('*')) return true;
          }
        } catch (e) {}
      }
      if (container.querySelector('.required, .is-required, abbr[title*="required" i], .req-star, .mandatory, .input-required, [class*="required"], [class*="mandatory"], img[alt*="required" i], svg[class*="required" i]')) {
        return true;
      }
    }


    // 8. Table-based layouts (Oracle Taleo, SelectMinds, BrassRing, legacy enterprise ATS)
    const td = element.closest('td');
    if (td) {
      const prevTd = td.previousElementSibling;
      if (prevTd && (prevTd.textContent.includes('*') || prevTd.querySelector('.required, .mandatory, .input-required, img[alt*="required" i]'))) {
        return true;
      }
      const tr = td.closest('tr');
      if (tr && (tr.classList.contains('required') || tr.querySelector('.input-required, .mandatory, [class*="required"], [class*="mandatory"], img[alt*="required" i]'))) {
        return true;
      }
    }

    return false;
  },

  /**
   * Resolve root (document or shadowRoot)
   */
  getRoot(element) {
    return element.getRootNode ? element.getRootNode() : document;
  },

  /**
   * Find label for an element
   */
  getLabel(element) {
    if (!element) return null;
    const root = this.getRoot(element);

    // 1. label[for="id"]
    if (element.id) {
      try {
        const label = root.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label) return label;
      } catch (e) {}
    }

    // 2. Enclosing parent label
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel;

    // 3. aria-labelledby
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(' ');
      for (const id of ids) {
        const labelEl = root.getElementById ? root.getElementById(id) : document.getElementById(id);
        if (labelEl) return labelEl;
      }
    }

    // 4. aria-label virtual label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      const span = document.createElement('span');
      span.textContent = ariaLabel;
      return span;
    }

    // 5. Host element data-test (for shadow DOM web components)
    let host = root.host;
    if (host) {
      const testAttr = host.getAttribute('data-test') || host.parentElement?.getAttribute('data-test');
      if (testAttr) {
        const label = host.parentElement?.querySelector('label');
        if (label) return label;
      }
    }

    // 6. ATS container labels
    const container = element.closest('[data-automation-id="formField"], .form-group, .c-form-item, .field-container, .form-field, fieldset, spl-internal-form-field, .application-question, .form-row, .form_row');
    if (container) {
      const label = container.querySelector('label, [data-automation-id="formLabel"], legend, .label, .field-label, [slot="label-content"], [class*="label"], [class*="title"]');
      if (label && !label.contains(element)) return label;

      const containerRoot = this.getRoot(container);
      if (containerRoot !== document) {
        const shadowLabel = containerRoot.querySelector('label');
        if (shadowLabel) return shadowLabel;
      }
    }

    // 7. Sibling label or preceding element with label/title styling
    let prev = element.previousElementSibling;
    if (prev) {
      if (prev.tagName === 'LABEL') return prev;
      if (prev.classList.contains('label') || prev.classList.contains('field-label') || prev.classList.contains('form-label') || prev.classList.contains('title') || prev.classList.contains('field-title')) {
        return prev;
      }
    }

    // 8. Table-based layouts (Oracle Taleo, SelectMinds, BrassRing, legacy ATS)
    // <tr><td class="labelcell">First Name:</td><td class="valuecell"><input></td></tr>
    const td = element.closest('td');
    if (td) {
      const prevTd = td.previousElementSibling;
      if (prevTd && prevTd.tagName === 'TD' && prevTd.textContent.trim().length > 0) {
        return prevTd;
      }
      const tr = td.closest('tr');
      if (tr) {
        const labelTd = tr.querySelector('td.label, td.labelcell, td[class*="label"], th');
        if (labelTd && labelTd !== td) return labelTd;
      }
    }

    // 9. Preceding sibling in parent element
    const parent = element.parentElement;
    if (parent) {
      const label = parent.querySelector('label, .label, .field-label, .form-label, .title, .field-title');
      if (label && label !== element && !label.contains(element)) return label;
    }

    // 10. Preceding sibling of parent element (e.g. <div class="col-label">First Name</div><div class="col-input"><input></div>)
    if (parent && parent.previousElementSibling) {
      const parentPrev = parent.previousElementSibling;
      if (parentPrev.tagName === 'LABEL' || parentPrev.classList.contains('label') || parentPrev.classList.contains('field-label') || parentPrev.querySelector('label')) {
        return parentPrev.querySelector('label') || parentPrev;
      }
    }

    return null;
  },

  /**
   * Get cleaned text of the label
   */
  getLabelText(element) {
    const label = this.getLabel(element);
    if (!label) return '';

    if (label.tagName === 'SPAN') {
      return label.textContent.trim();
    }

    const clone = label.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
    return clone.textContent.trim();
  },

  /**
   * Extract comprehensive surrounding context for ambiguous or non-accessible elements
   */
  getSurroundingContext(element) {
    const parts = [];

    // Label text
    const labelText = this.getLabelText(element);
    if (labelText) parts.push(`Label: ${labelText}`);

    // Placeholder
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) parts.push(`Placeholder: ${placeholder}`);

    // Preceding heading/legend
    const container = element.closest('[data-automation-id="formField"], .form-group, fieldset, spl-internal-form-field, .application-question, section');
    if (container) {
      const heading = container.querySelector('h1, h2, h3, h4, h5, h6, legend, [data-automation-id="formLabel"], [slot="label-content"]');
      if (heading && heading.textContent.trim()) {
        const hText = heading.textContent.trim();
        if (hText !== labelText) {
          parts.push(`Section: ${hText}`);
        }
      }

      // Container description / helper text
      const helpText = container.querySelector('.help-block, .form-text, .description, [data-automation-id="formFieldHelperText"]');
      if (helpText && helpText.textContent.trim()) {
        parts.push(`Help: ${helpText.textContent.trim()}`);
      }
    }

    return parts.join(' | ');
  },

  /**
   * Get the question/legend for a radio group
   */
  getRadioGroupLabel(element) {
    const isCustomRadio = element.getAttribute('role') === 'radio';
    const isStandardRadio = element.type === 'radio';

    if (!isCustomRadio && !isStandardRadio) return null;

    if (isCustomRadio) {
      const ariaLabelledBy = element.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        const labelElement = document.getElementById(ariaLabelledBy);
        if (labelElement) return labelElement.textContent.trim();
      }

      const radioGroup = element.closest('[role="radiogroup"], spl-radio-group');
      if (radioGroup) {
        const labelContent = radioGroup.querySelector('[slot="label-content"]');
        if (labelContent) return labelContent.textContent.trim();

        const groupLabelledBy = radioGroup.getAttribute('aria-labelledby');
        if (groupLabelledBy) {
          const groupLabel = document.getElementById(groupLabelledBy);
          if (groupLabel) return groupLabel.textContent.trim();
        }
      }
    }

    const fieldset = element.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) return legend.textContent.trim();
    }

    const container = element.closest('[role="group"], [role="radiogroup"], .form-group, .field-container, .form-field, [data-automation-id="formField"]');
    if (container) {
      const groupLabel = container.querySelector('label:not([for]), h1, h2, h3, h4, h5, h6, [data-automation-id="formLabel"], [slot="label-content"]');
      if (groupLabel && !groupLabel.contains(element)) {
        return groupLabel.textContent.trim();
      }
    }

    return null;
  },

  /**
   * Tier 1 Heuristic Classifier
   */
  classify(element) {
    if (!element) return null;

    let labelText = this.normalize(this.getLabelText(element));

    if (!labelText && element.tagName) {
      const componentLabel = element.getAttribute('label');
      if (componentLabel) {
        labelText = this.normalize(componentLabel);
      }
    }

    const name = this.normalize(element.getAttribute('name') || '');
    const id = this.normalize(element.id || '');
    const placeholder = this.normalize(element.getAttribute('placeholder') || '');
    const autoId = this.normalize(element.getAttribute('data-automation-id') || '');
    const dataTest = this.normalize(element.getAttribute('data-test') || '');

    const isRadio = element.type === 'radio' || element.getAttribute('role') === 'radio';
    if (isRadio) {
      const groupLabel = this.getRadioGroupLabel(element);
      if (groupLabel) {
        labelText = this.normalize(groupLabel);
      }
    }

    const isLongForm = element.tagName?.toLowerCase() === 'textarea' || element.tagName?.toLowerCase() === 'spl-textarea';
    const singleLineKeys = new Set([
      'fullName', 'firstName', 'lastName', 'email', 'phone', 'countryCode',
      'address', 'city', 'state', 'zipCode', 'country', 'linkedin', 'github',
      'portfolio', 'currentCompany', 'currentTitle', 'todaysDate'
    ]);

    const searchText = `${labelText} ${name} ${id} ${placeholder} ${autoId} ${dataTest}`;

    // Canonical matching
    for (const [fieldKey, patterns] of Object.entries(this.FIELDS)) {
      if (isLongForm && singleLineKeys.has(fieldKey)) {
        continue; // Prevent textareas from erroneously matching single-line attributes (e.g. company vs whyUs)
      }
      for (const pattern of patterns) {
        if (searchText.includes(pattern)) {
          return {
            key: fieldKey,
            label: labelText || pattern,
            isMandatory: this.isMandatory(element),
            isRadioGroup: isRadio,
            isLongForm: isLongForm
          };
        }
      }
    }

    // If marked mandatory but unclassified
    if (this.isMandatory(element) && labelText) {
      return {
        key: labelText,
        label: labelText,
        isMandatory: true,
        isCustom: true,
        isRadioGroup: isRadio,
        isLongForm: element.tagName?.toLowerCase() === 'textarea' || element.tagName?.toLowerCase() === 'spl-textarea'
      };
    }

    if (labelText) {
      return {
        key: labelText,
        label: labelText,
        isMandatory: false,
        isCustom: true,
        isRadioGroup: isRadio,
        isLongForm: element.tagName?.toLowerCase() === 'textarea' || element.tagName?.toLowerCase() === 'spl-textarea'
      };
    }

    return null;
  },

  /**
   * Recursively locate all elements across open Shadow DOM boundaries
   */
  getAllElements(root = document, selector) {
    const elements = [];
    try {
      elements.push(...root.querySelectorAll(selector));
    } catch (e) {}

    let allElements = [];
    try {
      allElements = root.querySelectorAll('*');
    } catch (e) {}

    for (const el of allElements) {
      if (el.shadowRoot) {
        elements.push(...this.getAllElements(el.shadowRoot, selector));
      } else if (el.tagName === 'IFRAME') {
        try {
          if (el.contentDocument && el.contentDocument.body) {
            elements.push(...this.getAllElements(el.contentDocument, selector));
          }
        } catch (frameErr) {
          // Cross-origin iframes are managed via content_scripts with all_frames: true
        }
      }
    }
    return elements;
  },

  /**
   * Discover all fillable input elements on the page (regular & shadow DOM)
   */
  getFields(root) {
    const rootDoc = root || (typeof document !== 'undefined' ? document : null);
    if (!rootDoc) return [];

    const selector = 'input:not([type="hidden"]):not([type="password"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]), textarea, select, [contenteditable="true"]';

    const elements = this.getAllElements(rootDoc, selector);

    // Custom ARIA form components
    const customInputs = this.getAllElements(rootDoc, '[role="textbox"]');
    const customRadios = this.getAllElements(rootDoc, '[role="radio"]');
    const customCheckboxes = this.getAllElements(rootDoc, '[role="checkbox"]');
    const customComboboxes = this.getAllElements(rootDoc, '[role="combobox"]');
    const customListboxes = this.getAllElements(rootDoc, '[role="listbox"]');
    const customSearchboxes = this.getAllElements(rootDoc, '[role="searchbox"]');

    // ATS Web Component libraries (spl-*, oj-*, wd-*, etc.)
    const splAutocomplete = this.getAllElements(rootDoc, 'spl-autocomplete, oj-select-one, oj-combobox-one');
    const splTextarea = this.getAllElements(rootDoc, 'spl-textarea, oj-text-area');
    const splDateField = this.getAllElements(rootDoc, 'spl-date-field, oj-input-date');
    const splCheckbox = this.getAllElements(rootDoc, 'spl-checkbox, oj-checkboxset');
    const splInput = this.getAllElements(rootDoc, 'spl-input, oj-input-text');
    const splRadioGroup = this.getAllElements(rootDoc, 'spl-radio-group, oj-radiogroup');

    const allElements = [
      ...elements,
      ...customInputs,
      ...customRadios,
      ...customCheckboxes,
      ...customComboboxes,
      ...customListboxes,
      ...customSearchboxes,
      ...splAutocomplete,
      ...splTextarea,
      ...splDateField,
      ...splCheckbox,
      ...splInput,
      ...splRadioGroup
    ];

    const uniqueElements = Array.from(new Set(allElements));

    const filtered = uniqueElements.filter(el => {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('disabled') !== null) {
        return false;
      }

      // Check readonly: Allow readonly comboboxes, datepickers, selects, or custom controls
      // (Workday, Oracle Taleo, and React-Select use <input type="text" readonly role="combobox">)
      if (el.readOnly) {
        const isInteractiveCombobox =
          el.getAttribute('role') === 'combobox' ||
          el.getAttribute('role') === 'textbox' ||
          el.hasAttribute('aria-haspopup') ||
          el.getAttribute('data-automation-id')?.includes('select') ||
          el.getAttribute('data-automation-id')?.includes('country') ||
          el.getAttribute('data-automation-id')?.includes('date') ||
          el.classList?.contains('select') ||
          el.classList?.contains('dropdown') ||
          el.closest('[role="combobox"], [data-automation-id="formField"]');
        if (!isInteractiveCombobox) {
          return false;
        }
      }

      // Visibility check
      try {
        const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style) {
          if (style.display === 'none' || style.visibility === 'hidden') {
            // Check if this is a custom-styled radio/checkbox/select whose parent/label is visible
            const isCheckOrRadio = el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT';
            if (isCheckOrRadio) {
              const parentOrLabel = el.closest('label, .form-group, .field-container, [role="radio"], [role="checkbox"], [data-automation-id="formField"]');
              if (parentOrLabel && window.getComputedStyle(parentOrLabel).display !== 'none') {
                return true; // Keep visually hidden radio/checkbox that has visible label
              }
            }
            return false;
          }
        }
      } catch (e) {}

      return true;
    });

    return filtered;
  },


  /**
   * Deep search inside a shadow DOM tree
   */
  findInShadowDOM(root, selector, maxDepth = 5) {
    if (!root || maxDepth <= 0) return null;
    const direct = root.querySelector(selector);
    if (direct) return direct;

    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const found = this.findInShadowDOM(el.shadowRoot, selector, maxDepth - 1);
        if (found) return found;
      }
    }
    return null;
  },

  /**
   * Build a distilled Semantic Form Tree (SFT) suitable for On-Device Gemini Nano
   * Assigns ephemeral data attributes to DOM elements to map AI responses back to the nodes.
   */
  buildSemanticFormTree(fields) {
    let fieldCounter = 0;
    const sftFields = [];

    for (const element of fields) {
      fieldCounter++;
      const fieldId = `ca_field_${fieldCounter}`;
      element.setAttribute('data-ca-field-id', fieldId);

      const tagName = element.tagName?.toLowerCase() || '';
      const type = (element.type || '').toLowerCase();
      const role = element.getAttribute('role') || '';
      const isLongForm = tagName === 'textarea' || tagName === 'spl-textarea';

      // Extract options if select or radio
      let options = [];
      if (tagName === 'select') {
        options = Array.from(element.options).map(o => o.text.trim()).filter(t => t.length > 0);
      } else if (type === 'radio' && element.name) {
        const root = this.getRoot(element);
        const group = root.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
        options = Array.from(group).map(r => this.getLabelText(r) || r.value).filter(Boolean);
      } else if (role === 'radio') {
        const name = element.getAttribute('name');
        if (name) {
          const root = this.getRoot(element);
          const group = root.querySelectorAll(`[role="radio"][name="${CSS.escape(name)}"]`);
          options = Array.from(group).map(r => r.getAttribute('label') || this.getLabelText(r) || r.getAttribute('value')).filter(Boolean);
        }
      }

      sftFields.push({
        id: fieldId,
        type: isLongForm ? 'textarea' : (tagName === 'select' ? 'select' : type || tagName),
        label: this.getLabelText(element),
        context: this.getSurroundingContext(element),
        placeholder: element.getAttribute('placeholder') || '',
        options: options.slice(0, 15), // Limit options to preserve token budget
        isMandatory: this.isMandatory(element),
        isLongForm: isLongForm
      });
    }

    return sftFields;
  },

  /**
   * Set field value reliably across React, Vue, Web Components, and ContentEditable
   */
  setValue(element, value) {
    if (!element || value === null || value === undefined) return false;

    const tagName = element.tagName?.toLowerCase();
    const role = element.getAttribute('role');
    const type = (element.type || '').toLowerCase();

    try {
      // 1. ContentEditable elements
      if (element.getAttribute('contenteditable') === 'true') {
        element.focus();
        element.textContent = String(value);
        element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
        return true;
      }

      // 2. ATS Web Components (spl-*)
      if (tagName) {
        switch (tagName) {
          case 'spl-autocomplete':
          case 'spl-input':
            element.setAttribute('value', value);
            let innerInput = null;
            if (element.shadowRoot) {
              innerInput = this.findInShadowDOM(element.shadowRoot, 'input');
            }
            if (innerInput) {
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              )?.set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(innerInput, value);
              } else {
                innerInput.value = value;
              }
              innerInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              innerInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              innerInput.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
            }
            element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            return true;

          case 'spl-textarea':
            element.setAttribute('value', value);
            let innerTextarea = null;
            if (element.shadowRoot) {
              innerTextarea = this.findInShadowDOM(element.shadowRoot, 'textarea');
            }
            if (innerTextarea) {
              const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
              )?.set;
              if (nativeTextareaValueSetter) {
                nativeTextareaValueSetter.call(innerTextarea, value);
              } else {
                innerTextarea.value = value;
              }
              innerTextarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              innerTextarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              innerTextarea.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
            }
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            return true;

          case 'spl-date-field':
            let dateValue = value;
            if (typeof value === 'string') {
              const monthYearMatch = value.match(/^(\d{1,2})\/(\d{2,4})$/);
              if (monthYearMatch) {
                const month = monthYearMatch[1].padStart(2, '0');
                let year = monthYearMatch[2];
                if (year.length === 2) {
                  const yearNum = parseInt(year);
                  year = yearNum <= 26 ? `20${year}` : `19${year}`;
                }
                dateValue = `${month}/01/${year}`;
              }
            }
            element.setAttribute('value', dateValue);
            const datePicker = element.shadowRoot?.querySelector('spl-date-picker');
            if (datePicker) {
              const dateInput = datePicker.shadowRoot?.querySelector('input');
              if (dateInput) {
                dateInput.value = dateValue;
                dateInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                dateInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              }
            }
            return true;

          case 'spl-checkbox':
            const shouldCheckSpl = value === true || value === 'true' || String(value).toLowerCase() === 'yes';
            const checkboxInput = element.shadowRoot?.querySelector('input[type="checkbox"]');
            if (checkboxInput) {
              checkboxInput.checked = shouldCheckSpl;
              checkboxInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }
            return true;
        }
      }

      // 3. Custom ARIA roles
      if (role) {
        switch (role) {
          case 'radio':
            const name = element.getAttribute('name');
            if (name) {
              const root = this.getRoot(element);
              const radios = root.querySelectorAll(`[role="radio"][name="${CSS.escape(name)}"]`);
              const normalizedValue = this.normalize(String(value));
              for (const radio of radios) {
                const label = radio.getAttribute('label') || this.getLabelText(radio);
                const radioValue = radio.getAttribute('value');
                if (this.normalize(label) === normalizedValue ||
                    this.normalize(radioValue) === normalizedValue ||
                    this.normalize(label).includes(normalizedValue)) {
                  radio.setAttribute('aria-checked', 'true');
                  radio.setAttribute('checked', '');
                  radio.click();
                  return true;
                }
              }
            }
            return false;

          case 'checkbox':
            const shouldCheck = value === true || value === 'true' || String(value).toLowerCase() === 'yes';
            element.setAttribute('aria-checked', shouldCheck ? 'true' : 'false');
            if (shouldCheck) element.setAttribute('checked', '');
            else element.removeAttribute('checked');
            element.click();
            return true;

          case 'textbox':
          case 'combobox':
          case 'spinbutton':
            if (tagName === 'input' || tagName === 'textarea') {
              const nativeSetter = Object.getOwnPropertyDescriptor(
                tagName === 'input' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
                'value'
              )?.set;
              if (nativeSetter) {
                nativeSetter.call(element, value);
              } else {
                element.value = value;
              }
              const tracker = element._valueTracker;
              if (tracker && typeof tracker.setValue === 'function') {
                tracker.setValue(value === '' ? '__sentinel__' : '');
              }
            } else {
              element.setAttribute('value', value);
              element.textContent = value;
            }
            element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
            return true;
        }
      }

      // 4. Standard Select elements
      if (tagName === 'select') {
        const normalizedValue = this.normalize(String(value));
        if (!normalizedValue) return false;

        const isShortValue = normalizedValue.length <= 3;
        const wordRegex = new RegExp('\\b' + normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');

        // Pass 1: Exact matches
        for (let i = 0; i < element.options.length; i++) {
          const option = element.options[i];
          const optionText = this.normalize(option.text);
          const optionVal = this.normalize(option.value);

          if (optionVal === normalizedValue || optionText === normalizedValue) {
            element.selectedIndex = i;
            element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            return true;
          }
        }

        // Pass 2: Word-boundary matches (e.g. "Yes" in "Yes, I am authorized", or "no_sponsorship")
        for (let i = 0; i < element.options.length; i++) {
          const option = element.options[i];
          const optionText = this.normalize(option.text);
          const optionVal = this.normalize(option.value);
          const cleanText = optionText.replace(/[_\-]/g, ' ');
          const cleanVal = optionVal.replace(/[_\-]/g, ' ');

          if (['select', 'choose', 'please select', 'select an option'].includes(optionText)) continue;

          if (wordRegex.test(cleanText) || wordRegex.test(cleanVal)) {
            element.selectedIndex = i;
            element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            return true;
          }
        }

        // Pass 3: Substring matches ONLY for longer values (length >= 4)
        if (!isShortValue) {
          for (let i = 0; i < element.options.length; i++) {
            const option = element.options[i];
            const optionText = this.normalize(option.text);
            const optionVal = this.normalize(option.value);
            const cleanText = optionText.replace(/[_\-]/g, ' ');
            const cleanVal = optionVal.replace(/[_\-]/g, ' ');

            if (['select', 'choose', 'please select'].includes(optionText)) continue;

            if (cleanText.includes(normalizedValue) || normalizedValue.includes(cleanText) ||
                cleanVal.includes(normalizedValue) || normalizedValue.includes(cleanVal)) {
              element.selectedIndex = i;
              element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              return true;
            }
          }
        }

        return false;
      }

      // 5. Standard Checkboxes
      if (type === 'checkbox') {
        const shouldCheck = value === true || value === 'true' || String(value).toLowerCase() === 'yes';
        element.checked = shouldCheck;
        element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return true;
      }

      // 6. Standard Radios
      if (type === 'radio') {
        if (element.name) {
          const root = this.getRoot(element);
          const radios = root.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
          const normalizedValue = this.normalize(String(value));

          for (const radio of radios) {
            const labelText = this.normalize(this.getLabelText(radio));
            const radioVal = this.normalize(radio.value);

            if (labelText === normalizedValue ||
                labelText.includes(normalizedValue) ||
                normalizedValue.includes(labelText) ||
                radioVal === normalizedValue) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              radio.dispatchEvent(new Event('click', { bubbles: true, composed: true }));
              return true;
            }
          }
        }
        return false;
      }

      // 7. Standard Inputs & Textareas (with React/Vue prototype setter bypass & _valueTracker reset)
      if (tagName === 'input' || tagName === 'textarea') {
        let cleanValue = value;

        // If phone input with strict maxlength of 10 digits
        if (type === 'tel' && element.getAttribute('maxlength') === '10') {
          cleanValue = String(value).replace(/\D/g, '').slice(-10);
        }

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        )?.set;

        if (tagName === 'input' && nativeInputValueSetter) {
          nativeInputValueSetter.call(element, cleanValue);
        } else if (tagName === 'textarea' && nativeTextareaValueSetter) {
          nativeTextareaValueSetter.call(element, cleanValue);
        } else {
          element.value = cleanValue;
        }

        // Reset React _valueTracker if present (React 16-19 compatibility)
        const tracker = element._valueTracker;
        if (tracker && typeof tracker.setValue === 'function') {
          tracker.setValue('');
        }

        element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
        return true;
      }

      // Fallback
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      return true;

    } catch (error) {
      console.error('[Field Detector] Error setting field value:', error);
      return false;
    }
  },

  /**
   * Get field value
   */
  getValue(element) {
    if (!element) return null;

    const tagName = element.tagName?.toLowerCase();
    const role = element.getAttribute('role');
    const type = (element.type || '').toLowerCase();

    if (element.getAttribute('contenteditable') === 'true') {
      return element.textContent.trim();
    }

    if (tagName) {
      switch (tagName) {
        case 'spl-autocomplete':
        case 'spl-input':
        case 'spl-textarea':
        case 'spl-date-field':
          return element.getAttribute('value') || '';
        case 'spl-checkbox':
          const checkbox = element.shadowRoot?.querySelector('input[type="checkbox"]');
          return checkbox ? checkbox.checked : false;
        case 'spl-radio-group':
          const checkedRadio = element.querySelector('spl-radio[checked], spl-radio[aria-checked="true"]');
          if (checkedRadio) {
            return checkedRadio.getAttribute('label') || checkedRadio.getAttribute('value');
          }
          return null;
      }
    }

    if (role) {
      switch (role) {
        case 'radio':
          const name = element.getAttribute('name');
          if (name) {
            const root = this.getRoot(element);
            const allRadios = root.querySelectorAll(`[role="radio"][name="${CSS.escape(name)}"]`);
            for (const radio of allRadios) {
              if (radio.getAttribute('aria-checked') === 'true' || radio.hasAttribute('checked')) {
                return radio.getAttribute('label') || this.getLabelText(radio) || radio.getAttribute('value');
              }
            }
          }
          return null;
        case 'checkbox':
          return element.getAttribute('aria-checked') === 'true' || element.hasAttribute('checked');
        case 'textbox':
        case 'combobox':
        case 'spinbutton': {
          let candidate = '';
          const directVal = element.getAttribute('value') || element.getAttribute('aria-valuenow');
          if (directVal !== null && directVal !== undefined && directVal !== '') {
            candidate = String(directVal).trim();
          } else if (element.value !== undefined && element.value !== '') {
            candidate = String(element.value).trim();
          } else {
            candidate = element.textContent?.trim() || '';
          }

          const placeholder = (element.getAttribute('placeholder') || '').trim();
          if (placeholder && candidate.toLowerCase() === placeholder.toLowerCase()) return '';

          const placeholderRegex = /^(select|choose|please select|select one|select an option|choose an option|choose a value|search|\-\-|\s*)$/i;
          if (placeholderRegex.test(candidate) || /^((select|choose|please select)\s+.*)$/i.test(candidate)) {
            return '';
          }
          return candidate;
        }
      }
    }

    if (element.tagName === 'SELECT') {
      const val = (element.value || '').trim();
      const text = element.options && element.selectedIndex >= 0 ? (element.options[element.selectedIndex]?.text || '').trim() : '';
      const placeholderRegex = /^(select|choose|please select|select one|select an option|choose an option|choose a value|\-\-|none|\-1|0|\s*)$/i;
      if (placeholderRegex.test(val) || placeholderRegex.test(text) || /^((select|choose|please select)\s+.*)$/i.test(val) || /^((select|choose|please select)\s+.*)$/i.test(text)) {
        return '';
      }
      return val;
    }

    if (type === 'checkbox') return element.checked;
    if (type === 'radio') {
      if (element.name) {
        const root = this.getRoot(element);
        const checkedRadio = root.querySelector(`input[type="radio"][name="${CSS.escape(element.name)}"]:checked`);
        if (checkedRadio) {
          return this.getLabelText(checkedRadio) || checkedRadio.value;
        }
      }
      return null;
    }

    if (element.value !== undefined) {
      const val = String(element.value).trim();
      const placeholder = (element.getAttribute('placeholder') || '').trim();
      if (placeholder && val.toLowerCase() === placeholder.toLowerCase()) return '';

      // If input acts as a combobox or select dropdown (Workday, Oracle, AntD, React-Select)
      const isComboboxLike =
        element.getAttribute('role') === 'combobox' ||
        element.hasAttribute('aria-haspopup') ||
        element.classList?.contains('select') ||
        element.classList?.contains('dropdown') ||
        element.getAttribute('data-automation-id')?.includes('select');

      if (isComboboxLike) {
        const placeholderRegex = /^(select|choose|please select|select one|select an option|choose an option|choose a value|search|\-\-|\s*)$/i;
        if (placeholderRegex.test(val) || /^((select|choose|please select)\s+.*)$/i.test(val)) {
          return '';
        }
      }
      return val;
    }

    return '';
  },

  /**
   * Helper to pick best option from select/radio choices
   */
  pickBestOption(optionsList, targetValue) {
    if (!Array.isArray(optionsList) || optionsList.length === 0 || !targetValue) return null;
    const targetNorm = this.normalize(String(targetValue));
    const targetIsYes = ['yes', 'authorized', 'true'].includes(targetNorm);
    const targetIsNo = ['no', 'not authorized', 'false'].includes(targetNorm);

    // Pass 1: Exact match
    for (const opt of optionsList) {
      if (this.normalize(opt) === targetNorm) return opt;
    }

    // Pass 2: Semantic affirmative / negative match
    for (const opt of optionsList) {
      const optNorm = this.normalize(opt);
      if (['select', 'choose', 'please select'].includes(optNorm)) continue;

      if (targetIsYes) {
        if (/\byes\b/i.test(optNorm) || optNorm.startsWith('yes') || optNorm.includes('authorized without')) {
          return opt;
        }
      }
      if (targetIsNo) {
        if (/\bno\b/i.test(optNorm) || optNorm.startsWith('no') || optNorm.includes('not authorized') || optNorm.includes('will not require')) {
          return opt;
        }
      }
    }

    // Pass 3: Substring word boundary match
    const wordRegex = new RegExp('\\b' + targetNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    for (const opt of optionsList) {
      const optNorm = this.normalize(opt);
      if (wordRegex.test(optNorm)) return opt;
    }

    return null;
  },

  /**
   * Complete built-in Semantic Reasoning Arbiter.
   * Can run directly inside content script with 0ms latency
   * or inside background service worker.
   */
  arbitrateSemanticFields(fields, profile, options = {}) {
    const mappings = [];
    const minConfidence = options.minConfidence || 0.70;

    const SEMANTIC_INTENTS = {
      whyUs: {
        keys: ['whyUs'],
        patterns: ['why do you want to join', 'why do you want to work', 'why us', 'why this company', 'why are you interested', 'why join', 'what excites you', 'reason for applying', 'why are you applying', 'what attracted you', 'candidate motivation'],
        isLongForm: true
      },
      projectHighlight: {
        keys: ['projectHighlight'],
        patterns: ['challenging project', 'technical achievement', 'project highlight', 'most proud of', 'technical challenge', 'impactful project', 'technical experience', 'proud project', 'system design challenge', 'notable project', 'technical project', 'project or system challenge'],
        isLongForm: true
      },
      coverLetter: {
        keys: ['coverLetter'],
        patterns: ['cover letter', 'letter of interest', 'message to hiring manager', 'note to hiring manager', 'coverletter', 'optional cover letter', 'additional notes for the hiring team', 'letter to recruiter'],
        isLongForm: true
      },
      aboutMe: {
        keys: ['aboutMe'],
        patterns: ['about yourself', 'tell us about yourself', 'summary', 'bio', 'brief bio', 'professional summary', 'elevator pitch', 'candidate summary', 'overview of your background'],
        isLongForm: true
      },
      workExperience: {
        keys: ['workExperience'],
        patterns: ['work experience', 'relevant experience', 'employment history', 'experience summary', 'work history', 'professional experience', 'past experience', 'previous experience', 'summary of experience', 'job experience', 'describe your experience']
      },
      yearsOfExperience: {
        keys: ['yearsOfExperience'],
        patterns: ['years of experience', 'total experience', 'years of relevant experience', 'years experience', 'number of years of experience', 'how many years of experience'],
        singleLineOnly: true
      },
      skills: {
        keys: ['skills'],
        patterns: ['skills', 'technical skills', 'core competencies', 'technologies', 'programming languages', 'tools and technologies', 'key skills', 'relevant skills']
      },
      education: {
        keys: ['education'],
        patterns: ['education', 'highest education', 'degree', 'university', 'college', 'highest degree', 'educational background', 'school', 'level of education', 'degree obtained']
      },
      certifications: {
        keys: ['certifications'],
        patterns: ['certifications', 'licenses', 'certificates', 'accreditations', 'professional certifications']
      },
      salaryExpectations: {
        keys: ['salaryExpectations'],
        patterns: ['salary expectations', 'desired salary', 'expected salary', 'compensation expectation', 'target compensation', 'target salary', 'desired compensation', 'compensation requirements']
      },
      noticePeriod: {
        keys: ['noticePeriod'],
        patterns: ['notice period', 'earliest start date', 'start date', 'how soon can you start', 'availability to start', 'available start date', 'start availability']
      },
      workAuth: {
        keys: ['workAuth'],
        patterns: ['authorized to work', 'work authorization', 'legal authorization', 'legally authorized', 'authorized to work in', 'eligible to work', 'legal right to work']
      },
      sponsorship: {
        keys: ['sponsorship'],
        patterns: ['visa sponsorship', 'require sponsorship', 'need sponsorship', 'sponsorship now or in the future', 'future sponsorship', 'require visa']
      },
      fullName: {
        keys: ['fullName'],
        patterns: ['full name', 'fullname', 'legal name', 'complete name', 'your name', 'candidate name'],
        singleLineOnly: true
      },
      firstName: {
        keys: ['firstName'],
        patterns: ['first name', 'given name', 'firstname', 'fname'],
        singleLineOnly: true
      },
      lastName: {
        keys: ['lastName'],
        patterns: ['last name', 'surname', 'lastname', 'lname', 'family name'],
        singleLineOnly: true
      },
      email: {
        keys: ['email'],
        patterns: ['email', 'e-mail', 'email address'],
        singleLineOnly: true
      },
      phone: {
        keys: ['phone'],
        patterns: ['phone number', 'phone', 'telephone', 'mobile number', 'mobile', 'cell phone', 'cell'],
        singleLineOnly: true
      },
      address: {
        keys: ['address'],
        patterns: ['street address', 'address line 1', 'street', 'mailing address'],
        singleLineOnly: true
      },
      city: {
        keys: ['city'],
        patterns: ['city', 'town'],
        singleLineOnly: true
      },
      state: {
        keys: ['state'],
        patterns: ['state', 'province', 'state/province', 'region'],
        singleLineOnly: true
      },
      zipCode: {
        keys: ['zipCode'],
        patterns: ['zip code', 'postal code', 'zip', 'postcode', 'postal'],
        singleLineOnly: true
      },
      country: {
        keys: ['country'],
        patterns: ['country of residence', 'country', 'country/region'],
        singleLineOnly: true
      },
      linkedin: {
        keys: ['linkedin'],
        patterns: ['linkedin', 'linkedin profile', 'linkedin url'],
        singleLineOnly: true
      },
      github: {
        keys: ['github'],
        patterns: ['github', 'github profile', 'github url'],
        singleLineOnly: true
      },
      portfolio: {
        keys: ['portfolio'],
        patterns: ['portfolio', 'personal website', 'website', 'personal site', 'portfolio url'],
        singleLineOnly: true
      },
      currentCompany: {
        keys: ['currentCompany'],
        patterns: ['current company', 'most recent company', 'current employer', 'employer'],
        singleLineOnly: true
      },
      currentTitle: {
        keys: ['currentTitle'],
        patterns: ['current title', 'job title', 'title', 'position', 'current position', 'most recent title'],
        singleLineOnly: true
      }
    };

    for (const field of fields) {
      const fieldId = field.id;
      const label = this.normalize(field.label || '');
      const context = this.normalize(field.context || '');
      const placeholder = this.normalize(field.placeholder || '');
      const combinedText = `${label} ${context} ${placeholder}`.trim();
      const isTextarea = field.type === 'textarea' || field.isLongForm;

      // Skip blacklisted phone country codes
      const isPhoneCountryCode =
        (combinedText.includes('country') && (combinedText.includes('code') || combinedText.includes('dial'))) ||
        combinedText.includes('countrycode') ||
        combinedText.includes('dial code') ||
        combinedText.includes('phone code') ||
        combinedText.includes('calling code');

      if (isPhoneCountryCode) continue;

      let bestMatch = null;
      let maxScore = 0;

      // 1. Check Long-Form / Essay fields if textarea
      if (isTextarea) {
        for (const [intentKey, def] of Object.entries(SEMANTIC_INTENTS)) {
          if (!def.isLongForm && def.singleLineOnly) continue;
          for (const pattern of def.patterns) {
            if (combinedText.includes(pattern)) {
              const score = pattern.length > 10 ? 0.95 : 0.85;
              if (score > maxScore) {
                maxScore = score;
                bestMatch = {
                  profileKey: def.keys[0],
                  confidence: score,
                  reasoning: `Matched essay pattern '${pattern}'`
                };
              }
            }
          }
        }

        // Contextual multi-keyword semantic intent fallback for textareas
        if (!bestMatch) {
          if (
            (combinedText.includes('why') && (combinedText.includes('company') || combinedText.includes('work') || combinedText.includes('join') || combinedText.includes('role') || combinedText.includes('team') || combinedText.includes('excited') || combinedText.includes('interested') || combinedText.includes('us'))) ||
            combinedText.includes('reason for applying')
          ) {
            bestMatch = {
              profileKey: 'whyUs',
              confidence: 0.90,
              reasoning: 'Matched candidate motivation intent for whyUs'
            };
            maxScore = 0.90;
          } else if (
            (combinedText.includes('project') || combinedText.includes('technical') || combinedText.includes('system') || combinedText.includes('proud') || combinedText.includes('challenge')) &&
            (combinedText.includes('designed') || combinedText.includes('built') || combinedText.includes('achievement') || combinedText.includes('spearheaded') || combinedText.includes('project') || combinedText.includes('challenge'))
          ) {
            bestMatch = {
              profileKey: 'projectHighlight',
              confidence: 0.90,
              reasoning: 'Matched technical project/achievement intent'
            };
            maxScore = 0.90;
          } else if (
            combinedText.includes('cover letter') || combinedText.includes('coverletter') ||
            (combinedText.includes('note') && combinedText.includes('hiring')) ||
            (combinedText.includes('message') && combinedText.includes('hiring')) ||
            combinedText.includes('additional comments') || combinedText.includes('letter of interest')
          ) {
            bestMatch = {
              profileKey: 'coverLetter',
              confidence: 0.90,
              reasoning: 'Matched cover letter / hiring note intent'
            };
            maxScore = 0.90;
          } else if (
            combinedText.includes('about yourself') || combinedText.includes('tell us about') ||
            combinedText.includes('elevator pitch') || combinedText.includes('bio') ||
            combinedText.includes('summary of your')
          ) {
            bestMatch = {
              profileKey: 'aboutMe',
              confidence: 0.90,
              reasoning: 'Matched candidate bio/summary intent'
            };
            maxScore = 0.90;
          }
        }
      }

      // 2. Check Work Authorization / Sponsorship (Location-Aware)
      if (!bestMatch) {
        const isAuthQuestion = SEMANTIC_INTENTS.workAuth.patterns.some(p => combinedText.includes(p));
        const isSponsorshipQuestion = SEMANTIC_INTENTS.sponsorship.patterns.some(p => combinedText.includes(p));

        if (isAuthQuestion || isSponsorshipQuestion) {
          const targetCountry = this.detectCountryInText(combinedText);
          const userCountries = `${profile.workAuthCountries || ''} ${profile.country || ''}`.toLowerCase();

          let isAuth = true;
          if (targetCountry) {
            const userHasCountry = userCountries.includes(targetCountry) ||
              (this.COUNTRY_ALIASES[targetCountry] && this.COUNTRY_ALIASES[targetCountry].some(a => userCountries.includes(a.trim())));
            isAuth = userHasCountry;
          }

          if (isAuthQuestion) {
            const expectedVal = targetCountry ? (isAuth ? (profile.workAuth || 'Yes') : 'No') : (profile.workAuth || 'Yes');
            const selectedOption = this.pickBestOption(field.options, expectedVal);
            bestMatch = {
              profileKey: 'workAuth',
              selectedOption: selectedOption || expectedVal,
              confidence: 0.92,
              reasoning: `Location-aware work auth: ${targetCountry ? 'Country ' + targetCountry : 'Generic'}`
            };
            maxScore = 0.92;
          } else if (isSponsorshipQuestion) {
            let expectedVal = profile.sponsorship || 'No';
            if (targetCountry) {
              expectedVal = isAuth ? (profile.sponsorship || 'No') : (profile.sponsorshipOtherCountries || 'Yes');
            }
            const selectedOption = this.pickBestOption(field.options, expectedVal);
            bestMatch = {
              profileKey: 'sponsorship',
              selectedOption: selectedOption || expectedVal,
              confidence: 0.92,
              reasoning: `Location-aware sponsorship: ${targetCountry ? 'Country ' + targetCountry : 'Generic'}`
            };
            maxScore = 0.92;
          }
        }
      }

      // 3. Check Standard / Contact Fields
      if (!bestMatch) {
        for (const [intentKey, def] of Object.entries(SEMANTIC_INTENTS)) {
          if (isTextarea && def.singleLineOnly) continue;
          for (const pattern of def.patterns) {
            if (combinedText.includes(pattern)) {
              const score = pattern.length > 8 ? 0.92 : 0.85;
              if (score > maxScore) {
                maxScore = score;
                const profileKey = def.keys[0];
                const userVal = profile[profileKey];
                let selectedOption = null;
                if (field.options && field.options.length > 0 && userVal) {
                  selectedOption = this.pickBestOption(field.options, userVal);
                }
                bestMatch = {
                  profileKey: profileKey,
                  selectedOption: selectedOption,
                  confidence: score,
                  reasoning: `Matched pattern '${pattern}' for ${profileKey}`
                };
              }
            }
          }
        }
      }

      // 4. Check Custom Profile Keys
      if (!bestMatch) {
        if (Array.isArray(profile.customFields)) {
          for (const cf of profile.customFields) {
            if (!cf || !cf.value) continue;
            const normLabel = this.normalize(cf.label || '');
            const normKey = this.normalize(cf.key || '');
            if (
              (normLabel.length >= 3 && combinedText.includes(normLabel)) ||
              (normKey.length >= 3 && combinedText.includes(normKey))
            ) {
              bestMatch = {
                profileKey: cf.key || cf.label,
                confidence: 0.88,
                reasoning: `Matched custom field label/key '${cf.label || cf.key}'`
              };
              break;
            }
          }
        }

        if (!bestMatch) {
          for (const [profKey, profVal] of Object.entries(profile)) {
            if (profKey === 'customFields' || !profVal || typeof profVal !== 'string') continue;
            const normKey = this.normalize(profKey);
            const spacedKey = this.normalize(profKey.replace(/([A-Z])/g, ' $1'));
            if (normKey.length < 3) continue;
            if (combinedText.includes(normKey) || (spacedKey.length >= 3 && combinedText.includes(spacedKey))) {
              bestMatch = {
                profileKey: profKey,
                confidence: 0.82,
                reasoning: `Matched custom profile key '${profKey}'`
              };
              break;
            }
          }
        }
      }

      // Only commit mappings if confidence meets threshold and profile has value (or selectedOption is resolved)
      if (bestMatch && bestMatch.confidence >= minConfidence) {
        const isEssayKey = ['whyUs', 'projectHighlight', 'coverLetter', 'aboutMe'].includes(bestMatch.profileKey);
        const hasCustomValue = Array.isArray(profile.customFields) && profile.customFields.some(cf => (cf.key === bestMatch.profileKey || cf.label === bestMatch.profileKey) && String(cf.value || '').trim().length > 0);
        const hasValueInProfile =
          (profile[bestMatch.profileKey] !== undefined && String(profile[bestMatch.profileKey]).trim().length > 0) ||
          hasCustomValue ||
          (bestMatch.profileKey === 'fullName' && ((profile.firstName && profile.lastName) || profile.fullName)) ||
          (bestMatch.profileKey === 'firstName' && (profile.firstName || profile.fullName)) ||
          (bestMatch.profileKey === 'lastName' && (profile.lastName || profile.fullName)) ||
          (bestMatch.profileKey === 'workAuthCountries' && (profile.workAuthCountries || profile.country)) ||
          (bestMatch.profileKey === 'workAuth' && (profile.workAuth || bestMatch.selectedOption || 'Yes')) ||
          (bestMatch.profileKey === 'sponsorship' && (profile.sponsorship || bestMatch.selectedOption || 'No')) ||
          Boolean(bestMatch.selectedOption) ||
          Boolean(options.aiEnforced && isEssayKey);

        if (hasValueInProfile) {
          mappings.push({
            fieldId: fieldId,
            profileKey: bestMatch.profileKey,
            selectedOption: bestMatch.selectedOption || undefined,
            confidence: bestMatch.confidence,
            reasoning: bestMatch.reasoning
          });
        }
      }
    }

    return { mappings };
  }
};

if (typeof window !== 'undefined') {
  window.FieldDetector = FieldDetector;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FieldDetector };
}
console.log('[Career Autofill] field-detector.js loaded successfully');
