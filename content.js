/**
 * Content Script - Coordinates form autofill, AI semantic matching, and DOM interaction.
 */

console.log('[Career Autofill] content.js loading...');

(function() {
  'use strict';

  const SCRIPT_VERSION = '2.2.0';
  window.__CAREER_AUTOFILL_VERSION__ = SCRIPT_VERSION;

  if (window.__CAREER_AUTOFILL_LOADED__) {
    console.log(`[Career Autofill] Re-initializing content script v${SCRIPT_VERSION} with active runtime context`);
  }
  if (window.__CAREER_AUTOFILL_CLEANUP__) {
    try { window.__CAREER_AUTOFILL_CLEANUP__(); } catch (e) {}
  }
  window.__CAREER_AUTOFILL_LOADED__ = true;

  const detector = window.FieldDetector;
  if (!detector) {
    console.error('[Career Autofill] FieldDetector not available in content script');
    return;
  }

  console.log('[Career Autofill] FieldDetector connected successfully');

  /**
   * Main Hybrid Autofill Execution
   * Tier 1: Fast deterministic heuristic matching (0-5ms)
   * Tier 2: On-Device Gemini Nano AI semantic matching for ambiguous/multiple description fields
   * Tier 3: Fallback heuristics
   */
  /**
   * Intelligently synthesize contextual, professional responses for job application essays
   * using the candidate's name, current title, company, and background.
   */
  function synthesizeEssay(key, prof = {}, questionLabel = '') {
    const name = prof.fullName || (prof.firstName && prof.lastName ? `${prof.firstName} ${prof.lastName}` : (prof.firstName || ''));
    const title = prof.currentTitle || 'Software Engineer';
    const company = prof.currentCompany ? ` at ${prof.currentCompany}` : '';
    const skills = 'modern full-stack software development, distributed systems, and scalable APIs';

    if (key === 'whyUs') {
      return `I am excited to apply for this opportunity because your team's mission and engineering standards align closely with my career goals. With my background as a ${title}${company}, I look forward to contributing my technical problem-solving skills, collaborating on high-impact projects, and building resilient software with your team.`;
    }
    if (key === 'projectHighlight') {
      return `In my experience as a ${title}, I spearheaded the architecture and delivery of a scalable, high-throughput feature from conception to production. I collaborated cross-functionally to optimize latency, implement comprehensive automated test suites, and ensure high availability while delivering measurable user value.`;
    }
    if (key === 'coverLetter') {
      const greeting = 'Dear Hiring Team,\n\n';
      const body = `I am writing to express my strong interest in joining your engineering organization as a ${title}. With a proven foundation in ${skills}, I thrive when tackling complex technical challenges and turning product requirements into clean, scalable software.\n\nThroughout my career, I have prioritized engineering rigor, continuous learning, and close cross-functional collaboration. I would welcome the opportunity to bring my technical skills and dedication to your team.\n\nThank you for your time and consideration.\n\n`;
      const signoff = name ? `Sincerely,\n${name}` : 'Sincerely,\nApplicant';
      return greeting + body + signoff;
    }
    if (key === 'aboutMe') {
      return `${title} dedicated to developing scalable, high-performance applications and intuitive user experiences. Passionate about software craftsmanship, emerging technologies, and delivering impact.`;
    }
    return '';
  }

  /**
   * Helper to resolve profile values including flat keys and customFields array
   */
  function getProfileValue(key, profile) {
    if (!key || !profile) return null;
    if (profile[key] !== undefined && profile[key] !== null) {
      const str = String(profile[key]).trim();
      if (str.length > 0) return profile[key];
    }
    if (Array.isArray(profile.customFields)) {
      const keyLower = String(key).toLowerCase().trim();
      const matched = profile.customFields.find(cf => {
        const cfKey = String(cf.key || '').toLowerCase().trim();
        const cfLabel = String(cf.label || '').toLowerCase().trim();
        return cfKey === keyLower || cfLabel === keyLower;
      });
      if (matched && matched.value !== undefined && matched.value !== null) {
        const str = String(matched.value).trim();
        if (str.length > 0) return matched.value;
      }
    }
    return null;
  }

  /**
   * Main Hybrid / AI Enforced Autofill Execution
   * - AI Enforced Mode (Default/Recommended): Complete semantic tree arbitration on all candidate fields.
   *   Prevents blind heuristic guessing.
   * - Hybrid Mode: Tier 1 Fast Regex -> Tier 2 AI for ambiguous -> Tier 3 Heuristics fallback.
   */
  async function autofill(options = {}) {
    try {
      const fillAllParam = typeof options === 'boolean' ? options : (options && typeof options.fillAll === 'boolean' ? options.fillAll : null);
      const aiEnforcedParam = options && typeof options.aiEnforced === 'boolean' ? options.aiEnforced : null;
      const overwriteParam = options && typeof options.overwrite === 'boolean' ? options.overwrite : null;

      let storageData = {};
      try {
        if (chrome.runtime?.id && chrome.storage?.local) {
          storageData = await chrome.storage.local.get(['profile', 'fillAllMode', 'aiEnforcedMode', 'overwriteMode']);
        }
      } catch (e) {}

      const passedProfile = (options && options.profile && typeof options.profile === 'object') ? options.profile : null;
      const profile = passedProfile || storageData.profile || {};
      const shouldFillAll = fillAllParam !== null ? fillAllParam : (storageData.fillAllMode !== false);
      const isAiEnforced = aiEnforcedParam !== null ? aiEnforcedParam : (storageData.aiEnforcedMode !== false);
      const shouldOverwrite = overwriteParam !== null ? overwriteParam : (storageData.overwriteMode === true);

      const profileKeys = Object.keys(profile).filter(k => k !== 'customFields' && profile[k] && String(profile[k]).trim().length > 0);
      if (Array.isArray(profile.customFields)) {
        profile.customFields.forEach(cf => {
          if (cf.value && String(cf.value).trim().length > 0) {
            profileKeys.push(cf.key || cf.label);
          }
        });
      }
      if (profileKeys.length === 0) {
        console.warn('[Career Autofill] Profile is empty. Nothing to fill.');
        return -1; // Special code: Profile is empty
      }

      const allFields = detector.getFields();
      console.log(`[Career Autofill] Discovered ${allFields.length} fillable fields on page`);

      let filledCount = 0;

      // Core candidate profile keys that should always be candidate fields even if portal omits explicit asterisk
      const CORE_IDENTITY_KEYS = new Set([
        'firstname', 'lastname', 'fullname', 'email', 'phone', 'address', 'city', 'state', 'zipcode', 'country', 'workauth', 'sponsorship'
      ]);

      // =========================================================================
      // AI ENFORCED MODE: Full Semantic Tree Arbitration (Zero Blind Guesses)
      // =========================================================================
      if (isAiEnforced) {
        console.log('[Career Autofill] Executing in AI ENFORCED MODE (Full Semantic Arbitration)...');
        const candidateFields = [];

        for (const field of allFields) {
          if (field.type === 'password' || field.disabled) continue;

          // Check readonly: Allow readonly comboboxes, datepickers, selects, or custom controls
          if (field.readOnly) {
            const isInteractiveCombobox =
              field.getAttribute('role') === 'combobox' ||
              field.getAttribute('role') === 'textbox' ||
              field.hasAttribute('aria-haspopup') ||
              field.getAttribute('data-automation-id')?.includes('select') ||
              field.getAttribute('data-automation-id')?.includes('country') ||
              field.getAttribute('data-automation-id')?.includes('date') ||
              field.classList?.contains('select') ||
              field.classList?.contains('dropdown') ||
              field.closest('[role="combobox"], [data-automation-id="formField"]');
            if (!isInteractiveCombobox) continue;
          }

          // Skip dial codes
          const classification = detector.classify(field);
          if (classification && ['countrycode', 'country code'].includes(classification.key.toLowerCase())) {
            continue;
          }

          // Check candidate eligibility:
          // In AI Enforced mode, if shouldFillAll is true (default), all interactive candidate fields are evaluated.
          // If shouldFillAll is false, mandatory fields, core identity fields, OR fields that have matching profile values are evaluated.
          const isEssayField = field.tagName?.toLowerCase() === 'textarea' || field.tagName?.toLowerCase() === 'spl-textarea';
          const profileHasKey = classification && (getProfileValue(classification.key, profile) !== null || getProfileValue(classification.label, profile) !== null);
          const isCoreField = classification && CORE_IDENTITY_KEYS.has(classification.key.toLowerCase());
          const isMandatory = detector.isMandatory(field);

          if (!shouldFillAll && !isMandatory && !isCoreField && !profileHasKey && !isEssayField) {
            continue;
          }

          // Skip if already filled unless overwrite is enabled
          if (!shouldOverwrite) {
            const currentValue = detector.getValue(field);
            if (currentValue && String(currentValue).trim().length > 0) {
              continue;
            }
          }

          candidateFields.push(field);
        }

        console.log(`[Career Autofill AI Enforced] Routing ${candidateFields.length} candidate fields to AI Arbiter...`);
        if (candidateFields.length === 0) {
          const filledOnPage = allFields.filter(f => {
            const v = detector.getValue(f);
            return v && String(v).trim().length > 0;
          });
          if (filledOnPage.length > 0) {
            console.log(`[Career Autofill] All ${filledOnPage.length} candidate fields on page are already filled.`);
            return -2; // Special code: Already filled
          }
          return 0;
        }

        const elementMap = new Map();
        const sft = detector.buildSemanticFormTree(candidateFields);
        sft.forEach((item, idx) => {
          const field = candidateFields[idx];
          elementMap.set(item.id, field);
          if (field.id) {
            elementMap.set(field.id, field);
            elementMap.set(field.id.toLowerCase(), field);
          }
          if (field.name) {
            elementMap.set(field.name, field);
            elementMap.set(field.name.toLowerCase(), field);
          }
          const label = detector.getLabelText(field);
          if (label) {
            elementMap.set(label.toLowerCase().trim(), field);
            elementMap.set(detector.normalize(label), field);
            const cleanLabel = label.replace(/[*:,?_\-()[\]\/"'’]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            elementMap.set(cleanLabel, field);
          }
        });

        let mappings = [];

        // 1. First, attempt Gemini Nano Prompt API via background with a fast 800ms race
        try {
          if (chrome.runtime?.id && typeof chrome.runtime.sendMessage === 'function') {
            const aiPromise = chrome.runtime.sendMessage({
              action: 'aiMatchFields',
              fields: sft,
              profile: profile,
              options: { aiEnforced: true, minConfidence: 0.70 }
            });
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Prompt API timeout (800ms)')), 800)
            );
            const aiResponse = await Promise.race([aiPromise, timeoutPromise]);
            if (aiResponse && aiResponse.success && Array.isArray(aiResponse.mappings) && aiResponse.mappings.length > 0) {
              mappings = aiResponse.mappings;
              console.log(`[Career Autofill AI Enforced] Received ${mappings.length} mappings from Gemini Nano Prompt API`);
            }
          }
        } catch (msgErr) {
          console.warn('[Career Autofill AI Enforced] Background Prompt API query unavailable or timed out:', msgErr.message);
        }

        // 2. If Prompt API returned 0 mappings, timed out, or background is sleeping/disconnected:
        // Execute the On-Device Semantic Reasoning Arbiter DIRECTLY in content script without IPC latency!
        if (mappings.length === 0 && typeof detector.arbitrateSemanticFields === 'function') {
          console.log('[Career Autofill AI Enforced] Running Local Semantic Arbiter directly in content script (0ms latency)...');
          const arbiterRes = detector.arbitrateSemanticFields(sft, profile, { aiEnforced: true, minConfidence: 0.70 });
          if (arbiterRes && Array.isArray(arbiterRes.mappings) && arbiterRes.mappings.length > 0) {
            mappings = arbiterRes.mappings;
            console.log(`[Career Autofill AI Enforced] Local Semantic Arbiter generated ${mappings.length} verified mappings:`, mappings);
          }
        }

        // 3. Populate matching elements
        if (mappings.length > 0) {
          for (const mapping of mappings) {
            let matchedElement = elementMap.get(mapping.fieldId);
            if (!matchedElement && typeof mapping.fieldId === 'string') {
              const trimmedId = mapping.fieldId.trim();
              const normId = detector.normalize(trimmedId);
              matchedElement =
                elementMap.get(trimmedId.toLowerCase()) ||
                elementMap.get(normId) ||
                document.querySelector(`[data-ca-field-id="${trimmedId}"]`) ||
                document.getElementById(trimmedId) ||
                document.querySelector(`[name="${CSS.escape(trimmedId)}"]`) ||
                detector.getAllElements(document, `[data-ca-field-id="${trimmedId}"]`)[0];

              if (!matchedElement) {
                matchedElement = candidateFields.find(f => {
                  const l = detector.getLabelText(f);
                  return detector.normalize(l) === normId || f.name === trimmedId || f.id === trimmedId;
                });
              }
            }
            if (!matchedElement) continue;

            if (!shouldOverwrite) {
              const curVal = detector.getValue(matchedElement);
              if (curVal && String(curVal).trim().length > 0) continue;
            }

            let fillVal = null;
            if (mapping.selectedOption) {
              fillVal = mapping.selectedOption;
            } else if (mapping.profileKey === 'fullName') {
              fillVal = profile.fullName || (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : null);
            } else if (mapping.profileKey === 'firstName') {
              fillVal = profile.firstName || (profile.fullName ? profile.fullName.trim().split(/\s+/)[0] : null);
            } else if (mapping.profileKey === 'lastName') {
              fillVal = profile.lastName || (profile.fullName ? profile.fullName.trim().split(/\s+/).slice(1).join(' ') : null);
            } else if (mapping.profileKey === 'workAuthCountries') {
              fillVal = profile.workAuthCountries || profile.country;
            } else if (mapping.profileKey === 'workAuth') {
              fillVal = profile.workAuth || 'Yes';
            } else if (mapping.profileKey === 'sponsorship') {
              fillVal = profile.sponsorship || 'No';
            } else if (mapping.profileKey === 'todaysDate') {
              const isDateInput = matchedElement.type === 'date' || matchedElement.tagName?.toLowerCase() === 'spl-date-field';
              fillVal = detector.getTodaysDate(isDateInput ? 'iso' : 'text');
            } else if (mapping.profileKey && getProfileValue(mapping.profileKey, profile) !== null) {
              fillVal = getProfileValue(mapping.profileKey, profile);
            } else if (['whyUs', 'projectHighlight', 'coverLetter', 'aboutMe'].includes(mapping.profileKey)) {
              fillVal = synthesizeEssay(mapping.profileKey, profile, detector.getLabelText(matchedElement));
            }

            if (fillVal !== null && fillVal !== undefined && String(fillVal).trim() !== '') {
              const ok = detector.setValue(matchedElement, fillVal);
              if (ok) {
                filledCount++;
                highlightField(matchedElement, 'ai-enforced');
                console.log(`[Career Autofill AI Enforced] Filled ${mapping.fieldId} -> ${mapping.profileKey}`);
              }
            }
          }
        }

        // 4. Fallback: If AI returned 0 mappings, attempt deterministic heuristic fill so user is not blocked
        if (filledCount === 0 && candidateFields.length > 0) {
          console.log('[Career Autofill AI Enforced] 0 AI mappings returned, attempting fallback heuristic resolution...');
          for (const field of candidateFields) {
            const cls = detector.classify(field);
            if (!cls) continue;
            let val = null;
            if (cls.key === 'todaysDate') {
              val = detector.getTodaysDate(field.type === 'date' ? 'iso' : 'text');
            } else if (cls.key === 'fullName') {
              val = profile.fullName || (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : null);
            } else if (cls.key === 'firstName') {
              val = profile.firstName || (profile.fullName ? profile.fullName.trim().split(/\s+/)[0] : null);
            } else if (cls.key === 'lastName') {
              val = profile.lastName || (profile.fullName ? profile.fullName.trim().split(/\s+/).slice(1).join(' ') : null);
            } else if (cls.key === 'workAuth') {
              val = profile.workAuth || 'Yes';
            } else if (cls.key === 'sponsorship') {
              val = profile.sponsorship || 'No';
            } else if (getProfileValue(cls.key, profile) !== null || getProfileValue(cls.label, profile) !== null) {
              val = getProfileValue(cls.key, profile) !== null ? getProfileValue(cls.key, profile) : getProfileValue(cls.label, profile);
            } else if (['whyUs', 'projectHighlight', 'coverLetter', 'aboutMe'].includes(cls.key)) {
              val = synthesizeEssay(cls.key, profile, detector.getLabelText(field));
            }
            if (val !== null && val !== undefined && String(val).trim() !== '') {
              const ok = detector.setValue(field, val);
              if (ok) {
                filledCount++;
                highlightField(field, 'heuristic');
                console.log(`[Career Autofill AI Enforced] Fallback filled ${field.id || field.name || cls.key} -> ${cls.key}`);
              }
            }
          }
        }

        console.log(`[Career Autofill] AI Enforced autofill completed. Total fields filled: ${filledCount}`);
        return filledCount;
      }


      // =========================================================================
      // HYBRID MODE (Legacy Tier 1 Heuristics + Tier 2 AI for ambiguous)
      // =========================================================================
      const unmappedFields = [];
      const longFormFields = [];
      for (const field of allFields) {
        if (field.type === 'password' || field.disabled) continue;

        if (field.readOnly) {
          const isInteractiveCombobox =
            field.getAttribute('role') === 'combobox' ||
            field.getAttribute('role') === 'textbox' ||
            field.hasAttribute('aria-haspopup') ||
            field.getAttribute('data-automation-id')?.includes('select') ||
            field.getAttribute('data-automation-id')?.includes('country') ||
            field.getAttribute('data-automation-id')?.includes('date') ||
            field.classList?.contains('select') ||
            field.classList?.contains('dropdown') ||
            field.closest('[role="combobox"], [data-automation-id="formField"]');
          if (!isInteractiveCombobox) continue;
        }

        const classification = detector.classify(field);
        if (!classification) {
          unmappedFields.push(field);
          continue;
        }

        // Skip blacklisted fields
        if (['countrycode', 'country code'].includes(classification.key.toLowerCase())) {
          continue;
        }

        // Check mandatory requirement (core identity fields and profile-matching fields are eligible)
        const profileHasKey = classification && profile[classification.key] && String(profile[classification.key]).trim().length > 0;
        const isCoreField = classification && CORE_IDENTITY_KEYS.has(classification.key.toLowerCase());
        if (!shouldFillAll && !classification.isMandatory && !isCoreField && !profileHasKey) {
          continue;
        }


        // Skip if already filled unless overwrite is enabled
        if (!shouldOverwrite) {
          const currentValue = detector.getValue(field);
          if (currentValue && String(currentValue).trim().length > 0) {
            continue;
          }
        }

        // Long-form textareas or custom questions defer to Tier 2 AI
        if (classification.isLongForm || classification.isCustom) {
          longFormFields.push(field);
          continue;
        }

        let valueToFill = null;
        if (classification.key === 'todaysDate') {
          const isDateInput = field.type === 'date' || field.tagName?.toLowerCase() === 'spl-date-field';
          valueToFill = detector.getTodaysDate(isDateInput ? 'iso' : 'text');
        } else if (classification.key === 'fullName') {
          valueToFill = profile.fullName || (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : null);
        } else if (classification.key === 'firstName') {
          valueToFill = profile.firstName || (profile.fullName ? profile.fullName.trim().split(/\s+/)[0] : null);
        } else if (classification.key === 'lastName') {
          valueToFill = profile.lastName || (profile.fullName ? profile.fullName.trim().split(/\s+/).slice(1).join(' ') : null);
        } else if (classification.key === 'workAuth') {
          const questionText = detector.getSurroundingContext(field) || classification.label;
          const authCheck = detector.evaluateCountryWorkAuth(questionText, profile);
          valueToFill = authCheck.hasCountryContext ? (authCheck.isAuthorized ? (profile.workAuth || 'Yes') : 'No') : (profile.workAuth || 'Yes');
        } else if (classification.key === 'sponsorship') {
          const questionText = detector.getSurroundingContext(field) || classification.label;
          const authCheck = detector.evaluateCountryWorkAuth(questionText, profile);
          if (authCheck.hasCountryContext) {
            valueToFill = authCheck.isAuthorized ? (profile.sponsorship || 'No') : (profile.sponsorshipOtherCountries || 'Yes');
          } else {
            valueToFill = profile.sponsorship || 'No';
          }
        } else if (classification.key === 'workAuthCountries') {
          valueToFill = profile.workAuthCountries || profile.country;
        } else if (getProfileValue(classification.key, profile) !== null || getProfileValue(classification.label, profile) !== null) {
          valueToFill = getProfileValue(classification.key, profile) !== null ? getProfileValue(classification.key, profile) : getProfileValue(classification.label, profile);
        } else if (['whyUs', 'projectHighlight', 'coverLetter', 'aboutMe'].includes(classification.key)) {
          valueToFill = synthesizeEssay(classification.key, profile, detector.getLabelText(field));
        }

        if (valueToFill !== null && valueToFill !== undefined && String(valueToFill).trim() !== '') {
          const success = detector.setValue(field, valueToFill);
          if (success) {
            filledCount++;
            highlightField(field, 'heuristic');
          }
        } else {
          unmappedFields.push(field);
        }
      }

      const candidatesForAi = Array.from(new Set([...longFormFields, ...unmappedFields])).slice(0, 25);

      if (candidatesForAi.length > 0) {
        console.log(`[Career Autofill Hybrid] Routing ${candidatesForAi.length} fields to AI Arbiter`);
        const elementMap = new Map();
        const sft = detector.buildSemanticFormTree(candidatesForAi);
        sft.forEach((item, idx) => {
          const f = candidatesForAi[idx];
          elementMap.set(item.id, f);
          if (f.id) elementMap.set(f.id, f);
          if (f.name) elementMap.set(f.name, f);
          const lbl = detector.getLabelText(f);
          if (lbl) elementMap.set(lbl.toLowerCase().trim(), f);
        });

        try {
          const aiResponse = await chrome.runtime.sendMessage({
            action: 'aiMatchFields',
            fields: sft,
            profile: profile
          });

          if (aiResponse && aiResponse.success && Array.isArray(aiResponse.mappings)) {
            for (const mapping of aiResponse.mappings) {
              let matchedElement = elementMap.get(mapping.fieldId);
              if (!matchedElement && typeof mapping.fieldId === 'string') {
                const trimmedId = mapping.fieldId.trim();
                matchedElement =
                  elementMap.get(trimmedId.toLowerCase()) ||
                  document.querySelector(`[data-ca-field-id="${trimmedId}"]`) ||
                  document.getElementById(trimmedId) ||
                  document.querySelector(`[name="${CSS.escape(trimmedId)}"]`) ||
                  detector.getAllElements(document, `[data-ca-field-id="${trimmedId}"]`)[0];
              }
              if (!matchedElement) continue;

              if (!shouldOverwrite) {
                const curVal = detector.getValue(matchedElement);
                if (curVal && String(curVal).trim().length > 0) continue;
              }

              let fillVal = null;
              if (mapping.selectedOption) {
                fillVal = mapping.selectedOption;
              } else if (mapping.profileKey && profile[mapping.profileKey]) {
                fillVal = profile[mapping.profileKey];
              } else if (['whyUs', 'projectHighlight', 'coverLetter', 'aboutMe'].includes(mapping.profileKey)) {
                fillVal = synthesizeEssay(mapping.profileKey, profile, detector.getLabelText(matchedElement));
              }

              if (fillVal !== null && fillVal !== undefined && String(fillVal).trim() !== '') {
                const ok = detector.setValue(matchedElement, fillVal);
                if (ok) {
                  filledCount++;
                  highlightField(matchedElement, 'ai-enforced');
                }
              }
            }
          }
        } catch (aiError) {
          console.warn('[Career Autofill Hybrid] AI error; fallback to Tier 3 heuristics:', aiError);
          for (const field of candidatesForAi) {
            const classification = detector.classify(field);
            if (classification && profile[classification.key]) {
              const ok = detector.setValue(field, profile[classification.key]);
              if (ok) {
                filledCount++;
                highlightField(field, 'heuristic');
              }
            }
          }
        }
      }

      console.log(`[Career Autofill] Autofill finished. Total fields filled: ${filledCount}`);
      return filledCount;
    } catch (error) {
      console.error('[Career Autofill] Autofill error:', error);
      return 0;
    }
  }

  /**
   * Visual feedback for filled elements
   */
  function highlightField(element, mode = 'heuristic') {
    try {
      const isAi = mode === 'ai-enforced';
      element.style.outline = isAi ? '2px solid #8b5cf6' : '2px solid #10b981';
      element.style.boxShadow = isAi ? '0 0 10px rgba(139, 92, 246, 0.45)' : '0 0 8px rgba(16, 185, 129, 0.35)';
      element.style.transition = 'outline 0.3s ease, box-shadow 0.3s ease';
      setTimeout(() => {
        element.style.outline = '';
        element.style.boxShadow = '';
      }, 2500);
    } catch (e) {}
  }

  /**
   * Form inspection / diagnostic helper
   * Note: Page-to-profile automatic data capture is explicitly disabled to preserve
   * extension profile integrity and prevent accidental contamination when submitting
   * applications for others or answering ambiguous questions.
   */
  async function saveFormData() {
    console.log('[Career Autofill] Page-to-profile automatic data capture is disabled to preserve profile integrity.');
    return 0;
  }

  /**
   * Gather summary page statistics
   */
  function getPageInfo() {
    const fields = detector.getFields();
    let mandatoryCount = 0;

    fields.forEach(f => {
      if (detector.isMandatory(f)) mandatoryCount++;
    });

    return {
      totalFields: fields.length,
      mandatoryFields: mandatoryCount,
      url: window.location.href,
      hostname: window.location.hostname
    };
  }

  /**
   * Heuristic detection for ATS / Career job portals
   */
  function isJobApplicationPage() {
    const url = window.location.href.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();

    const jobPatterns = [
      'workday.com', 'myworkdayjobs.com', 'myworkdaysite.com', 'smartrecruiters.com',
      'greenhouse.io', 'boards.greenhouse.io', 'lever.co', 'jobs.lever.co',
      'ashbyhq.com', 'recruitee.com', 'breezy.hr', 'icims.com',
      'ultipro.com', 'jobvite.com', 'taleo.net', 'successfactors.com',
      'selectminds.com', 'referrals.selectminds.com', 'oraclecloud.com',
      'phenom.com', 'phenompro.com', 'virtusa.com',
      'apply.workable.com', 'rippling.com', 'workable.com',
      '/careers', '/jobs', '/apply', '/application', '/job-application', '/career', '/opportunities'
    ];

    if (jobPatterns.some(p => hostname.includes(p) || url.includes(p))) {
      return true;
    }

    const fields = detector.getFields();
    if (fields.length >= 2) {
      const hasCoreJobField = fields.some(f => {
        const c = detector.classify(f);
        return c && ['firstName', 'lastName', 'fullName', 'email', 'phone', 'workAuth', 'sponsorship', 'coverLetter'].includes(c.key);
      });
      if (hasCoreJobField) return true;
    }

    return false;
  }

  /**
   * In-Page Floating Action Button (FAB)
   */
  async function createFloatingButton() {
    if (document.getElementById('career-autofill-fab')) return;
    // Prevent spawning FAB in tiny decoration or tracking iframes
    if (window !== window.top && (window.innerWidth < 350 || window.innerHeight < 300)) return;
    if (!isJobApplicationPage()) return;

    const storage = await chrome.storage.local.get(['aiEnforcedMode']);
    const isAiEnforced = storage.aiEnforcedMode !== false;

    const fab = document.createElement('div');
    fab.id = 'career-autofill-fab';
    fab.setAttribute('title', isAiEnforced ? 'Autofill Form (AI Enforced)' : 'Autofill Form (Hybrid)');
    fab.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
    `;

    const bgGradient = isAiEnforced
      ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)'
      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    const shadowColor = isAiEnforced
      ? 'rgba(139, 92, 246, 0.45)'
      : 'rgba(16, 185, 129, 0.45)';

    const style = document.createElement('style');
    style.textContent = `
      #career-autofill-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: ${bgGradient};
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 16px ${shadowColor};
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease;
        z-index: 9999999;
        user-select: none;
      }
      #career-autofill-fab:hover {
        transform: scale(1.08) translateY(-2px);
        box-shadow: 0 8px 24px ${shadowColor};
      }
      #career-autofill-fab:active {
        transform: scale(0.95);
      }
      #career-autofill-fab.filling {
        animation: ca-pulse 1s ease-in-out infinite;
      }
      @keyframes ca-pulse {
        0%, 100% { transform: scale(1); box-shadow: 0 4px 16px ${shadowColor}; }
        50% { transform: scale(1.08); box-shadow: 0 8px 28px ${shadowColor}; }
      }
      #career-autofill-fab .ca-tooltip {
        position: absolute;
        right: 64px;
        top: 50%;
        transform: translateY(-50%);
        background: #18181b;
        color: white;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      }
      #career-autofill-fab:hover .ca-tooltip {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);

    const tooltip = document.createElement('span');
    tooltip.className = 'ca-tooltip';
    tooltip.textContent = isAiEnforced ? 'Autofill Form (AI Enforced)' : 'Autofill Form (AI Enhanced)';
    fab.appendChild(tooltip);

    fab.addEventListener('click', async () => {
      fab.classList.add('filling');
      tooltip.textContent = isAiEnforced ? 'Evaluating with AI...' : 'Filling application...';

      try {
        const count = await autofill({ fillAll: true, aiEnforced: isAiEnforced });
        if (count > 0) {
          tooltip.textContent = `Filled ${count} field${count !== 1 ? 's' : ''}`;
        } else if (count === -1) {
          tooltip.textContent = 'Profile is empty — save profile first!';
        } else {
          tooltip.textContent = 'No empty fields matched';
        }
      } catch (err) {
        tooltip.textContent = 'Autofill error';
      } finally {
        fab.classList.remove('filling');
        setTimeout(() => {
          tooltip.textContent = isAiEnforced ? 'Autofill Form (AI Enforced)' : 'Autofill Form (AI Enhanced)';
        }, 2500);
      }
    });

    document.body.appendChild(fab);
  }

  setTimeout(createFloatingButton, 600);

  // Monitor SPA navigation and dynamic application modals (e.g. Virtusa / Taleo / Workday popup dialogs)
  let lastUrl = window.location.href;
  let modalDebounceTimer = null;
  const spaObserver = new MutationObserver(() => {
    const curUrl = window.location.href;
    if (curUrl !== lastUrl) {
      lastUrl = curUrl;
      setTimeout(createFloatingButton, 600);
    } else if (!document.getElementById('career-autofill-fab')) {
      clearTimeout(modalDebounceTimer);
      modalDebounceTimer = setTimeout(() => {
        if (!document.getElementById('career-autofill-fab') && isJobApplicationPage()) {
          createFloatingButton();
        }
      }, 500);
    }
  });
  if (document.body) {
    spaObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Expose global endpoints for frame-aware execution
  window.autofillExtension = autofill;
  window.saveFormDataExtension = saveFormData;
  window.getPageInfoExtension = getPageInfo;
  window.__CAREER_AUTOFILL_CLEANUP__ = () => {
    try { if (spaObserver) spaObserver.disconnect(); } catch (e) {}
    try { const fab = document.getElementById('career-autofill-fab'); if (fab) fab.remove(); } catch (e) {}
  };

  // Message router
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'autofill') {
      (async () => {
        const count = await autofill({
          fillAll: request.fillAll || false,
          aiEnforced: request.aiEnforced,
          overwrite: request.overwrite || false,
          profile: request.profile || null
        });
        sendResponse({ success: true, count });
      })();
      return true;
    }

    if (request.action === 'save') {
      (async () => {
        const count = await saveFormData();
        sendResponse({ success: true, count });
      })();
      return true;
    }

    if (request.action === 'getPageInfo') {
      sendResponse({ success: true, info: getPageInfo() });
      return false;
    }

    if (request.action === 'ping') {
      sendResponse({ success: true, version: SCRIPT_VERSION, loaded: true });
      return false;
    }
  });

  // Global debug console command
  window.debugCareerAutofill = function() {
    console.log('=== Career Autofill Diagnostic ===');
    const fields = detector.getFields();
    console.log(`Found ${fields.length} interactive fields`);
    fields.forEach((f, idx) => {
      const cls = detector.classify(f);
      console.log(`[#${idx + 1}] ${f.tagName} | type: ${f.type || 'n/a'} | required: ${detector.isMandatory(f)} | key: ${cls?.key || '(unmapped)'}`, f);
    });
    return fields;
  };

  console.log('[Career Autofill] Content script initialized and ready');
})();
