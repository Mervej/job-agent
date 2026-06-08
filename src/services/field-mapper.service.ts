import { generateText } from './ai.service';
import { JobCrawler } from './job-crawler';
import { CoverLetterGenerator, UserProfile } from './cover-letter-generator';
import { getResumeById, getUserProfileFromResume, getStructuredResumeById } from './db';
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

// ─── Service ──────────────────────────────────────────────────────────────────

export class FieldMapperService {
  getFieldSemanticType(field: ExtensionField): string {
    const info = `${field.label || ''} ${field.placeholder || ''} ${field.fieldName} ${field.autocomplete || ''} ${field.questionText || ''}`.toLowerCase();

    if (field.inputType === 'email' || info.includes('email')) return 'email';
    if (field.inputType === 'tel' || info.includes('phone') || info.includes('mobile')) return 'phone';

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
    const mappings: FieldMapping[] = [];

    for (const field of fields) {
      let mappedData: string | undefined;
      let needsAI = false;
      let aiPrompt: string | undefined;

      const info = `${field.label || ''} ${field.placeholder || ''} ${field.fieldName} ${field.autocomplete || ''} ${field.questionText || ''}`.toLowerCase();
      const resumeContext = resumeText || '';
      const semanticType = this.getFieldSemanticType(field);

      switch (semanticType) {
        case 'email': mappedData = userProfile.email; break;
        case 'phone': mappedData = userProfile.phone || ''; break;
        case 'firstName': mappedData = userProfile.name.split(' ')[0]; break;
        case 'lastName': mappedData = userProfile.name.split(' ').slice(1).join(' '); break;
        case 'fullName': mappedData = userProfile.name; break;
        case 'linkedin': mappedData = userProfile.linkedin || ''; break;
        case 'github': mappedData = userProfile.github || ''; break;
        case 'portfolio': mappedData = userProfile.github || userProfile.linkedin || ''; break;
        case 'location': mappedData = userProfile.location || ''; break;
        case 'coverLetter': mappedData = coverLetter; break;
        case 'currentCTC': mappedData = userProfile.currentCTC || ''; break;
        case 'expectedCTC': mappedData = userProfile.expectedCTC || ''; break;
        case 'noticePeriod': mappedData = userProfile.noticePeriod || ''; break;
        case 'workAuthorization': mappedData = userProfile.workAuthorization || 'Yes'; break;
        case 'relocation': mappedData = userProfile.willingToRelocate || 'Yes'; break;
        case 'needsSponsorship': mappedData = 'No'; break;
        case 'previouslyEmployed': mappedData = 'No'; break;
        case 'conflictOfInterest': mappedData = 'No'; break;
        case 'ifYesFollowUp': mappedData = ''; break;
        case 'diversity': mappedData = ''; break;
        case 'resume': mappedData = undefined; needsAI = false; break;
        case 'summary': {
          let technicalContext = '';
          if (structuredResume) {
            if (structuredResume.experience?.length) {
              technicalContext += 'Experience:\n' + structuredResume.experience.map((e: any) =>
                `${e.role} at ${e.company} (${e.startDate} – ${e.endDate || 'Present'})${e.description ? ': ' + e.description : ''}${e.achievements?.length ? '\n- ' + e.achievements.join('\n- ') : ''}`
              ).join('\n\n') + '\n\n';
            }
            if (structuredResume.skills?.length) {
              technicalContext += 'Skills: ' + structuredResume.skills.join(', ') + '\n\n';
            }
          }
          const summaryContext = technicalContext.trim() || resumeContext;
          needsAI = true;
          aiPrompt = `Write a concise 2–3 sentence professional summary in first person, focused entirely on technical expertise, years of experience, and key skills. Do NOT include contact details, location, phone, or links. Base it only on the technical information below.\n\n${summaryContext}`;
          break;
        }
      }

      if (!mappedData && semanticType === 'other') {
        if (info.includes('why this role') || info.includes('why do you want')) {
          needsAI = true;
          aiPrompt = `You are helping a candidate answer an application question based on their resume.

Question:
${field.questionText || field.label || 'Explain why you are a good fit for this role.'}

Candidate resume:
${resumeContext}

Write a concise, 2–4 sentence answer in first person, specific and grounded in the resume.`;
        } else if (info.includes('years of experience') || info.includes('experience (years)')) {
          if (structuredResume?.experience?.length) {
            const earliest = structuredResume.experience[structuredResume.experience.length - 1];
            const match = (earliest.startDate || '').match(/\b(19|20)\d{2}\b/);
            if (match) {
              mappedData = String(new Date().getFullYear() - parseInt(match[0], 10));
            }
          }
          if (!mappedData) {
            needsAI = true;
            aiPrompt = `Estimate total years of professional experience from this resume. Return only a number:\n\n${resumeContext}`;
          }
        } else if (info.includes('skills')) {
          if (structuredResume?.skills?.length) {
            mappedData = structuredResume.skills.join(', ');
          } else if (userProfile.skills?.length) {
            mappedData = userProfile.skills.join(', ');
          } else {
            needsAI = true;
            aiPrompt = `Extract the candidate's key technical and professional skills as a comma-separated list:\n\n${resumeContext}`;
          }
        } else if (info.includes('current company') || info.includes('employer')) {
          mappedData = userProfile.currentCompany || (structuredResume as any)?.experience?.[0]?.company || '';
        } else if (info.includes('current title') || info.includes('role') || info.includes('position')) {
          mappedData = userProfile.currentRole || (structuredResume as any)?.experience?.[0]?.role || '';
        } else if ((field.questionText || '').includes('?')) {
          needsAI = true;
          aiPrompt = `You are the candidate filling out a job application.

Question:
${field.questionText}

Write a concise answer in first person, grounded ONLY in the resume below.

Resume:
${resumeContext}`;
        }
      }

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

    const resumeSystemPrompt = `Candidate resume:\n${resumeText}`;

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
          // Pass the full aiPrompt (which already contains options + resume) as the user message.
          // Use a lightweight system prompt to avoid duplicating the resume.
          answer = await generateText('You are filling a job application form.', mapping.aiPrompt!, maxTokens);
        } else {
          const prompt = mapping.aiPrompt!;
          const questionMatch = prompt.match(/Question:\s*([\s\S]+?)(?:\nResume:|\nCandidate resume:|$)/);
          const question =
            questionMatch?.[1].trim() ||
            mapping.field.questionText ||
            mapping.field.label ||
            mapping.field.placeholder ||
            mapping.field.fieldName;
          answer = await generateText(resumeSystemPrompt, question, maxTokens);
        }

        if (answer?.trim()) {
          if (hasOptions) {
            const matched = this.fuzzyMatchOption(answer.trim(), validOptions);
            // If no option matches, leave mappedData undefined so the panel flags it for manual input.
            if (matched) mapping.mappedData = matched;
          } else {
            mapping.mappedData = answer.trim();
          }
        }
      } catch {
        // leave mappedData undefined on AI failure — panel will flag for manual input
        void label;
      }
    }

    return mappings;
  }

  async mapFields(
    fields: ExtensionField[],
    resumeId: number,
    jobUrl: string
  ): Promise<MapFieldsResult> {
    const resume = getResumeById(resumeId) as any;
    if (!resume) throw new Error('Resume not found');

    const rawProfile = getUserProfileFromResume(resumeId) as any;
    const userProfile: UserProfile = {
      name: rawProfile?.name || '',
      email: rawProfile?.email || '',
      phone: rawProfile?.phone || '',
      location: rawProfile?.location || '',
      linkedin: rawProfile?.linkedin || '',
      github: rawProfile?.github || '',
      experience: rawProfile?.experience || '',
      skills: rawProfile?.skills || [],
      achievements: rawProfile?.achievements || [],
      expectedCTC: rawProfile?.expectedCTC || '',
      currentCTC: rawProfile?.currentCTC || '',
      noticePeriod: rawProfile?.noticePeriod || '',
      workAuthorization: rawProfile?.workAuthorization || '',
    };

    const structuredResume = getStructuredResumeById(resumeId);

    const jobCrawler = new JobCrawler();
    const coverLetterGenerator = new CoverLetterGenerator();
    let coverLetter = '';

    try {
      const jobDescription = await jobCrawler.crawlJobDescription(jobUrl);
      coverLetter = await coverLetterGenerator.generateCoverLetter(jobDescription, userProfile, resume.text);
    } finally {
      await jobCrawler.close();
    }

    const mappings = this.mapFieldsToData(fields, userProfile, coverLetter, resume.text, structuredResume);
    const resolved = await this.generateAnswersForAIFields(mappings, resume.text);

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
      resumeText: resume.text,
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

      if (entryType === 'experience') {
        if (info.match(/\btitle\b|position|job title/)) { value = entryData.role || ''; confidence = 1.0; }
        else if (info.match(/company|employer|organization|org\b/)) { value = entryData.company || ''; confidence = 1.0; }
        else if (info.match(/industry|sector|field of work/)) { value = ''; confidence = 0.0; } // leave blank — too ambiguous to guess
        else if (info.match(/current(ly)?.*work|still.*work|present.*position|ongoing|i currently/)) { isCheckbox = true; value = isCurrentJob ? 'true' : 'false'; confidence = 1.0; }
        else if (info.match(/start.*date|from.*date|begin.*date|\bstart\b.*mm|date.*start/)) { value = this.formatDate(entryData.startDate || ''); confidence = 1.0; }
        else if (info.match(/end.*date|to.*date|\bend\b.*mm|date.*end/)) { value = isCurrentJob ? '' : this.formatDate(entryData.endDate || ''); confidence = 1.0; }
        else if (info.match(/description|responsibilities|duties|detail|summary|about|what did you do/)) { value = [entryData.description, entryData.achievements].filter(Boolean).join('\n').trim(); confidence = 0.9; }
        else if (info.match(/location|city|country/)) { value = entryData.location || ''; confidence = 1.0; }
      } else if (entryType === 'education') {
        if (info.match(/school|university|college|institution|organization/)) { value = entryData.institution || ''; confidence = 1.0; }
        else if (info.match(/degree|qualification|level|award/)) { value = entryData.degree || ''; confidence = 1.0; }
        else if (info.match(/field|major|subject|study|discipline/)) { value = entryData.fieldOfStudy || ''; confidence = 1.0; }
        else if (info.match(/start.*date|\bstart\b.*mm/)) { value = this.formatDate(entryData.startDate || ''); confidence = 1.0; }
        else if (info.match(/end.*date|graduation|\bend\b.*mm/)) { value = this.formatDate(entryData.endDate || ''); confidence = 1.0; }
        else if (info.match(/grade|gpa|score|result/)) { value = entryData.grade || ''; confidence = 0.8; }
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
