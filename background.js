/**
 * Career Autofill - Background Service Worker
 * Manages storage initialization, On-Device Gemini Nano AI (Prompt API) orchestration,
 * and built-in Local Semantic Reasoning Arbiter for AI Enforced form completion.
 */

console.log('[Career Autofill] Background service worker initializing...');

// Initialize storage on install / update
if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled?.addListener) {
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[Career Autofill] Extension installed/updated:', details.reason);

    try {
      const result = await chrome.storage.local.get(['profile', 'fillAllMode', 'aiEnforcedMode']);
      const updates = {};
      if (!result.profile) {
        updates.profile = {};
      }
      if (result.fillAllMode === undefined) {
        updates.fillAllMode = true; // Default to fill all fields
      }
      if (result.aiEnforcedMode === undefined) {
        updates.aiEnforcedMode = true; // Default to AI Enforced Mode
      }

      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
        console.log('[Career Autofill] Initialized storage settings with AI Enforced Mode enabled');
      } else {
        console.log('[Career Autofill] Existing profile loaded with', Object.keys(result.profile).length, 'fields');
      }
    } catch (error) {
      console.error('[Career Autofill] Initialization error:', error);
    }
  });
}

/**
 * Helper to safely resolve the Prompt API LanguageModel object across Chrome versions
 */
function getLanguageModelApi() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.LanguageModel !== 'undefined') {
    return globalThis.LanguageModel;
  }
  if (typeof self !== 'undefined' && typeof self.LanguageModel !== 'undefined') {
    return self.LanguageModel;
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.ai?.languageModel !== 'undefined') {
    return globalThis.ai.languageModel;
  }
  if (typeof self !== 'undefined' && typeof self.ai?.languageModel !== 'undefined') {
    return self.ai.languageModel;
  }
  if (typeof chrome !== 'undefined' && typeof chrome.aiOriginTrial?.languageModel !== 'undefined') {
    return chrome.aiOriginTrial.languageModel;
  }
  return null;
}

/**
 * Check on-device Gemini Nano capabilities and status.
 * Returns ready with 'gemini-nano' if Prompt API is active,
 * or 'local-semantic' if running on built-in on-device semantic engine.
 */
async function checkAiCapabilities() {
  const lm = getLanguageModelApi();
  if (lm) {
    try {
      let availability = 'unknown';
      if (typeof lm.availability === 'function') {
        try {
          availability = await lm.availability();
        } catch (noArgsErr) {
          availability = await lm.availability({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }]
          });
        }
      } else if (typeof lm.capabilities === 'function') {
        const caps = await lm.capabilities();
        availability = caps.available;
      }

      if (availability === 'readily' || availability === 'available') {
        return {
          available: true,
          status: 'ready',
          engine: 'gemini-nano',
          message: 'On-Device Gemini Nano is ready'
        };
      } else if (availability === 'after-download' || availability === 'downloading' || availability === 'downloadable') {
        return {
          available: true,
          status: availability,
          engine: `gemini-nano-${availability}`,
          fallbackEngine: 'local-semantic',
          message: `Gemini Nano is ${availability}; Local Semantic Arbiter active`
        };
      }
    } catch (e) {
      console.warn('[Career Autofill AI] Capability check error on Prompt API:', e);
    }
  }

  // Built-in Local Semantic Reasoning Engine is always ready and reliable
  return {
    available: true,
    status: 'ready',
    engine: 'local-semantic',
    message: 'On-Device Semantic AI Engine is active'
  };
}

// Country aliases for deep location-aware visa analysis
const COUNTRY_ALIASES = {
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
};

function normalizeText(text) {
  if (!text) return '';
  return String(text).toLowerCase()
    .replace(/[*:,?_\-()[\]\/"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Built-in Local Semantic Reasoning Arbiter
 * Executes semantic tree arbitration when Chrome Prompt API is downloading,
 * unavailable, or as an instant local validator.
 */
function localSemanticArbiter(fields, profile, options = {}) {
  const mappings = [];
  const minConfidence = options.minConfidence || 0.70;

  // Semantic definitions for prompt matching
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

  // Helper to pick best option from select/radio choices
  function pickBestOption(optionsList, targetValue) {
    if (!Array.isArray(optionsList) || optionsList.length === 0 || !targetValue) return null;
    const targetNorm = normalizeText(String(targetValue));
    const targetIsYes = ['yes', 'authorized', 'true'].includes(targetNorm);
    const targetIsNo = ['no', 'not authorized', 'false'].includes(targetNorm);

    // Pass 1: Exact match
    for (const opt of optionsList) {
      if (normalizeText(opt) === targetNorm) return opt;
    }

    // Pass 2: Semantic affirmative / negative match
    for (const opt of optionsList) {
      const optNorm = normalizeText(opt);
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
      const optNorm = normalizeText(opt);
      if (wordRegex.test(optNorm)) return opt;
    }

    return null;
  }

  // Helper to detect specific country named in text
  function detectTargetCountry(text) {
    if (!text) return null;
    const norm = ` ${normalizeText(text)} `;
    for (const [canon, aliases] of Object.entries(COUNTRY_ALIASES)) {
      for (const alias of aliases) {
        const regex = new RegExp(`(^|\\s)${alias.trim()}($|\\s)`, 'i');
        if (regex.test(norm)) return canon;
      }
    }
    return null;
  }

  for (const field of fields) {
    const fieldId = field.id;
    const label = normalizeText(field.label || '');
    const context = normalizeText(field.context || '');
    const placeholder = normalizeText(field.placeholder || '');
    const combinedText = `${label} ${context} ${placeholder}`.trim();
    const isTextarea = field.type === 'textarea' || field.isLongForm;

    // Skip blacklisted phone country codes (e.g. "Country Phone Code", "Dial Code")
    const isPhoneCountryCode =
      (combinedText.includes('country') && (combinedText.includes('code') || combinedText.includes('dial'))) ||
      combinedText.includes('countrycode') ||
      combinedText.includes('dial code') ||
      combinedText.includes('phone code') ||
      combinedText.includes('calling code');

    if (isPhoneCountryCode) {
      continue;
    }

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
        const targetCountry = detectTargetCountry(combinedText);
        const userCountries = `${profile.workAuthCountries || ''} ${profile.country || ''}`.toLowerCase();

        let isAuth = true;
        if (targetCountry) {
          const userHasCountry = userCountries.includes(targetCountry) ||
            (COUNTRY_ALIASES[targetCountry] && COUNTRY_ALIASES[targetCountry].some(a => userCountries.includes(a)));
          isAuth = userHasCountry;
        }

        if (isAuthQuestion) {
          const expectedVal = targetCountry ? (isAuth ? (profile.workAuth || 'Yes') : 'No') : (profile.workAuth || 'Yes');
          const selectedOption = pickBestOption(field.options, expectedVal);
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
          const selectedOption = pickBestOption(field.options, expectedVal);
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
                selectedOption = pickBestOption(field.options, userVal);
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
          const normLabel = normalizeText(cf.label || '');
          const normKey = normalizeText(cf.key || '');
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
          const normKey = normalizeText(profKey);
          const spacedKey = normalizeText(profKey.replace(/([A-Z])/g, ' $1'));
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

/**
 * Execute semantic field matching using On-Device Gemini Nano
 * with automatic fallback to Local Semantic Reasoning Arbiter.
 */
async function matchFieldsWithAi(fields, profile, options = {}) {
  const availableProfileEntries = Object.entries(profile)
    .filter(([key, val]) => key !== 'customFields' && val !== null && val !== undefined && String(val).trim().length > 0)
    .map(([key, val]) => {
      const snippet = String(val).length > 80 ? String(val).substring(0, 80) + '...' : String(val);
      return { key, sample: snippet };
    });

  if (Array.isArray(profile.customFields)) {
    profile.customFields.forEach(cf => {
      if (cf && cf.value && String(cf.value).trim().length > 0) {
        const snippet = String(cf.value).length > 80 ? String(cf.value).substring(0, 80) + '...' : String(cf.value);
        availableProfileEntries.push({
          key: cf.key || cf.label,
          label: cf.label,
          sample: snippet
        });
      }
    });
  }

  if (availableProfileEntries.length === 0) {
    return { mappings: [] };
  }

  // Distill input fields
  const compactFields = fields.map(f => ({
    id: f.id,
    type: f.type,
    label: f.label || '',
    context: f.context || '',
    placeholder: f.placeholder || '',
    options: f.options || []
  }));

  const lm = getLanguageModelApi();

  // Check if Prompt API is actively ready (not 'downloading' or 'unsupported')
  let isPromptApiReady = false;
  if (lm) {
    try {
      if (typeof lm.availability === 'function') {
        let avail = 'unknown';
        try {
          avail = await lm.availability();
        } catch (noArgsErr) {
          avail = await lm.availability({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }]
          });
        }
        isPromptApiReady = (avail === 'readily' || avail === 'available');
      } else if (typeof lm.capabilities === 'function') {
        const caps = await lm.capabilities();
        isPromptApiReady = (caps.available === 'readily' || caps.available === 'available');
      }
    } catch (availErr) {
      isPromptApiReady = false;
    }
  }

  // Try Prompt API (Gemini Nano) ONLY if readily available
  if (isPromptApiReady && typeof lm.create === 'function') {
    let session = null;
    try {
      console.log(`[Career Autofill AI] Invoking Gemini Nano Prompt API with ${compactFields.length} fields...`);
      const systemPrompt = `You are an expert AI form assistant for job applications.
Your task is to analyze ATS job application form fields (labels, context, placeholders, options) and match each field to the most appropriate user profile key.
CRITICAL RULES:
1. Carefully distinguish between different long-form textareas ('coverLetter' vs 'whyUs' vs 'projectHighlight' vs 'aboutMe').
2. Country-Specific Work Authorization & Visa Sponsorship:
   - Identify if the question names a specific country (e.g. United States, Canada, UK, India, Germany, etc.).
   - If the job country is in user's authorized countries, authorization is 'Yes' and sponsorship is 'No'.
   - If the job country is NOT in user's authorized countries, authorization is 'No' and sponsorship is 'Yes'.
3. For select or radio fields, identify the exact matching string from 'options'.
4. If no profile key is appropriate, omit the field.
5. Output MUST be strictly valid JSON matching: {"mappings": [{"fieldId": "...", "profileKey": "...", "selectedOption": "...", "confidence": 0.95}]}.`;

      // Strict 1200ms timeout on session creation to prevent service worker hanging
      const createPromise = (async () => {
        try {
          return await lm.create({
            systemPrompt: systemPrompt,
            temperature: 0.1,
            topK: 1
          });
        } catch (createErr1) {
          try {
            return await lm.create({
              initialPrompts: [{ role: 'system', content: systemPrompt }],
              temperature: 0.1,
              topK: 1
            });
          } catch (createErr2) {
            return await lm.create();
          }
        }
      })();

      session = await Promise.race([
        createPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Prompt API create timeout (1200ms)')), 1200))
      ]);

      if (session) {
        const userPrompt = `Form Fields to match:\n${JSON.stringify(compactFields, null, 2)}\n\nUser Profile Keys available:\n${JSON.stringify(availableProfileEntries, null, 2)}\n\nRespond with strictly valid JSON format.`;

        let rawOutput = '';
        try {
          const promptPromise = (async () => {
            try {
              return await session.prompt(userPrompt, {
                responseConstraint: {
                  type: "json-schema",
                  schema: {
                    type: "object",
                    properties: {
                      mappings: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            fieldId: { type: "string" },
                            profileKey: { type: "string" },
                            selectedOption: { type: "string" },
                            confidence: { type: "number" }
                          },
                          required: ["fieldId", "profileKey"]
                        }
                      }
                    },
                    required: ["mappings"]
                  }
                }
              });
            } catch (constraintErr) {
              return await session.prompt(userPrompt);
            }
          })();

          // Strict 1800ms timeout to guarantee background worker message port does not close/hang
          rawOutput = await Promise.race([
            promptPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Prompt API prompt timeout (1800ms)')), 1800))
          ]);
        } catch (promptCallErr) {
          console.warn('[Career Autofill AI] Prompt API prompt failed or timed out:', promptCallErr);
        }

        const parsed = extractJsonFromModelOutput(rawOutput);
        if (parsed.mappings && parsed.mappings.length > 0) {
          console.log(`[Career Autofill AI] Gemini Nano returned ${parsed.mappings.length} valid mappings`);
          return parsed;
        }
      }
    } catch (promptErr) {
      console.warn('[Career Autofill AI] Prompt API session failed, falling back to Local Semantic Arbiter:', promptErr);
    } finally {
      if (session && typeof session.destroy === 'function') {
        try { session.destroy(); } catch (e) {}
      }
    }
  }

  // Built-in Local Semantic Reasoning Arbiter execution
  console.log(`[Career Autofill AI] Running Local Semantic Arbiter for ${compactFields.length} fields (AI Enforced)`);
  const result = localSemanticArbiter(compactFields, profile, options);
  return result;
}

/**
 * Robust JSON extraction from model output:
 * handles markdown fences, preambles, trailing commas, raw arrays, and dictionary maps.
 */
function extractJsonFromModelOutput(rawOutput) {
  if (!rawOutput) return { mappings: [] };
  let str = String(rawOutput).trim();

  // Helper to safely strip trailing commas before closing braces/brackets
  function cleanJsonString(s) {
    return s.replace(/,\s*([\]}])/g, '$1').trim();
  }

  // Normalize parsed payload into standardized { mappings: [...] }
  function normalizeParsed(parsed) {
    if (!parsed) return { mappings: [] };
    if (Array.isArray(parsed)) {
      return { mappings: parsed };
    }
    if (typeof parsed === 'object') {
      if (Array.isArray(parsed.mappings)) {
        return parsed;
      }
      for (const key of ['results', 'fields', 'data', 'matches', 'items', 'output']) {
        if (Array.isArray(parsed[key])) {
          return { mappings: parsed[key] };
        }
      }
      // If it's a key-value dictionary { fieldId: profileKey } or inverted { profileKey: fieldId }
      const entries = Object.entries(parsed);
      if (entries.length > 0 && typeof entries[0][1] === 'string') {
        const mappings = entries.map(([k, v]) => {
          if (/^ca_field_\d+$/i.test(v)) {
            return { fieldId: v, profileKey: k, confidence: 0.95 };
          }
          return { fieldId: k, profileKey: v, confidence: 0.95 };
        });
        return { mappings };
      }
    }
    return { mappings: [] };
  }

  // 1. Direct parse attempt
  try {
    const direct = JSON.parse(cleanJsonString(str));
    const normalized = normalizeParsed(direct);
    if (normalized.mappings.length > 0) return normalized;
  } catch (e) {}

  // 2. Extract from markdown code blocks ```json ... ``` or ``` ... ```
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const fromBlock = JSON.parse(cleanJsonString(codeBlockMatch[1]));
      const normalized = normalizeParsed(fromBlock);
      if (normalized.mappings.length > 0) return normalized;
    } catch (e) {}
  }

  // 3. Extract outermost JSON object { ... }
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSubstring = str.substring(firstBrace, lastBrace + 1);
    try {
      const fromObj = JSON.parse(cleanJsonString(jsonSubstring));
      const normalized = normalizeParsed(fromObj);
      if (normalized.mappings.length > 0) return normalized;
    } catch (e) {}
  }

  // 4. Extract outermost JSON array [ ... ]
  const firstBracket = str.indexOf('[');
  const lastBracket = str.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const jsonSubstring = str.substring(firstBracket, lastBracket + 1);
    try {
      const fromArr = JSON.parse(cleanJsonString(jsonSubstring));
      const normalized = normalizeParsed(fromArr);
      if (normalized.mappings.length > 0) return normalized;
    } catch (e) {}
  }

  console.warn('[Career Autofill AI] Could not parse JSON from model output:', str);
  return { mappings: [] };
}

// Runtime message router
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getAiStatus') {
      (async () => {
        try {
          const status = await checkAiCapabilities();
          sendResponse({ success: true, status });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (message.action === 'aiMatchFields') {
      (async () => {
        try {
          const { fields, profile, options } = message;
          const result = await matchFieldsWithAi(fields, profile, options || {});
          sendResponse({ success: true, mappings: result.mappings || [] });
        } catch (err) {
          console.error('[Career Autofill AI] Match fields error:', err);
          sendResponse({ success: false, error: err.message, mappings: [] });
        }
      })();
      return true;
    }
  });
}

console.log('[Career Autofill] Background service worker ready with AI support');

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    checkAiCapabilities,
    matchFieldsWithAi,
    extractJsonFromModelOutput,
    getLanguageModelApi,
    localSemanticArbiter
  };
}
