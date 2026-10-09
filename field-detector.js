/**
 * Field Detector - Identifies and classifies form fields
 */

console.log('🟢 [Career Autofill] field-detector.js LOADING...');

const FieldDetector = {
  // Canonical field mappings
  FIELDS: {
    firstName: ['first name', 'given name', 'firstname', 'fname'],
    lastName: ['last name', 'surname', 'lastname', 'lname', 'family name'],
    email: ['email', 'e-mail', 'email address'],
    phone: ['phone number', 'phone', 'telephone', 'mobile number', 'mobile', 'cell phone', 'cell'],
    countryCode: ['country code'],
    address: ['address', 'street'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region'],
    zipCode: ['zip', 'postal', 'postcode', 'zip code', 'postal code'],
    country: ['country'],
    linkedin: ['linkedin'],
    github: ['github'],
    portfolio: ['portfolio', 'website', 'personal site'],
    currentCompany: ['company', 'employer', 'current company'],
    currentTitle: ['title', 'job title', 'current title', 'position'],
    workAuth: ['authorized to work', 'work authorization', 'legal authorization'],
    sponsorship: ['sponsorship', 'visa sponsorship', 'require sponsorship'],
    todaysDate: ['today s date', 'todays date', 'current date', 'date today']
  },

  /**
   * Get today's date in various formats
   */
  getTodaysDate(format) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    // Return ISO format (YYYY-MM-DD) for date inputs
    if (format === 'iso') {
      return `${year}-${month}-${day}`;
    }

    // Return formatted string for text inputs
    return `${month}/${day}/${year}`;
  },

  /**
   * Normalize text for comparison
   */
  normalize(text) {
    if (!text) return '';
    return text.toLowerCase()
      .replace(/[*:?_\-()[\]/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Check if field is mandatory
   */
  isMandatory(element) {
    if (!element) return false;

    const reasons = []; // Track why field is/isn't mandatory

    // Check HTML5 required attribute
    if (element.required || element.hasAttribute('required')) {
      reasons.push('HTML5 required');
      console.log('[Field Detector] ✓ Mandatory (HTML5 required):', element);
      return true;
    }

    // Check ARIA required
    if (element.getAttribute('aria-required') === 'true') {
      reasons.push('ARIA required');
      console.log('[Field Detector] ✓ Mandatory (ARIA required):', element);
      return true;
    }

    // Check for required class on element
    if (element.classList.contains('required') || element.classList.contains('is-required')) {
      reasons.push('Element has required class');
      console.log('[Field Detector] ✓ Mandatory (element class):', element);
      return true;
    }

    // Check data attributes
    if (element.getAttribute('data-required') === 'true') {
      reasons.push('data-required=true');
      console.log('[Field Detector] ✓ Mandatory (data-required):', element);
      return true;
    }

    // Check placeholder for asterisk
    const placeholder = element.getAttribute('placeholder') || '';
    if (placeholder.includes('*')) {
      reasons.push('Asterisk in placeholder');
      console.log('[Field Detector] ✓ Mandatory (placeholder *):', element);
      return true;
    }

    // Check label for asterisk or "required"
    const label = this.getLabel(element);
    if (label) {
      const labelText = label.textContent || '';

      // Check for asterisk anywhere in label
      if (labelText.includes('*')) {
        reasons.push('Asterisk in label: ' + labelText.substring(0, 50));
        console.log('[Field Detector] ✓ Mandatory (label *):', labelText, element);
        return true;
      }

      // Check for "required" text
      const labelLower = labelText.toLowerCase();
      if (labelLower.includes('required') && !labelLower.includes('not required')) {
        reasons.push('Required text in label');
        console.log('[Field Detector] ✓ Mandatory (label "required"):', labelText, element);
        return true;
      }

      // Check for required indicator elements in label
      if (label.querySelector('[aria-required="true"], .required, .is-required, abbr[title*="required" i], .req-star, .mandatory')) {
        reasons.push('Required indicator in label');
        console.log('[Field Detector] ✓ Mandatory (label indicator):', element);
        return true;
      }
    }

    // Check parent container for required indicators
    const container = element.closest('[data-automation-id="formField"], .form-group, .c-form-item, .field-container, .form-field');
    if (container) {
      // Check if container has required class
      if (container.classList.contains('required') || container.classList.contains('is-required')) {
        reasons.push('Container has required class');
        console.log('[Field Detector] ✓ Mandatory (container class):', element);
        return true;
      }

      // Check for asterisk or required indicator in container
      const containerText = container.textContent || '';
      if (containerText.includes('*')) {
        // Make sure the asterisk is near the field (not in other fields in same container)
        const label = container.querySelector('label, [data-automation-id="formLabel"], .label');
        if (label && label.textContent.includes('*')) {
          reasons.push('Asterisk in container label');
          console.log('[Field Detector] ✓ Mandatory (container label *):', element);
          return true;
        }
      }

      // Check for required indicator elements in container
      if (container.querySelector('.required, .is-required, abbr[title*="required" i], .req-star, .mandatory')) {
        reasons.push('Required indicator in container');
        console.log('[Field Detector] ✓ Mandatory (container indicator):', element);
        return true;
      }
    }

    // Log why field was NOT detected as mandatory
    console.log('[Field Detector] ✗ Not mandatory:', {
      element,
      name: element.name,
      id: element.id,
      type: element.type,
      label: this.getLabelText(element),
      reasons: reasons.length > 0 ? reasons : ['No mandatory indicators found']
    });

    return false;
  },

  /**
   * Get root (document or shadowRoot) for an element
   */
  getRoot(element) {
    return element.getRootNode ? element.getRootNode() : document;
  },

  /**
   * Get label for element
   */
  getLabel(element) {
    if (!element) return null;

    const root = this.getRoot(element);

    // Try label[for] first (most specific) - search in same root
    if (element.id) {
      try {
        const label = root.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label) return label;
      } catch (e) {}
    }

    // Try parent label
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel;

    // Try aria-labelledby
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelElement = document.getElementById(ariaLabelledBy);
      if (labelElement) return labelElement;
    }

    // Try aria-label (create virtual label element)
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      const span = document.createElement('span');
      span.textContent = ariaLabel;
      return span;
    }

    // Try looking in parent host element (for shadow DOM)
    let host = root.host;
    if (host) {
      // Check if host or its parent has data-test attributes (common pattern)
      const testAttr = host.getAttribute('data-test') || host.parentElement?.getAttribute('data-test');
      if (testAttr) {
        console.log('[Field Detector] Found data-test:', testAttr);
        // Try to find label in the host's parent
        const label = host.parentElement?.querySelector('label');
        if (label) return label;
      }
    }

    // Try Workday/ATS containers
    const container = element.closest('[data-automation-id="formField"], .form-group, .c-form-item, .field-container, .form-field, fieldset, spl-internal-form-field');
    if (container) {
      // For shadow DOM, search within the container's shadow root too
      const label = container.querySelector('label, [data-automation-id="formLabel"], legend, .label, .field-label');
      if (label) return label;

      // If container is in shadow DOM, check its root
      const containerRoot = this.getRoot(container);
      if (containerRoot !== document) {
        const shadowLabel = containerRoot.querySelector('label');
        if (shadowLabel) return shadowLabel;
      }
    }

    // Try previous sibling label
    let prev = element.previousElementSibling;
    if (prev && prev.tagName === 'LABEL') {
      return prev;
    }

    // Look for nearby label (within parent)
    const parent = element.parentElement;
    if (parent) {
      const label = parent.querySelector('label');
      if (label) return label;
    }

    return null;
  },

  /**
   * Get label text
   */
  getLabelText(element) {
    const label = this.getLabel(element);
    if (!label) return '';

    if (label.tagName === 'SPAN') {
      return label.textContent;
    }

    // Clone and remove input elements to get clean text
    const clone = label.cloneNode(true);
    clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
    return clone.textContent.trim();
  },

  /**
   * Get the question/legend for a radio button group
   */
  getRadioGroupLabel(element) {
    const isCustomRadio = element.getAttribute('role') === 'radio';
    const isStandardRadio = element.type === 'radio';

    if (!isCustomRadio && !isStandardRadio) return null;

    // For custom radio components, check for slot="label-content" or aria-labelledby
    if (isCustomRadio) {
      // Try aria-labelledby first
      const ariaLabelledBy = element.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        const labelElement = document.getElementById(ariaLabelledBy);
        if (labelElement) {
          return labelElement.textContent.trim();
        }
      }

      // Look for [slot="label-content"] in parent radiogroup
      const radioGroup = element.closest('[role="radiogroup"], spl-radio-group');
      if (radioGroup) {
        const labelContent = radioGroup.querySelector('[slot="label-content"]');
        if (labelContent) {
          return labelContent.textContent.trim();
        }

        // Try aria-labelledby on the group
        const groupLabelledBy = radioGroup.getAttribute('aria-labelledby');
        if (groupLabelledBy) {
          const groupLabel = document.getElementById(groupLabelledBy);
          if (groupLabel) {
            return groupLabel.textContent.trim();
          }
        }
      }
    }

    // Try to find fieldset/legend
    const fieldset = element.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend) {
        return legend.textContent.trim();
      }
    }

    // Try to find a label or heading that applies to the whole group
    const container = element.closest('[role="group"], [role="radiogroup"], .form-group, .field-container, .form-field, [data-automation-id="formField"], [data-test="question-container"]');
    if (container) {
      // Look for a label or heading at the container level
      const groupLabel = container.querySelector('label:not([for]), h1, h2, h3, h4, h5, h6, [data-automation-id="formLabel"], [slot="label-content"]');
      if (groupLabel && !groupLabel.contains(element)) {
        return groupLabel.textContent.trim();
      }
    }

    return null;
  },

  /**
   * Classify field based on label and attributes
   */
  classify(element) {
    if (!element) return null;

    let labelText = this.normalize(this.getLabelText(element));

    // For web components, also try to get label from attribute
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

    // Check if this is a radio button (standard or custom)
    const isRadio = element.type === 'radio' || element.getAttribute('role') === 'radio';

    // For radio buttons, use the group label (question) instead of individual label
    if (isRadio) {
      const groupLabel = this.getRadioGroupLabel(element);
      if (groupLabel) {
        labelText = this.normalize(groupLabel);
        console.log('[Field Detector] Radio group label:', groupLabel);
      }
    }

    // Combine all text for matching
    const searchText = `${labelText} ${name} ${id} ${placeholder} ${autoId} ${dataTest}`;

    // Try to match against canonical fields
    for (const [fieldKey, patterns] of Object.entries(this.FIELDS)) {
      for (const pattern of patterns) {
        if (searchText.includes(pattern)) {
          return {
            key: fieldKey,
            label: labelText || pattern,
            isMandatory: this.isMandatory(element),
            isRadioGroup: isRadio
          };
        }
      }
    }

    // If mandatory but not classified, treat as custom field
    if (this.isMandatory(element) && labelText) {
      return {
        key: labelText,
        label: labelText,
        isMandatory: true,
        isCustom: true,
        isRadioGroup: isRadio
      };
    }

    // Even if not mandatory, if it has a label, classify it (for "fill all" mode)
    if (labelText) {
      return {
        key: labelText,
        label: labelText,
        isMandatory: false,
        isCustom: true,
        isRadioGroup: isRadio
      };
    }

    return null;
  },

  /**
   * Recursively find all elements including those in shadow DOM
   */
  getAllElements(root = document, selector) {
    const elements = [];

    // Get elements from current root
    elements.push(...root.querySelectorAll(selector));

    // Recursively search shadow roots
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        console.log('[Field Detector] Found shadow root in:', el.tagName);
        elements.push(...this.getAllElements(el.shadowRoot, selector));
      }
    }

    return elements;
  },

  /**
   * Get all fillable fields on page
   */
  getFields() {
    const selector = 'input:not([type="hidden"]):not([type="password"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]), textarea, select';

    console.log('[Field Detector] Searching for fields (including shadow DOM) with selector:', selector);

    // Search in regular DOM AND shadow DOM
    const elements = this.getAllElements(document, selector);

    // Also look for custom form components with ARIA roles
    const customInputs = this.getAllElements(document, '[role="textbox"]');
    const customRadios = this.getAllElements(document, '[role="radio"]');
    const customCheckboxes = this.getAllElements(document, '[role="checkbox"]');
    const customComboboxes = this.getAllElements(document, '[role="combobox"]');
    const customListboxes = this.getAllElements(document, '[role="listbox"]');
    const customSpinbuttons = this.getAllElements(document, '[role="spinbutton"]');
    const customSliders = this.getAllElements(document, '[role="slider"]');

    // Look for specific web component libraries (spl-*, oc-*, etc.)
    const splAutocomplete = Array.from(document.querySelectorAll('spl-autocomplete'));
    const splTextarea = Array.from(document.querySelectorAll('spl-textarea'));
    const splDateField = Array.from(document.querySelectorAll('spl-date-field'));
    const splCheckbox = Array.from(document.querySelectorAll('spl-checkbox'));
    const splInput = Array.from(document.querySelectorAll('spl-input'));
    const splRadioGroup = Array.from(document.querySelectorAll('spl-radio-group'));

    console.log('[Field Detector] Found custom components:', {
      textboxes: customInputs.length,
      radios: customRadios.length,
      checkboxes: customCheckboxes.length,
      comboboxes: customComboboxes.length,
      listboxes: customListboxes.length,
      spinbuttons: customSpinbuttons.length,
      sliders: customSliders.length,
      splAutocomplete: splAutocomplete.length,
      splTextarea: splTextarea.length,
      splDateField: splDateField.length,
      splCheckbox: splCheckbox.length,
      splInput: splInput.length,
      splRadioGroup: splRadioGroup.length
    });

    // Combine all
    const allElements = [
      ...elements,
      ...customInputs,
      ...customRadios,
      ...customCheckboxes,
      ...customComboboxes,
      ...customListboxes,
      ...customSpinbuttons,
      ...customSliders,
      ...splAutocomplete,
      ...splTextarea,
      ...splDateField,
      ...splCheckbox,
      ...splInput,
      ...splRadioGroup
    ];

    // Remove duplicates
    const uniqueElements = Array.from(new Set(allElements));
    console.log('[Field Detector] Found elements before filtering:', uniqueElements.length);

    const filtered = uniqueElements.filter(el => {
      // Skip if disabled or readonly
      if (el.disabled || el.readOnly) {
        console.log('[Field Detector] Skipping disabled/readonly:', el);
        return false;
      }

      // For custom elements with aria-disabled or disabled attribute
      if (el.getAttribute('aria-disabled') === 'true' || el.getAttribute('disabled') !== null) {
        console.log('[Field Detector] Skipping aria-disabled/disabled:', el);
        return false;
      }

      // Don't skip invisible fields - some forms load them dynamically
      // Just check if element exists in DOM
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        console.log('[Field Detector] Skipping hidden field:', el);
        return false;
      }

      return true;
    });

    console.log('[Field Detector] Fields after filtering:', filtered.length);
    return filtered;
  },

  /**
   * Recursively find an element in shadow DOM trees
   */
  findInShadowDOM(root, selector, maxDepth = 5) {
    if (!root || maxDepth <= 0) return null;

    // Try direct querySelector first
    const direct = root.querySelector(selector);
    if (direct) return direct;

    // Search recursively through all shadow roots
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
   * Set field value (handles React/Vue and custom components)
   */
  setValue(element, value) {
    if (!element || value === null || value === undefined) return false;

    const tagName = element.tagName?.toLowerCase();
    const role = element.getAttribute('role');
    const type = (element.type || '').toLowerCase();

    try {
      // Handle web component libraries first
      if (tagName) {
        switch (tagName) {
          case 'spl-autocomplete':
          case 'spl-input':
            element.setAttribute('value', value);

            // Search deeply through shadow DOM for the actual input
            let innerInput = null;
            if (element.shadowRoot) {
              innerInput = this.findInShadowDOM(element.shadowRoot, 'input');
            }

            if (innerInput) {
              // Use native setter for React compatibility
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              ).set;

              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(innerInput, value);
              } else {
                innerInput.value = value;
              }

              innerInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              innerInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              innerInput.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
              console.log('[Field Detector] ✓ Set value on nested input:', value);
            } else {
              console.warn('[Field Detector] Could not find nested input in spl-input. Trying attribute-only method.');
              // Fallback: just set the attribute and trigger events on the component itself
              element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            }
            element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            return true;

          case 'spl-textarea':
            element.setAttribute('value', value);
            // Search deeply through shadow DOM for the actual textarea
            let innerTextarea = null;
            if (element.shadowRoot) {
              innerTextarea = this.findInShadowDOM(element.shadowRoot, 'textarea');
            }

            if (innerTextarea) {
              const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
              ).set;

              if (nativeTextareaValueSetter) {
                nativeTextareaValueSetter.call(innerTextarea, value);
              } else {
                innerTextarea.value = value;
              }

              innerTextarea.dispatchEvent(new Event('input', { bubbles: true }));
              innerTextarea.dispatchEvent(new Event('change', { bubbles: true }));
              innerTextarea.dispatchEvent(new Event('blur', { bubbles: true }));
              console.log('[Field Detector] Set value on nested textarea:', value.substring(0, 50) + '...');
            } else {
              console.warn('[Field Detector] Could not find nested textarea in spl-textarea');
            }
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;

          case 'spl-date-field':
            console.log('[Field Detector] Setting spl-date-field with value:', value, 'type:', typeof value);

            // Normalize date format if needed
            let dateValue = value;
            if (typeof value === 'string') {
              // Try to parse various date formats and ensure 4-digit year

              // Format: MM/YYYY or MM/YY (month-year only)
              const monthYearMatch = value.match(/^(\d{1,2})\/(\d{2,4})$/);
              if (monthYearMatch) {
                const month = monthYearMatch[1].padStart(2, '0');
                let year = monthYearMatch[2];
                // Handle 2-digit year - assume past dates are 19xx/20xx, not future
                if (year.length === 2) {
                  const yearNum = parseInt(year);
                  // For years 00-26, could be 2000-2026 (recent past/near future)
                  // For years 27-99, must be 1927-1999 (historical)
                  year = yearNum <= 26 ? `20${year}` : `19${year}`;
                }
                dateValue = `${month}/01/${year}`;
                console.log('[Field Detector] Converted MM/YY format:', value, '→', dateValue);
              }

              // Format: MM/DD/YY or M/D/YY (with 2-digit year)
              const shortYearMatch = dateValue.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
              if (shortYearMatch) {
                const month = shortYearMatch[1].padStart(2, '0');
                const day = shortYearMatch[2].padStart(2, '0');
                let year = shortYearMatch[3];
                const yearNum = parseInt(year);
                // Same logic: 00-26 = 2000-2026, 27-99 = 1927-1999
                year = yearNum <= 26 ? `20${year}` : `19${year}`;
                dateValue = `${year}-${month}-${day}`;
                console.log('[Field Detector] Converted short year format:', value, '→', dateValue);
              }

              // Format: MM/DD/YYYY (with 4-digit year) - convert to ISO
              const fullDateMatch = dateValue.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
              if (fullDateMatch && !shortYearMatch) {
                const month = fullDateMatch[1].padStart(2, '0');
                const day = fullDateMatch[2].padStart(2, '0');
                const year = fullDateMatch[3];
                dateValue = `${year}-${month}-${day}`;
                console.log('[Field Detector] Converted to ISO format:', value, '→', dateValue);
              }
            }

            element.setAttribute('value', dateValue);
            const datePicker = element.shadowRoot?.querySelector('spl-date-picker');
            if (datePicker) {
              const dateInput = datePicker.shadowRoot?.querySelector('input');
              if (dateInput) {
                console.log('[Field Detector] Setting nested date input value:', dateValue);
                dateInput.value = dateValue;
                dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                dateInput.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            return true;

          case 'spl-checkbox':
            const shouldCheck = value === true || value === 'true' || String(value).toLowerCase() === 'yes';
            const checkboxInput = element.shadowRoot?.querySelector('input[type="checkbox"]');
            if (checkboxInput) {
              checkboxInput.checked = shouldCheck;
              checkboxInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
        }
      }

      // Handle custom components with ARIA roles
      if (role) {
        switch (role) {
          case 'radio':
            // Find all radios in the same group and match by label text or value
            const name = element.getAttribute('name');
            if (name) {
              const root = this.getRoot(element);
              const radios = root.querySelectorAll(`[role="radio"][name="${CSS.escape(name)}"]`);
              const normalizedValue = this.normalize(String(value));

              for (const radio of radios) {
                const label = radio.getAttribute('label') || this.getLabelText(radio);
                const radioValue = radio.getAttribute('value');
                const normalizedLabel = this.normalize(label);
                const normalizedRadioValue = this.normalize(radioValue);

                if (normalizedLabel === normalizedValue ||
                    normalizedLabel.includes(normalizedValue) ||
                    normalizedValue.includes(normalizedLabel) ||
                    normalizedRadioValue === normalizedValue) {
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
            if (shouldCheck) {
              element.setAttribute('checked', '');
            } else {
              element.removeAttribute('checked');
            }
            element.click();
            return true;

          case 'textbox':
          case 'combobox':
          case 'spinbutton':
            element.setAttribute('value', value);
            element.textContent = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
      }

      // Standard elements
      if (tagName === 'select') {
        // Find matching option
        const normalizedValue = this.normalize(String(value));
        for (let i = 0; i < element.options.length; i++) {
          const option = element.options[i];
          const optionText = this.normalize(option.text);
          const optionValue = this.normalize(option.value);

          if (optionValue === normalizedValue || optionText === normalizedValue) {
            element.selectedIndex = i;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }

      if (type === 'checkbox') {
        const shouldCheck = value === true || value === 'true' || String(value).toLowerCase() === 'yes';
        element.checked = shouldCheck;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      if (type === 'radio') {
        // For radio buttons, find all radios in the same group and match by label text or value
        if (element.name) {
          const root = this.getRoot(element);
          const radios = root.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
          const normalizedValue = this.normalize(String(value));

          for (const radio of radios) {
            const labelText = this.normalize(this.getLabelText(radio));
            const radioValue = this.normalize(radio.value);

            if (labelText === normalizedValue ||
                labelText.includes(normalizedValue) ||
                normalizedValue.includes(labelText) ||
                radioValue === normalizedValue) {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              radio.dispatchEvent(new Event('click', { bubbles: true }));
              return true;
            }
          }
        }
        return false;
      }

      // Text inputs (including tel) - handle React
      if (tagName === 'input' || tagName === 'textarea') {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        ).set;
        const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        ).set;

        if (tagName === 'input' && nativeInputValueSetter) {
          nativeInputValueSetter.call(element, value);
        } else if (tagName === 'textarea' && nativeTextareaValueSetter) {
          nativeTextareaValueSetter.call(element, value);
        } else {
          element.value = value;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }

      // Fallback for other elements
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;

    } catch (error) {
      console.error('Error setting field value:', error);
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

    // Handle web component libraries (spl-*, oc-*, etc.)
    if (tagName) {
      switch (tagName) {
        case 'spl-autocomplete':
        case 'spl-input':
        case 'spl-textarea':
        case 'spl-date-field':
          return element.getAttribute('value') || '';

        case 'spl-checkbox':
          // Get the actual checkbox state from inside the shadow DOM
          const checkbox = element.shadowRoot?.querySelector('input[type="checkbox"]');
          return checkbox ? checkbox.checked : false;

        case 'spl-radio-group':
          // Find the checked radio in the group
          const checkedRadio = element.querySelector('spl-radio[checked], spl-radio[aria-checked="true"]');
          if (checkedRadio) {
            return checkedRadio.getAttribute('label') || checkedRadio.getAttribute('value');
          }
          return null;
      }
    }

    // Handle custom components with ARIA roles
    if (role) {
      switch (role) {
        case 'radio':
          const name = element.getAttribute('name');
          if (name) {
            // Find all radios in the same group
            const root = this.getRoot(element);
            const allRadios = root.querySelectorAll(`[role="radio"][name="${CSS.escape(name)}"]`);

            // Find the checked one
            for (const radio of allRadios) {
              if (radio.getAttribute('aria-checked') === 'true' || radio.hasAttribute('checked')) {
                const label = radio.getAttribute('label') || this.getLabelText(radio) || radio.getAttribute('value');
                console.log('[Field Detector] Custom radio group:', name, 'value:', label);
                return label;
              }
            }
          }
          return null;

        case 'checkbox':
          const checked = element.getAttribute('aria-checked') === 'true' || element.hasAttribute('checked');
          return checked;

        case 'textbox':
        case 'combobox':
        case 'spinbutton':
          // Try different ways to get value from custom components
          return element.getAttribute('value') ||
                 element.getAttribute('aria-valuenow') ||
                 element.textContent?.trim() ||
                 '';

        case 'slider':
          return element.getAttribute('aria-valuenow') || '';

        case 'listbox':
          // Get selected option
          const selected = element.querySelector('[aria-selected="true"]');
          return selected ? selected.textContent.trim() : '';
      }
    }

    // Standard elements
    if (type === 'checkbox') return element.checked;
    if (type === 'radio') {
      // For radio buttons, get the value of the checked button in the group
      if (element.name) {
        const root = this.getRoot(element);
        const checkedRadio = root.querySelector(`input[type="radio"][name="${CSS.escape(element.name)}"]:checked`);
        console.log('[Field Detector] Radio group:', element.name, 'checked:', checkedRadio);
        if (checkedRadio) {
          // Return the label text of the checked radio button
          const labelText = this.getLabelText(checkedRadio);
          const value = labelText || checkedRadio.value;
          console.log('[Field Detector] Radio value:', value);
          return value;
        }
      } else {
        console.log('[Field Detector] Radio button has no name attribute:', element);
      }
      return null;
    }

    return element.value || '';
  }
};

// Make available globally
window.FieldDetector = FieldDetector;

console.log('✅ [Career Autofill] field-detector.js LOADED successfully!');
console.log('✅ [Career Autofill] FieldDetector available:', typeof window.FieldDetector);
