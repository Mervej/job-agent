import { generateText } from './ai.service';
import { JobCrawler } from './job-crawler';
import { CoverLetterGenerator, UserProfile } from './cover-letter-generator';
import { supabase } from './supabase';
import { StructuredResume } from './resume';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ExtensionField {
  selector: string;
  elementType: 'input' | 'textarea' | 'select' | 'div';
  inputType?: string;
  isCombobox?: boolean;
  fieldName: string;
  placeholder?: string;
  label?: string;
  questionText?: string;
  autocomplete?: string;
  sectionHeading?: string;
  required: boolean;
  currentValue?: string;
  options?: { value: string; text: string }[];
}

export interface MappedField {
  selector: string;
  value: string;
  confidence: number;
}

export interface MapFieldsResult {
  mappings: MappedField[];
  coverLetter: string;
  resumeDownloadUrl: string;
  structuredResume: any | null;
  resumeText: string;
  profileName: string;
}

export interface EntryMappedField {
  selector: string;
  value: string;
  confidence: number;
  isCheckbox?: boolean; // true for "currently working here" type checkboxes
}

// ─── Internal types (mirrors ParsedField without Playwright Frame) ────────────

interface FieldMapping {
  field: ExtensionField;
  mappedData?: string;
  needsAI: boolean;
  aiPrompt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildOptionsPrompt(
  question: string,
  options: { value: string; text: string }[],
  resumeContext: string,
  currentValue?: string
): string {
  const optionList = options.map((o) => `- ${o.text}`).join('\n');
  const hint = currentValue
    ? `The candidate's preferred answer is roughly "${currentValue}", but it must match one of the options below exactly.`
    : `Choose the option that best fits the candidate's background.`;

  return `You are filling a job application form on behalf of the candidate.

Field: ${question}

${hint}

Available options (respond with ONLY the exact text of one option, nothing else):
${optionList}

Candidate resume:
${resumeContext}`;
}

// ─── AI prompt builder ────────────────────────────────────────────────────────

function buildAiFieldPrompt(question: string): string {
  const q = question.toLowerCase().replace(/[✱*]+$/, '').trim();

  let hint: string;

  // Explicit yes/no question (has ? and a question verb)
  if (question.includes('?') && /\b(do you|have you|are you|will you|can you|is your|did you|would you|are there)\b/i.test(question)) {
    hint = 'Respond with ONLY "Yes" or "No".';

  // Numeric score / grade / percentage
  } else if (/\b(cgpa|gpa|percentage|score|grade)\b/.test(q) || (/\b%\b/.test(q) && !question.includes('?'))) {
    hint = 'Respond with ONLY the value (e.g. "8.5 CGPA" or "76%"). No labels or extra text.';

  // Years of experience
  } else if (/\btotal.*year|\byears? of experience|\bexperience.*year/.test(q)) {
    hint = 'Respond with ONLY the number (e.g. "6" or "8.5+"). No labels or extra text.';

  // Date / year
  } else if (/\b(year|date|month|when)\b/.test(q) && !question.includes('?')) {
    hint = 'Respond with ONLY the date in MM/YYYY or YYYY format (e.g. "06/2019" or "2019").';

  // List request
  } else if (/\b(list|all|mention|companies|achievements|provide all)\b/i.test(question)) {
    hint = 'Format as a clean list, one item per line (e.g. "Company Name (MM/YYYY – MM/YYYY)").';

  // Short label with no question mark — single-value field (branch, degree, city, etc.)
  } else if (question.length < 50 && !question.includes('?')) {
    hint = 'Respond with ONLY the value, no labels or extra text.';

  // Narrative / descriptive
  } else {
    hint = 'Respond in first person, 1–3 sentences. Do not repeat the question or add a label.';
  }

  return `Fill in this job application field: "${question}"\n\n${hint}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FieldMapperService {
  getFieldSemanticType(field: ExtensionField): string {
    // Deliberately excludes questionText — on many ATSes questionText is the previous field's
    // label (picked up by DOM walking), which causes cascading wrong type matches.
    const info = `${field.label || ''} ${field.placeholder || ''} ${field.fieldName} ${field.autocomplete || ''}`.toLowerCase();

    // Long narrative/question labels should never be reduced to a simple field type —
    // they need AI to generate a proper answer (e.g. "List all companies with tenure").
    const labelText = (field.label || '').trim();
    const isNarrativeQuestion = labelText.length > 50 ||
      /\b(mention|list|describe|pls|please|explain|provide|along with|tell us|worked with)\b/i.test(labelText);

    if (field.inputType === 'email' || info.includes('email')) return 'email';
    if (field.inputType === 'tel' || info.includes('phone') || info.includes('mobile')) return 'phone';

    // URL inputs and personal-link labels → portfolio/github
    if (field.inputType === 'url' || info.includes('hyperlink') || info.includes('personal url') || info.includes('personal website')) return 'portfolio';

    // Education-specific fields (must come before generic 'experience' check below)
    if (info.match(/\b(institution|university|college|school)\b.*name|name.*\b(institution|university|college|school)\b|\binstitution\b|\buniversity\b|\bcollege\b|\bschool_name\b/)) return 'eduInstitution';
    if (info.match(/\bdegree\b/) && !info.match(/required|minimum|preferred|looking for|at least/)) return 'eduDegree';
    if (info.match(/field[\s_]of[\s_]study|area[\s_]of[\s_]study|\bmajor\b/)) return 'eduField';
    if (info.match(/\bgpa\b|\bgrade\b/) && !info.match(/salary|pay|compensat|experience/)) return 'eduGrade';

    // Experience/employer fields — guard against narrative question labels that happen to
    // contain the word "company" or "employer" (e.g. "List all companies with tenure")
    if (!isNarrativeQuestion && info.match(/\bemployer\b(?! id| number| identification)|employer name|\bcompany\b(?! website| profile| url)/)) return 'expCompany';
    if (!isNarrativeQuestion && info.match(/\bjob title\b|work title|\btitle\b/) && !info.match(/required|preferred|looking for/)) return 'expTitle';

    // "Currently working here" / "Currently pursuing" checkboxes
    if (info.match(/\bis_current\b|\bcurrently_working\b|\bcurrently_employed\b|\bcurrently_pursuing\b/)) return 'currentlyActive';

    // Use autocomplete attribute as the most reliable signal
    if (field.autocomplete === 'given-name' || field.autocomplete === 'first-name') return 'firstName';
    if (field.autocomplete === 'family-name' || field.autocomplete === 'last-name') return 'lastName';
    if (field.autocomplete === 'name') return 'fullName';

    if (
      info.includes('first name') || info.includes('firstname') ||
      info.includes('given name') || info.includes('first_name') ||
      info.includes('fname') || info.includes('forename')
    ) return 'firstName';
    if (
      info.includes('last name') || info.includes('lastname') ||
      info.includes('surname') || info.includes('family name') ||
      info.includes('last_name') || info.includes('lname')
    ) return 'lastName';
    if (
      info.includes('full name') ||
      info.includes('your name') ||
      (info.includes('name') &&
        !info.includes('company') &&
        !info.includes('school') &&
        !info.includes('institution') &&
        !info.includes('file') &&
        !info.includes('last') &&
        !info.includes('first') &&
        !info.includes('given') &&
        !info.includes('family') &&
        !info.includes('middle') &&
        !info.includes('preferred'))
    ) return 'fullName';
    if (info.includes('linkedin')) return 'linkedin';
    if (info.includes('github')) return 'github';
    if (info.includes('twitter') || info.includes('x.com')) return 'twitter';
    if (info.includes('portfolio') || info.includes('website')) return 'portfolio';
    if (info.includes('location') || info.includes('city') || info.includes('country')) return 'location';
    if (info.includes('resume') || info.includes('cv')) return 'resume';
    if (info.includes('cover letter') || info.includes('motivation letter')) return 'coverLetter';

    const sectionHeading = (field.sectionHeading || '').toLowerCase();
    const isJobSpecificSection =
      sectionHeading.includes('detail') ||
      sectionHeading.includes('question') ||
      sectionHeading.includes('additional') ||
      sectionHeading.includes('screening') ||
      sectionHeading.includes('experience') ||
      sectionHeading.includes('work') ||
      sectionHeading.includes('job') ||
      sectionHeading.includes('employment') ||
      sectionHeading.includes('education');
    const isProfileSection = !isJobSpecificSection;

    if (
      isProfileSection &&
      (info.includes('summary') ||
        info.includes('about you') ||
        info.includes('about yourself') ||
        info.includes('professional profile') ||
        info.includes('bio'))
    ) return 'summary';
    if (info.includes('experience') || info.includes('years') || info.includes('background')) return 'experience';
    if (info.includes('skills') || info.includes('technologies') || info.includes('stack')) return 'skills';
    if (info.includes('current ctc') || info.includes('current salary') || info.includes('current compensation') || info.includes('current annual')) return 'currentCTC';
    if (info.includes('expected ctc') || info.includes('expected salary') || info.includes('expected compensation') || info.includes('expected annual') || info.includes('salary expectation')) return 'expectedCTC';
    if (info.includes('notice period') || info.includes('notice')) return 'noticePeriod';
    // Conditional follow-up fields (e.g. "If yes, provide name...") — always leave blank
    if (
      /^if (yes|so)[,\s]/.test(info) ||
      info.startsWith('if yes') ||
      info.startsWith('if so,') ||
      info.includes('if yes, please') ||
      info.includes('if yes, provide') ||
      info.includes('if yes, list') ||
      info.includes('if applicable, please')
    ) return 'ifYesFollowUp';

    // Visa sponsorship needed — NO (must come before workAuthorization — sponsorship questions also contain "legally" + "work")
    if (
      (info.includes('require') && info.includes('sponsor')) ||
      (info.includes('need') && info.includes('sponsor')) ||
      info.includes('visa sponsorship') ||
      info.includes('sponsorship now') ||
      info.includes('sponsorship in the future') ||
      (info.includes('sponsor') && (info.includes('employ') || info.includes('visa') || info.includes('status')))
    ) return 'needsSponsorship';

    // Work eligibility — YES by default (narrowed to avoid catching sponsorship questions)
    if (
      info.includes('authorized to work') ||
      info.includes('legally authorized') ||
      info.includes('eligible to work') ||
      info.includes('right to work') ||
      info.includes('work permit') ||
      info.includes('work authorization') ||
      (info.includes('legally') && (info.includes('authorized') || info.includes('eligible') || info.includes('permitted')))
    ) return 'workAuthorization';

    // Willing to relocate — YES by default
    if (info.includes('relocat')) return 'relocation';

    // Previously employed at this company — NO by default
    if (
      (info.includes('previously') || info.includes('former') || info.includes('before') || info.includes('prior')) &&
      (info.includes('employ') || info.includes('work') || info.includes('this company') || info.includes('our company') || info.includes('here'))
    ) return 'previouslyEmployed';

    // Related to / knows / referred by an employee — NO by default
    if (
      info.includes('relative') ||
      info.includes('family member') ||
      info.includes('conflict of interest') ||
      (info.includes('refer') && info.includes('employee')) ||
      (info.includes('refer') && info.includes('current')) ||
      (info.includes('know') && info.includes('employee')) ||
      (info.includes('acquaint') && info.includes('employee')) ||
      (info.includes('associated') && (info.includes('employee') || info.includes('company'))) ||
      (info.includes('relationship') && info.includes('employee')) ||
      (info.includes('work') && info.includes('before') && info.includes('company'))
    ) return 'conflictOfInterest';

    // Diversity/EEO
    if (info.includes('gender') || info.includes('pronouns') || info.includes('ethnicity') || info.includes('race') || info.includes('disability') || info.includes('veteran')) return 'diversity';

    return 'other';
  }

  private mapFieldsToData(
    fields: ExtensionField[],
    userProfile: UserProfile,
    coverLetter: string,
    resumeText: string,
    structuredResume?: StructuredResume | null
  ): FieldMapping[] {
    // Semantic types that map directly to a profile field or a fixed default answer.
    // Everything NOT in this set goes to AI.
    const DIRECT_TYPES = new Set([
      'email', 'phone', 'firstName', 'lastName', 'fullName',
      'linkedin', 'github', 'twitter', 'portfolio',
      'location', 'skills',
      'currentCTC', 'expectedCTC', 'noticePeriod', 'workAuthorization',
      'needsSponsorship', 'relocation', 'previouslyEmployed', 'conflictOfInterest',
      'ifYesFollowUp', 'diversity',
      'resume', 'coverLetter',
    ]);

    const mappings: FieldMapping[] = [];

    for (const field of fields) {
      let mappedData: string | undefined;
      let needsAI = false;
      let aiPrompt: string | undefined;

      const resumeContext = resumeText || '';
      const semanticType = this.getFieldSemanticType(field);

      console.log(`[FieldMapper] field: "${field.label || field.fieldName}" | selector: ${field.selector} | semanticType: ${semanticType} | questionText: "${field.questionText || ''}"`);

      // ── Tier 1: direct profile lookups ────────────────────────────────────────
      switch (semanticType) {
        case 'email':             mappedData = userProfile.email; break;
        case 'phone':             mappedData = userProfile.phone || ''; break;
        case 'firstName':         mappedData = userProfile.name.split(' ')[0]; break;
        case 'lastName':          mappedData = userProfile.name.split(' ').slice(1).join(' '); break;
        case 'fullName':          mappedData = userProfile.name; break;
        case 'linkedin':          mappedData = userProfile.linkedin || ''; break;
        case 'github':            mappedData = userProfile.github || ''; break;
        case 'twitter':           mappedData = (userProfile as any).twitter || ''; break;
        case 'portfolio':         mappedData = userProfile.github || userProfile.linkedin || ''; break;
        case 'location':          mappedData = userProfile.location || ''; break;
        case 'skills':            mappedData = userProfile.skills?.join(', ') || ''; break;
        case 'currentCTC':        mappedData = userProfile.currentCTC || ''; break;
        case 'expectedCTC':       mappedData = userProfile.expectedCTC || ''; break;
        case 'noticePeriod':      mappedData = userProfile.noticePeriod || ''; break;
        case 'workAuthorization': mappedData = userProfile.workAuthorization || 'Yes'; break;
        case 'needsSponsorship':  mappedData = 'No'; break;
        case 'relocation':        mappedData = (userProfile as any).willingToRelocate || 'Yes'; break;
        case 'previouslyEmployed': mappedData = 'No'; break;
        case 'conflictOfInterest': mappedData = 'No'; break;
        case 'ifYesFollowUp':     mappedData = ''; break;
        case 'diversity':         mappedData = ''; break;
        case 'resume':            mappedData = undefined; needsAI = false; break;
        case 'coverLetter':       mappedData = coverLetter; break;
      }

      // ── Tier 2: AI for everything else ────────────────────────────────────────
      if (!DIRECT_TYPES.has(semanticType)) {
        const question = field.questionText || field.label || field.fieldName;
        needsAI = true;
        aiPrompt = buildAiFieldPrompt(question);
      }

      // ── Options handling: try to match mapped value; fall back to AI pick ─────
      const validOptions = (field.options || []).filter(
        (o) => o.text && o.text.trim() && !/^(-+|select\.?\.?\.?|choose\.?\.?\.?|please select)$/i.test(o.text.trim())
      );

      if (validOptions.length > 0) {
        const questionForFallback = field.questionText || field.label || field.fieldName;
        if (mappedData) {
          const v = mappedData.toLowerCase();
          const match = validOptions.find(
            (o) => o.text.toLowerCase() === v || o.text.toLowerCase().includes(v) || v.includes(o.text.toLowerCase())
          );
          if (match) {
            mappedData = match.text;
          } else {
            needsAI = true;
            aiPrompt = buildOptionsPrompt(questionForFallback, validOptions, resumeContext, mappedData);
            mappedData = undefined;
          }
        } else if (!needsAI) {
          needsAI = true;
          aiPrompt = buildOptionsPrompt(questionForFallback, validOptions, resumeContext);
        } else if (needsAI && aiPrompt) {
          const optionList = validOptions.map((o) => o.text).join(', ');
          aiPrompt += `\n\nAvailable options (respond with ONLY one of these, exactly as written): ${optionList}`;
        }
      }

      mappings.push({ field, mappedData, needsAI, aiPrompt });
    }

    return mappings;
  }

  private fuzzyMatchOption(
    answer: string,
    options: { value: string; text: string }[]
  ): string | null {
    const v = answer.toLowerCase().trim();
    const exact = options.find((o) => o.text.toLowerCase().trim() === v);
    if (exact) return exact.text;
    const contains = options.find((o) => {
      const ot = o.text.toLowerCase().trim();
      return ot.includes(v) || v.includes(ot);
    });
    return contains ? contains.text : null;
  }

  private async generateAnswersForAIFields(
    mappings: FieldMapping[],
    resumeText: string
  ): Promise<FieldMapping[]> {
    const aiMappings = mappings.filter((m) => m.needsAI && m.aiPrompt);
    if (aiMappings.length === 0) return mappings;

    // Resume in system prompt; each aiPrompt contains only the question + format hint.
    // Rules are explicit to work reliably with both small local models (qwen2.5:7b)
    // and larger cloud models (llama-3.3-70b on Groq, gpt-4o-mini).
    const resumeSystemPrompt = `You are filling out a job application on behalf of a candidate.
Use ONLY information from the resume below. Do not invent or assume details.
Output rules (must follow exactly):
- Output ONLY the field value — no labels, no "Answer:", no "Based on the resume:", no preamble
- Do not repeat or echo the question
- Do not explain your reasoning
- If the information is not in the resume, output an empty string

Resume:
${resumeText}`;

    for (const mapping of aiMappings) {
      const label = mapping.field.label || mapping.field.fieldName;
      const validOptions = (mapping.field.options || []).filter(
        (o) => o.text?.trim() && !/^(-+|select\.?\.?\.?|choose\.?\.?\.?|please select)$/i.test(o.text.trim())
      );
      const hasOptions = validOptions.length > 0;

      try {
        const semanticType = this.getFieldSemanticType(mapping.field);
        const maxTokens = semanticType === 'summary' ? 300 : 150;

        let answer: string;
        if (hasOptions) {
          console.log(`[FieldMapper] AI (options) | selector: ${mapping.field.selector} | label: ${label} | prompt:\n${mapping.aiPrompt}`);
          answer = await generateText('You are filling a job application form.', mapping.aiPrompt!, maxTokens);
        } else if (mapping.aiPrompt) {
          // Use the context-rich prompt crafted in mapFieldsToData — it already contains the
          // right question text, resume context, and field-specific instructions.
          console.log(`[FieldMapper] AI | selector: ${mapping.field.selector} | label: "${label}" | using aiPrompt`);
          answer = await generateText(resumeSystemPrompt, mapping.aiPrompt, maxTokens);
          console.log(`[FieldMapper] AI response for "${label}": "${answer?.trim()}"`);
        } else {
          // Fallback for fields that reached needsAI=true without an aiPrompt
          const fieldLabel = mapping.field.label || mapping.field.placeholder || mapping.field.fieldName;
          const finalPrompt = `Fill in this job application field: "${fieldLabel}". Respond with ONLY the value, nothing else.`;
          console.log(`[FieldMapper] AI (fallback) | selector: ${mapping.field.selector} | label: "${fieldLabel}"`);
          answer = await generateText(resumeSystemPrompt, finalPrompt, maxTokens);
          console.log(`[FieldMapper] AI response for "${fieldLabel}": "${answer?.trim()}"`);
        }

        if (answer?.trim()) {
          if (hasOptions) {
            const matched = this.fuzzyMatchOption(answer.trim(), validOptions);
            if (matched) mapping.mappedData = matched;
          } else {
            mapping.mappedData = answer.trim();
          }
        }
      } catch {
        void label;
      }
    }

    return mappings;
  }

  async mapFields(
    fields: ExtensionField[],
    resumeId: string,
    jobUrl: string,
    jobText?: string
  ): Promise<MapFieldsResult> {
    const { data: resume, error: resumeErr } = await supabase
      .from('resumes')
      .select('id, user_id, parsed_text')
      .eq('id', resumeId)
      .single();

    if (resumeErr || !resume) throw new Error('Resume not found');

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, phone, location, linkedin, github, skills, experience, education, expected_ctc, current_ctc, notice_period, work_authorization')
      .eq('id', resume.user_id)
      .single();

    const resumeText = resume.parsed_text || '';

    const userProfile: UserProfile = {
      name: profile?.full_name || '',
      email: profile?.email || '',
      phone: profile?.phone || '',
      location: profile?.location || '',
      linkedin: profile?.linkedin || '',
      github: profile?.github || '',
      experience: '',
      skills: Array.isArray(profile?.skills) ? profile.skills : [],
      achievements: [],
      expectedCTC: profile?.expected_ctc || '',
      currentCTC: profile?.current_ctc || '',
      noticePeriod: profile?.notice_period || '',
      workAuthorization: profile?.work_authorization || '',
    };

    const structuredResume: any = {
      profileDetails: {},
      experience: Array.isArray(profile?.experience) ? profile.experience : [],
      education: Array.isArray(profile?.education) ? profile.education : [],
      skills: Array.isArray(profile?.skills) ? profile.skills : [],
    };

    const coverLetterGenerator = new CoverLetterGenerator();
    let coverLetter = '';

    try {
      let jobDescription;
      if (jobText && jobText.trim().length > 100) {
        jobDescription = { title: '', company: '', description: jobText, url: jobUrl };
      } else {
        const jobCrawler = new JobCrawler();
        try {
          jobDescription = await jobCrawler.crawlJobDescription(jobUrl);
        } finally {
          await jobCrawler.close();
        }
      }
      coverLetter = await coverLetterGenerator.generateCoverLetter(jobDescription, userProfile, resumeText);
    } catch {
      // Cover letter generation failure is non-fatal — proceed without it
    }

    const mappings = this.mapFieldsToData(fields, userProfile, coverLetter, resumeText, structuredResume);
    const resolved = await this.generateAnswersForAIFields(mappings, resumeText);

    const result: MappedField[] = resolved.map((m) => ({
      selector: m.field.selector,
      value: m.mappedData || '',
      confidence: !m.mappedData ? 0.0 : m.needsAI ? 0.5 : 1.0,
    }));

    return {
      mappings: result,
      coverLetter,
      resumeDownloadUrl: `/resumes/${resumeId}/file`,
      structuredResume,
      resumeText,
      profileName: profile?.full_name || '',
    };
  }

  private formatDate(dateStr: string): string {
    if (!dateStr || dateStr === 'Present') return '';
    // Already MM/YYYY
    if (/^\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
    // M/YYYY → 0-pad
    if (/^\d{1}\/\d{4}$/.test(dateStr)) return '0' + dateStr;
    // YYYY-MM-DD or YYYY-MM
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})/);
    if (isoMatch) return `${isoMatch[2]}/${isoMatch[1]}`;
    // Mon YYYY or Month YYYY
    const monthMatch = dateStr.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (monthMatch) {
      const months: Record<string, string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
      const m = months[monthMatch[1].slice(0,3).toLowerCase()];
      return m ? `${m}/${monthMatch[2]}` : dateStr;
    }
    return dateStr;
  }

  mapEntryFields(
    fields: ExtensionField[],
    entryType: 'experience' | 'education' | 'project',
    entryData: Record<string, string>,
    resumeText: string,
    isCurrentJob = false
  ): EntryMappedField[] {
    return fields.map(field => {
      const info = `${field.label || ''} ${field.placeholder || ''} ${field.fieldName} ${field.questionText || ''}`.toLowerCase();
      let value = '';
      let confidence = 0.5;
      let isCheckbox = false;

      // Normalise field names — DB may use camelCase (startDate), snake_case (start_date),
      // or short forms (start/end/title/school) depending on how the resume was parsed.
      const expTitle   = entryData.role        || entryData.title       || entryData.designation  || entryData.jobTitle    || '';
      const expStart   = entryData.startDate   || entryData.start       || entryData.start_date   || '';
      const expEnd     = entryData.endDate     || entryData.end         || entryData.end_date     || '';
      const expDesc    = entryData.description || entryData.summary     || entryData.achievements || '';
      const eduSchool  = entryData.institution || entryData.school      || entryData.university   || entryData.college     || '';
      const eduDegree  = entryData.degree      || entryData.qualification || '';
      const eduField   = entryData.fieldOfStudy || entryData.field_of_study || entryData.major   || entryData.subject     || '';
      const eduStart   = entryData.startDate   || entryData.start       || entryData.start_year  || '';
      // "year" alone = graduation year → use for end date
      const eduEnd     = entryData.endDate     || entryData.end         || entryData.year         || entryData.graduation_year || '';

      if (entryType === 'experience') {
        if (info.match(/\btitle\b|\bposition\b|job title|designation/)) { value = expTitle; confidence = 1.0; }
        else if (info.match(/company|employer|organization|org\b/)) { value = entryData.company || ''; confidence = 1.0; }
        else if (info.match(/industry|sector|field of work/)) { value = ''; confidence = 0.0; }
        else if (info.match(/current(ly)?.*work|still.*work|present.*position|ongoing|i currently|\bis_current\b|\bcurrently_pursuing\b/)) { isCheckbox = true; value = isCurrentJob ? 'true' : 'false'; confidence = 1.0; }
        else if (info.match(/start.*date|from.*date|begin.*date|\bstart\b.*mm|date.*start/)) { value = this.formatDate(expStart); confidence = 1.0; }
        else if (info.match(/end.*date|to.*date|\bend\b.*mm|date.*end/)) { value = isCurrentJob ? '' : this.formatDate(expEnd); confidence = 1.0; }
        else if (info.match(/description|responsibilities|duties|detail|summary|about|what did you do/)) { value = expDesc; confidence = 0.9; }
        else if (info.match(/location|city|country/)) { value = entryData.location || ''; confidence = 1.0; }
      } else if (entryType === 'education') {
        if (info.match(/\bis_current\b|\bcurrently_pursuing\b/)) { isCheckbox = true; value = isCurrentJob ? 'true' : 'false'; confidence = 1.0; }
        else if (info.match(/school|university|college|institution|organization/)) { value = eduSchool; confidence = 1.0; }
        // \bqualification\b so "qualifications_attributes" in the fieldName doesn't false-match every field
        else if (info.match(/\bdegree\b|\bqualification\b|level|award/)) { value = eduDegree; confidence = 1.0; }
        else if (info.match(/field[\s_]of[\s_]study|field_of_study|major|subject|\bstudy\b|discipline/)) { value = eduField; confidence = 1.0; }
        else if (info.match(/start.*date|\bstart\b.*mm/)) { value = this.formatDate(eduStart); confidence = 1.0; }
        else if (info.match(/end.*date|graduation|\bend\b.*mm/)) { value = isCurrentJob ? '' : this.formatDate(eduEnd); confidence = 1.0; }
        else if (info.match(/grade|gpa|score|result/)) { value = entryData.grade || entryData.gpa || ''; confidence = 0.8; }
        else if (info.match(/description|detail|about/)) { value = entryData.description || ''; confidence = 0.8; }
      } else if (entryType === 'project') {
        if (info.match(/name|title|project name/)) { value = entryData.name || ''; confidence = 1.0; }
        else if (info.match(/description|detail|about|summary/)) { value = entryData.description || ''; confidence = 0.9; }
        else if (info.match(/url|link|website/)) { value = entryData.url || ''; confidence = 1.0; }
        else if (info.match(/start.*date|\bstart\b/)) { value = this.formatDate(entryData.startDate || ''); confidence = 1.0; }
        else if (info.match(/end.*date|\bend\b/)) { value = this.formatDate(entryData.endDate || ''); confidence = 1.0; }
        else if (info.match(/tech|stack|language|tools|built with/)) { value = entryData.technologies || ''; confidence = 0.9; }
      }

      return { selector: field.selector, value, confidence, isCheckbox: isCheckbox || undefined };
    });
  }
}
