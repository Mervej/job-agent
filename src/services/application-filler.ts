import { chromium, Browser, Page, Frame } from 'playwright';
import { UserProfile } from './cover-letter-generator';
import { generateText } from './ai.service';

export interface ApplicationResult {
  success: boolean;
  error?: string;
  screenshot?: Buffer;
  submittedAt?: Date;
}

export interface ParsedFieldOption {
  value: string;
  text: string;
}

export interface ParsedField {
  selector: string;
  elementType: 'input' | 'textarea' | 'select';
  inputType?: string; // for inputs: text, email, tel, url, checkbox, radio, date, etc.
  fieldName: string;
  placeholder?: string;
  label?: string;
  autocomplete?: string;
  required: boolean;
  currentValue?: string;
  options?: ParsedFieldOption[]; // for selects and radios
  frame?: Frame; // Frame reference if field is inside an iframe
}

export interface FieldMapping {
  field: ParsedField;
  mappedData?: string;
  needsAI: boolean;
  aiPrompt?: string;
}

export class ApplicationFiller {
  private browser: Browser | null = null;

  async init() {
    this.browser = await chromium.launch({
      headless: false, // Set to false so user can see and verify the form
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.processMultipleApplications(
      [
        {
          jobUrl:
            'https://apply.workable.com/innovaccer-analytics/j/A35FEDD669/?utm_campaign=8cb0e1f428&utm_medium=eps&utm_source=link',
          coverLetter:
            "Dear Hiring Manager,\n\nI'm thrilled to apply for the Senior Product Manager position at Innovaccer, where I can leverage my technical expertise and passion for driving innovative solutions in healthcare. With over 8 years of experience in backend development and system design across various domains, including healthcare, fintech, and entertainment, I'm confident that my skills align with the key requirements of this role.\n\nAs a seasoned product management professional, I've had the privilege of working on complex projects, from migrating monoliths to microservices architectures to developing scalable backend systems for healthcare marketing automation. My expertise in building high-performance, event-driven microservices has allowed me to drive initiatives from concept to delivery, ensuring seamless communication across teams.\n\nI'm particularly drawn to Innovaccer's mission to revolutionize healthcare by activating the flow of data and empowering providers, payers, and government organizations. As someone who has worked extensively with healthcare marketing automation, I understand the importance of aligning product vision, goals, and supporting business metrics to achieve success indicators. My experience in defining projects, understanding customer requirements, writing detailed functional and test specifications, and coordinating efforts to scope, schedule, and deploy new features sets me well for this role.\n\nI'm impressed by Innovaccer's commitment to driving intelligent and connected experiences that advance health outcomes. I believe my technical background in Node.js (NestJS, Express), Golang, MySQL, PostgreSQL, MongoDB, Elasticsearch, Redis, AWS, Azure, Kafka, CI/CD Automation, Microservices Architecture, and Event-driven Systems will enable me to effectively work with the engineering team to drive product development.\n\nAs a strong communicator, I've had success in driving large-scale projects cross-functionally with designers, software development engineers, other product managers, and external partners. My experience in defining and conducting market research, gathering information from multiple sources, developing insights, and translating findings into action will allow me to effectively gather requirements from internal and external stakeholders.\n\nI'm excited about the opportunity to join a dynamic team of skilled individuals who transform ideas into real-life solutions. I believe my unique blend of technical expertise, product management skills, and passion for innovation make me an ideal candidate for this role. I look forward to discussing how my experience and skills align with the key requirements of this position.\n\nThank you for considering my application. I've attached my resume for your review.\n\nSincerely,\nMervej Raj",
          resumePath:
            '/Users/mervej.raj/Documents/Projects/Personal/job-agent/src/data/resumes/1.pdf',
          applyLink: 'https://apply.workable.com/innovaccer-analytics/j/A35FEDD669/apply/',
          resumeText:
            '\n\nMervej Raj\n«\nGitlab|\nï\nLinkedIn|\n#\nmervejraj@gmail.com|\nH\n+91 97645 77845\nSummary\nSenior Software Engineer with 8+ years of experience in backend development,  system design,  and scalable\narchitectures.   Expert  in  building  high-performance,  event-driven  microservices  and  leading  cross-functional\nteams.  Strong advocate for automation, DevOps integration, and clean, maintainable code.\nWork Experience\nInnovaccer, Noida — Software EngineerSep 2025 – Present\n–  Builtscalable backend systemsfor  the  Cured  team  to  orchestratemulti-channel healthcare mar-\nketing campaigns,  implementingaudience segmentation,template management,  andreal-time\nanalytics APIsthat enable automated outreach viaSMS, email, and IVRacross multiple clients.\nBajaj Finserv Health, Pune — Principal Software EngineerMar 2023 – Sep 2025\n–  Migratedmonolith to microservicesandmonorepo architecturewithKafkaandAzure Service\nBus— reducing deployment time by30%, improving scalability by20%, cutting downtime by12%, and\nincreasing throughput by15%.\n–  Createdend-to-end payment reconciliation systemachieving100% transaction tracking accuracy\nand50% faster reconciliation.  Improved payment success to95%and payout success to99%.\n–  Led engineering team, mentoring onarchitecture, delivery, andcross-functional collaboration.\nBookMyShow, Mumbai — Software Development Engineer IIJul 2021 – Mar 2023\n–  DeliveredBMS Play Credit CardwithRBL Bank,RBI mandate card tokenisation,  andAPI\nintegrationswith SBI and RBL for bank offers, boosting engagement by25%.\n–  Builtbackend and CMSfor BMS offers withAPI governanceinNode.jsandGolang— improving\nefficiency  by20%,  accelerating  rollouts  by15%,  enhancing  reliability  by30%,  and  reducing  latency  by\n20%.\nTerribly Tiny Tales, Mumbai — Senior Software EngineerApr 2019 – Jul 2021\n–  Developedbackend applicationswithNode.js, MySQL, Redis,  andElasticsearch,  and  designed\nsubscription-based payment systemusingRazorpaywith recurring billing — improving performance\nby25%.\nLivelike, Gurugram — Software DeveloperJun 2017 – Mar 2019\n–  Developed  and  integratedvirtual reality apps,  enhancing  immersive  experience  offerings  for  multiple\nclients.\nPersonal Projects\nPixel Streaming Demo\nBuilt a WebRTC-based product enabling instant interactivity with 3D apps off-device using Node.js, MySQL,\nReact & AWS. Achieved near-zero download time and low latency, with autoscaling to handle real-time traffic\nsurges.\nEducation\n2013 – 2017    B.Tech, National Institute of Technology, Nagpur\n2010 – 2012    12th, Cotton College, Assam\nSkills & Highlights\nProgrammingNode.js (NestJS, Express) — 6+ yrs; Golang — 4+ yrs\nDatabasesMySQL, PostgreSQL, MongoDB, Elasticsearch, Redis, Aerospike\nFrameworks / ToolsPub-sub, Queues, Mailing, Notifications, Payment Gateways (PayU, Razorpay etc)\nAI & AutomationAI Tools (GitHub Copilot, Cursor, Windsurf), MCP Servers (Postgres, Azure ,AWS,\nGitlab, Context7 etc)\nDevOps / CloudAWS (EC2, ECS, S3), Azure (Pipelines, AKS, Blob Storage), CI/CD Design, Build\nAutomation',
        },
        {
          jobUrl:
            'https://stripe.com/jobs/listing/software-engineer-operations-platform/7108247?gh_src=73vnei',
          coverLetter:
            "Dear Hiring Manager, \n\nI am writing to express my interest in the Software Engineer position at Stripe. As a professional career coach and cover letter expert, I have reviewed the job description and your resume, Mervej Raj, and I am impressed with your experience and skills. Your background in building scalable backend systems for various industries aligns perfectly with Stripe's mission to increase the global economy's GDP.\n\nI was particularly drawn to your experience in microservices architecture, as it demonstrates your ability to design and deliver high-performance systems. Your success in reducing deployment time by 30% and improving scalability by 20% is impressive, and I believe you could make a significant impact at Stripe.\n\nYour passion for automation, DevOps integration, and clean, maintainable code also resonated with me. As a platform that relies on secure and reliable systems, Stripe must prioritize these values in its engineering practices. Your experience leading engineering teams and mentoring developers on architecture and delivery best practices suggests that you could thrive in a collaborative and supportive work environment like Stripe's.\n\nIn addition to your technical skills, I appreciate your ability to communicate complex ideas clearly and effectively. Your writing style is engaging, professional, and tailored to the specific role and company, which is essential for making a strong first impression at Stripe.\n\nBased on my analysis of your resume and cover letter, I believe you have the skills, experience, and passion necessary to excel as a Software Engineer at Stripe. I highly recommend you for this position and look forward to seeing how you will contribute to the company's mission.\n\nSincerely,\n[Your Name]",
          resumePath:
            '/Users/mervej.raj/Documents/Projects/Personal/job-agent/src/data/resumes/1.pdf',
          applyLink:
            'https://stripe.com/jobs/listing/software-engineer-operations-platform/7108247/apply?gh_src=73vnei',
          resumeText:
            '\n\nMervej Raj\n«\nGitlab|\nï\nLinkedIn|\n#\nmervejraj@gmail.com|\nH\n+91 97645 77845\nSummary\nSenior Software Engineer with 8+ years of experience in backend development,  system design,  and scalable\narchitectures.   Expert  in  building  high-performance,  event-driven  microservices  and  leading  cross-functional\nteams.  Strong advocate for automation, DevOps integration, and clean, maintainable code.\nWork Experience\nInnovaccer, Noida — Software EngineerSep 2025 – Present\n–  Builtscalable backend systemsfor  the  Cured  team  to  orchestratemulti-channel healthcare mar-\nketing campaigns,  implementingaudience segmentation,template management,  andreal-time\nanalytics APIsthat enable automated outreach viaSMS, email, and IVRacross multiple clients.\nBajaj Finserv Health, Pune — Principal Software EngineerMar 2023 – Sep 2025\n–  Migratedmonolith to microservicesandmonorepo architecturewithKafkaandAzure Service\nBus— reducing deployment time by30%, improving scalability by20%, cutting downtime by12%, and\nincreasing throughput by15%.\n–  Createdend-to-end payment reconciliation systemachieving100% transaction tracking accuracy\nand50% faster reconciliation.  Improved payment success to95%and payout success to99%.\n–  Led engineering team, mentoring onarchitecture, delivery, andcross-functional collaboration.\nBookMyShow, Mumbai — Software Development Engineer IIJul 2021 – Mar 2023\n–  DeliveredBMS Play Credit CardwithRBL Bank,RBI mandate card tokenisation,  andAPI\nintegrationswith SBI and RBL for bank offers, boosting engagement by25%.\n–  Builtbackend and CMSfor BMS offers withAPI governanceinNode.jsandGolang— improving\nefficiency  by20%,  accelerating  rollouts  by15%,  enhancing  reliability  by30%,  and  reducing  latency  by\n20%.\nTerribly Tiny Tales, Mumbai — Senior Software EngineerApr 2019 – Jul 2021\n–  Developedbackend applicationswithNode.js, MySQL, Redis,  andElasticsearch,  and  designed\nsubscription-based payment systemusingRazorpaywith recurring billing — improving performance\nby25%.\nLivelike, Gurugram — Software DeveloperJun 2017 – Mar 2019\n–  Developed  and  integratedvirtual reality apps,  enhancing  immersive  experience  offerings  for  multiple\nclients.\nPersonal Projects\nPixel Streaming Demo\nBuilt a WebRTC-based product enabling instant interactivity with 3D apps off-device using Node.js, MySQL,\nReact & AWS. Achieved near-zero download time and low latency, with autoscaling to handle real-time traffic\nsurges.\nEducation\n2013 – 2017    B.Tech, National Institute of Technology, Nagpur\n2010 – 2012    12th, Cotton College, Assam\nSkills & Highlights\nProgrammingNode.js (NestJS, Express) — 6+ yrs; Golang — 4+ yrs\nDatabasesMySQL, PostgreSQL, MongoDB, Elasticsearch, Redis, Aerospike\nFrameworks / ToolsPub-sub, Queues, Mailing, Notifications, Payment Gateways (PayU, Razorpay etc)\nAI & AutomationAI Tools (GitHub Copilot, Cursor, Windsurf), MCP Servers (Postgres, Azure ,AWS,\nGitlab, Context7 etc)\nDevOps / CloudAWS (EC2, ECS, S3), Azure (Pipelines, AKS, Blob Storage), CI/CD Design, Build\nAutomation',
        },
      ],
      {
        name: 'Mervej Raj',
        email: 'mervejraj@gmail.com',
        phone: '+91 97645 77845',
        location: 'Pune, India',
        linkedin: 'https://www.linkedin.com/in/mervejraj/',
        github: 'https://gitlab.com/users/Mervej',
        experience:
          '8+ years of backend and system design experience across healthcare, fintech, and entertainment domains.',
        skills: [
          'Node.js (NestJS, Express)',
          'Golang',
          'MySQL',
          'PostgreSQL',
          'MongoDB',
          'Elasticsearch',
          'Redis',
          'AWS',
          'Azure',
          'Kafka',
          'CI/CD Automation',
          'Microservices Architecture',
          'Event-driven Systems',
        ],
        achievements: [
          'Migrated monolith to microservices architecture reducing deployment time by 30% and increasing scalability by 20%',
          'Built scalable backend systems for healthcare marketing automation',
          'Developed full payment reconciliation system achieving 100% transaction tracking accuracy',
          'Delivered BMS Play Credit Card integration boosting engagement by 25%',
          'Led engineering teams and mentored developers on architecture and delivery best practices',
        ],
      }
    );
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Parse all form fields on the current page, including inside iframes
   */
  private async parseFormFields(page: Page): Promise<ParsedField[]> {
    const allFields: ParsedField[] = [];

    // Recursively parse fields from all contexts (main page and all iframes)
    await this.parseFieldsFromContext(page, allFields, 'main');

    console.log(`[DEV] Total fields found across all contexts: ${allFields.length}`);
    return allFields;
  }

  /**
   * Recursively parse form fields from a given context (page or frame)
   */
  private async parseFieldsFromContext(
    context: Page | Frame,
    allFields: ParsedField[],
    contextName: string,
    frame?: Frame,
    visitedFrames: Set<string> = new Set()
  ): Promise<void> {
    try {
      console.log(`[DEV] Parsing form fields in ${contextName}...`);

      const contextFields = await context.evaluate(() => {
        const fields: ParsedField[] = [];

        // Supported form element selectors
        const formElements = document.querySelectorAll(
          [
            // text-like inputs
            'input[type="text"]',
            'input[type="email"]',
            'input[type="tel"]',
            'input[type="url"]',
            'input[type="number"]',
            'input[type="date"]',
            'input[type="datetime-local"]',
            'input[type="search"]',
            'input:not([type])',
            'input[type=""]',
            // rich text
            'textarea',
            // selects
            'select',
            // booleans
            'input[type="checkbox"]',
            'input[type="radio"]',
          ].join(', ')
        );

        const makeUniqueSelector = (el: Element): string => {
          const tag = el.tagName.toLowerCase();
          const id = (el as HTMLElement).id;
          const name = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).name;
          const type = (el as HTMLInputElement).type;
          const placeholder = (el as HTMLInputElement | HTMLTextAreaElement).placeholder;

          let sel = tag;
          if (type && tag === 'input') sel += `[type="${type}"]`;
          if (name) sel += `[name="${name}"]`;
          if (id) sel += `[id="${id}"]`;
          if (!name && !id && placeholder) sel += `[placeholder="${placeholder}"]`;

          if (sel === tag) {
            // fallback to nth-of-type within parent
            const parent = el.parentElement;
            if (parent) {
              const siblings = Array.from(parent.querySelectorAll(tag));
              const idx = siblings.indexOf(el);
              if (idx >= 0) sel += `:nth-of-type(${idx + 1})`;
            }
          }
          return sel;
        };

        const getLabelFor = (input: Element): string => {
          // explicit for="id"
          const id = (input as HTMLInputElement).id;
          if (id) {
            const forLabel = document.querySelector(`label[for="${id}"]`);
            if (forLabel) return forLabel.textContent?.trim() || '';
          }
          // wrapping label
          const parentLabel = input.closest('label');
          if (parentLabel) return parentLabel.textContent?.trim() || '';
          // previous sibling label in same group
          const group = input.closest('.form-group, .field, .form-row, .row, div');
          if (group) {
            const maybeLabel = group.querySelector('label');
            if (maybeLabel) return maybeLabel.textContent?.trim() || '';
          }
          return '';
        };

        formElements.forEach((element, index) => {
          const tagName = element.tagName.toLowerCase();
          const inputEl = element as HTMLInputElement;
          const textAreaEl = element as HTMLTextAreaElement;
          const selectEl = element as HTMLSelectElement;

          const type = tagName === 'input' ? inputEl.type || 'text' : tagName;

          // Skip hidden, submit, button inputs (but keep file inputs for resume/cover letter)
          if (
            (tagName === 'input' &&
              (type === 'hidden' || type === 'submit' || type === 'button')) ||
            (inputEl as any).style?.display === 'none' ||
            element.getAttribute('aria-hidden') === 'true'
          ) {
            return;
          }

          // For file inputs, include them (they'll be handled specially for resume/cover letter)
          // Don't skip file inputs - they need to be parsed and handled

          const required = !!(
            (tagName === 'input' && inputEl.required) ||
            (tagName === 'textarea' && textAreaEl.required) ||
            (tagName === 'select' && selectEl.required) ||
            element.getAttribute('aria-required') === 'true'
          );

          const placeholder =
            tagName === 'select' ? '' : inputEl.placeholder || textAreaEl.placeholder || '';
          const name = (inputEl.name || textAreaEl.name || selectEl.name || '').trim();
          const id = (inputEl.id || textAreaEl.id || selectEl.id || '').trim();
          const autocomplete = (inputEl.autocomplete || textAreaEl.autocomplete || '').trim();
          const label = getLabelFor(element);

          const parsed: ParsedField = {
            selector: makeUniqueSelector(element),
            elementType: tagName as ParsedField['elementType'],
            inputType: tagName === 'input' ? type : undefined,
            fieldName: name || id || `field_${index}`,
            placeholder: placeholder || undefined,
            label: label || undefined,
            autocomplete: autocomplete || undefined,
            required,
            currentValue:
              tagName === 'select'
                ? selectEl.value || undefined
                : inputEl.value || textAreaEl.value || undefined,
          };

          if (tagName === 'select') {
            parsed.options = Array.from(selectEl.options).map((opt) => ({
              value: opt.value,
              text: (opt.textContent || '').trim(),
            }));
          }

          if (type === 'radio') {
            // collect radio options by same name
            const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
            parsed.options = Array.from(radios).map((r) => ({
              value: (r as HTMLInputElement).value,
              text: getLabelFor(r) || r.getAttribute('value') || '',
            }));
          }

          fields.push(parsed);
        });

        return fields;
      });

      // Mark fields with their context information
      contextFields.forEach((field) => {
        field.frame = frame;
      });

      allFields.push(...contextFields);
      console.log(`[DEV] Found ${contextFields.length} fields in ${contextName}`);

      // Recursively check iframes within this context
      const iframes = await context.$$('iframe');
      for (let i = 0; i < iframes.length; i++) {
        try {
          const childFrame = await iframes[i].contentFrame();
          if (childFrame) {
            const frameUrl = childFrame.url();
            // Avoid infinite loops by tracking visited frames
            if (!visitedFrames.has(frameUrl)) {
              visitedFrames.add(frameUrl);
              const iframeContextName = `${contextName}.iframe[${i}]`;
              await this.parseFieldsFromContext(
                childFrame,
                allFields,
                iframeContextName,
                childFrame,
                visitedFrames
              );
            }
          }
        } catch (error) {
          console.log(`[DEV] Error checking iframe in ${contextName}:`, error);
        }
      }
    } catch (error) {
      console.log(`[DEV] Error parsing fields in ${contextName}:`, error);
    }
  }

  /**
   * Map parsed fields to user data, using AI for missing information
   */
  private async mapFieldsToData(
    fields: ParsedField[],
    userProfile: UserProfile,
    coverLetter: string,
    resumeText: string
  ): Promise<FieldMapping[]> {
    const mappings: FieldMapping[] = [];

    for (const field of fields) {
      let mappedData: string | undefined;
      let needsAI = false;
      let aiPrompt: string | undefined;

      const info = `${field.label || ''} ${field.placeholder || ''} ${field.fieldName} ${
        field.autocomplete || ''
      } ${field.inputType || ''}`
        .toLowerCase()
        .trim();

      // Strong signals via autocomplete
      switch (field.autocomplete) {
        case 'given-name':
          mappedData = userProfile.name.split(' ')[0];
          break;
        case 'family-name':
          mappedData = userProfile.name.split(' ').slice(1).join(' ');
          break;
        case 'email':
          mappedData = userProfile.email;
          break;
        case 'tel':
          mappedData = userProfile.phone || '';
          break;
        case 'url':
          mappedData = userProfile.github || userProfile.linkedin || '';
          break;
      }

      if (!mappedData) {
        // Direct mappings from user profile
        if (info.includes('first') && info.includes('name')) {
          mappedData = userProfile.name.split(' ')[0];
        } else if (info.includes('last') && info.includes('name')) {
          mappedData = userProfile.name.split(' ').slice(1).join(' ');
        } else if (info.includes('email') || field.inputType === 'email') {
          mappedData = userProfile.email;
        } else if (info.includes('phone') || field.inputType === 'tel') {
          mappedData = userProfile.phone || '';
        } else if (info.includes('linkedin')) {
          mappedData = userProfile.linkedin || '';
        } else if (info.includes('github')) {
          mappedData = userProfile.github || '';
        } else if (
          info.includes('website') ||
          info.includes('portfolio') ||
          field.inputType === 'url'
        ) {
          mappedData = userProfile.github || userProfile.linkedin || '';
        } else if (info.includes('cover') && info.includes('letter')) {
          mappedData = coverLetter;
        } else if (info.includes('authorized') || info.includes('legally')) {
          // Default to Yes if authorization question
          mappedData = 'yes';
        } else if (info.includes('hear') && info.includes('about')) {
          // How did you hear -> choose LinkedIn if present
          mappedData = userProfile.linkedin ? 'LinkedIn' : '';
        }
      }

      // AI targets
      if (!mappedData) {
        if (info.includes('experience') || info.includes('years')) {
          needsAI = true;
          aiPrompt = `Extract total years of professional experience as a number (e.g., 5) from this resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (info.includes('salary') || info.includes('compensation')) {
          needsAI = true;
          aiPrompt = `Extract expected salary or suggest a reasonable range based on experience. Respond briefly. Resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (info.includes('location') || info.includes('city')) {
          needsAI = true;
          aiPrompt = `Extract current location/city from resume. Respond as "City, Country" if possible. Resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (
          info.includes('why') ||
          info.includes('motivation') ||
          info.includes('interest')
        ) {
          needsAI = true;
          aiPrompt = `In 2-3 sentences, explain why this candidate is a great fit for this role, based on resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (info.includes('skills') || info.includes('technologies')) {
          needsAI = true;
          aiPrompt = `List 8-12 key technical skills from the resume, comma-separated: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else if (
          info.includes('availability') ||
          info.includes('start') ||
          info.includes('notice')
        ) {
          needsAI = true;
          aiPrompt = `Suggest a realistic start date (e.g., "Within 2 weeks") based on resume context: "${resumeText.slice(
            0,
            2000
          )}..."`;
        } else {
          needsAI = true;
          aiPrompt = `Given this field description "${info}", provide a concise, professional value based on the resume: "${resumeText.slice(
            0,
            2000
          )}..."`;
        }
      }

      mappings.push({ field, mappedData, needsAI, aiPrompt });
    }

    // Process AI mappings with timeout to prevent hanging
    for (const mapping of mappings) {
      if (mapping.needsAI && !mapping.mappedData && mapping.aiPrompt) {
        try {
          console.log(
            `[DEV] Using AI for field: ${mapping.field.fieldName} - ${
              mapping.field.label || mapping.field.placeholder
            }`
          );

          // Add timeout to prevent hanging
          const aiPromise = generateText(
            'You are an assistant helping fill out job application forms.',
            mapping.aiPrompt
          );

          const timeoutPromise = new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error('AI call timeout')), 10000); // 10 second timeout
          });

          let aiResponse: string;
          try {
            aiResponse = await Promise.race([aiPromise, timeoutPromise]);
          } catch (timeoutError) {
            console.log(
              `[DEV] AI call timed out for field ${mapping.field.fieldName}, using fallback`
            );
            aiResponse = '';
          }

          // Transform AI response to match field type
          mapping.mappedData = this.transformValueForFieldType(aiResponse, mapping.field);
          console.log(
            `[DEV] AI generated: "${aiResponse}" -> transformed to: "${mapping.mappedData}"`
          );
        } catch (error) {
          console.log(
            `[DEV] AI generation failed for field ${mapping.field.fieldName}:`,
            error as any
          );
          mapping.mappedData = '';
        }
      } else if (mapping.mappedData) {
        // Transform even non-AI data to ensure it matches field type
        mapping.mappedData = this.transformValueForFieldType(mapping.mappedData, mapping.field);
      }
    }

    return mappings;
  }

  private normalizeYesNo(value: string | undefined): 'yes' | 'no' | undefined {
    if (!value) return undefined;
    const v = value.toLowerCase();
    if (['yes', 'y', 'true', '1'].some((k) => v.includes(k))) return 'yes';
    if (['no', 'n', 'false', '0'].some((k) => v.includes(k))) return 'no';
    return undefined;
  }

  /**
   * Transform AI response to match expected field type
   */
  private transformValueForFieldType(
    value: string | undefined,
    field: ParsedField
  ): string | undefined {
    if (!value) return value;

    const inputType = field.inputType?.toLowerCase();
    const fieldName = field.fieldName.toLowerCase();
    const label = (field.label || '').toLowerCase();
    const placeholder = (field.placeholder || '').toLowerCase();
    const combined = `${fieldName} ${label} ${placeholder}`;

    // Date fields - ensure YYYY-MM-DD format
    if (inputType === 'date' || inputType === 'datetime-local' || combined.includes('date')) {
      try {
        // Clean up AI responses that include format hints like "mm/yyyy: 31/07/2023"
        let cleanValue = value
          .replace(/^(?:mm\/yyyy|yyyy\/mm|dd\/mm\/yyyy|mm\/dd\/yyyy|yyyy-mm-dd)[:\s]*/i, '')
          .trim();

        // First try to extract existing YYYY-MM-DD format
        const dateMatch = cleanValue.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          return dateMatch[1];
        }

        // Handle various date formats: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, etc.
        const formats = [
          /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // DD/MM/YYYY or MM/DD/YYYY
          /(\d{1,2})-(\d{1,2})-(\d{4})/, // DD-MM-YYYY or MM-DD-YYYY
          /(\d{4})\/(\d{1,2})\/(\d{1,2})/, // YYYY/MM/DD
          /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
        ];

        for (const format of formats) {
          const match = cleanValue.match(format);
          if (match) {
            let year, month, day;

            if (match[1].length === 4) {
              // YYYY/MM/DD or YYYY-MM-DD format
              [year, month, day] = [match[1], match[2], match[3]];
            } else {
              // Try to determine if it's MM/DD/YYYY or DD/MM/YYYY
              // For end_date, it's likely DD/MM/YYYY
              if (combined.includes('end') || combined.includes('to')) {
                // Assume DD/MM/YYYY for end dates
                [day, month, year] = [match[1], match[2], match[3]];
              } else {
                // For start dates, assume MM/DD/YYYY
                [month, day, year] = [match[1], match[2], match[3]];
              }
            }

            // Validate and format
            const monthNum = parseInt(month, 10);
            const dayNum = parseInt(day, 10);
            const yearNum = parseInt(year, 10);

            if (
              monthNum >= 1 &&
              monthNum <= 12 &&
              dayNum >= 1 &&
              dayNum <= 31 &&
              yearNum > 1900 &&
              yearNum < 2100
            ) {
              return `${yearNum.toString().padStart(4, '0')}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
            }
          }
        }

        // Try parsing relative dates
        const lowerValue = cleanValue.toLowerCase();
        if (
          lowerValue.includes('week') ||
          lowerValue.includes('month') ||
          lowerValue.includes('present') ||
          lowerValue.includes('current')
        ) {
          if (
            lowerValue.includes('present') ||
            lowerValue.includes('current') ||
            lowerValue.includes('now')
          ) {
            return new Date().toISOString().split('T')[0];
          }

          const weeksMatch = cleanValue.match(/(\d+)\s*weeks?/i);
          const monthsMatch = cleanValue.match(/(\d+)\s*months?/i);
          if (weeksMatch) {
            const weeks = parseInt(weeksMatch[1], 10);
            const date = new Date();
            date.setDate(date.getDate() + weeks * 7);
            return date.toISOString().split('T')[0];
          }
          if (monthsMatch) {
            const months = parseInt(monthsMatch[1], 10);
            const date = new Date();
            date.setMonth(date.getMonth() + months);
            return date.toISOString().split('T')[0];
          }
        }

        // Try parsing as general date string
        const parsed = new Date(cleanValue);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }

        console.log(
          `[DEV] Could not parse date: "${cleanValue}" (original: "${value}"), using current date`
        );
      } catch (e) {
        console.log(`[DEV] Error parsing date "${value}": ${e}`);
      }

      // Fallback to current date if parsing fails
      return new Date().toISOString().split('T')[0];
    }

    // Number fields
    if (inputType === 'number' || combined.includes('year') || combined.includes('experience')) {
      const numMatch = value.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        return numMatch[1];
      }
    }

    // Email fields
    if (inputType === 'email' || combined.includes('email')) {
      const emailMatch = value.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        return emailMatch[1];
      }
    }

    // URL fields
    if (
      inputType === 'url' ||
      combined.includes('url') ||
      combined.includes('website') ||
      combined.includes('linkedin') ||
      combined.includes('github')
    ) {
      if (!value.startsWith('http://') && !value.startsWith('https://')) {
        if (value.includes('linkedin.com') || value.includes('github.com')) {
          return `https://${value}`;
        }
      }
      return value;
    }

    // Tel/Phone fields
    if (inputType === 'tel' || combined.includes('phone') || combined.includes('mobile')) {
      // Remove non-digit characters except +, spaces, and hyphens
      return value.replace(/[^\d+\s-]/g, '');
    }

    return value.trim();
  }

  /**
   * Handle date input fields - fill date and handle date picker modals
   */
  private async fillDateField(
    context: Page | Frame,
    field: ParsedField,
    mappedData: string | undefined
  ): Promise<boolean> {
    try {
      const el = await context.$(field.selector);
      if (!el || !mappedData) return false;

      // Transform the date value to ensure proper format
      let dateValue = this.transformValueForFieldType(mappedData, field);
      if (!dateValue || !dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
        // Fallback: use current date
        dateValue = new Date().toISOString().split('T')[0];
      }

      // Try direct fill first (without clicking to avoid opening picker)
      try {
        // Clear field first
        await el.click({ clickCount: 3 }); // Triple click to select all
        await context.waitForTimeout(100);
        await el.fill(dateValue);
        await context.waitForTimeout(200);

        // Verify the value was set
        const currentValue = await el.inputValue();
        if (currentValue === dateValue) {
          console.log(`[DEV] Filled date field "${field.fieldName}": "${dateValue}"`);
          return true;
        }
      } catch (error) {
        console.log(`[DEV] Direct fill failed, trying alternative method...`);
      }

      // Alternative: Use JavaScript to set value directly
      try {
        await el.evaluate((element: HTMLInputElement, value: string) => {
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }, dateValue);
        await context.waitForTimeout(200);
        console.log(`[DEV] Filled date field "${field.fieldName}" via JavaScript: "${dateValue}"`);
        return true;
      } catch (error) {
        console.log(`[DEV] JavaScript fill failed, checking for date picker...`);
      }

      // If above methods fail, handle date picker modal
      try {
        await el.click();
        await context.waitForTimeout(300);

        // Check if date picker modal opened
        const datePickerSelectors = [
          '[role="dialog"]',
          '.datepicker',
          '.calendar',
          '[class*="date-picker"]',
          '[class*="datepicker"]',
          '[class*="calendar"]',
          '[id*="datepicker"]',
          '[id*="calendar"]',
          '[class*="ui-datepicker"]',
          '[class*="flatpickr"]',
        ];

        let pickerFound = false;
        for (const pickerSelector of datePickerSelectors) {
          try {
            const picker = await context.$(pickerSelector);
            if (picker && (await picker.isVisible().catch(() => false))) {
              pickerFound = true;
              console.log(`[DEV] Date picker modal detected, closing it...`);

              // Try multiple methods to close picker
              try {
                await el.press('Escape');
                await context.waitForTimeout(200);
              } catch (e) {
                // Try clicking outside
                try {
                  await context.click('body', { position: { x: 10, y: 10 } });
                  await context.waitForTimeout(200);
                } catch (e2) {
                  // Try pressing Enter (might select today's date)
                  await el.press('Enter');
                  await context.waitForTimeout(200);
                }
              }
              break;
            }
          } catch (e) {
            // Continue
          }
        }

        // After closing picker (or if no picker), try filling again
        await el.evaluate((element: HTMLInputElement, value: string) => {
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }, dateValue);
        await context.waitForTimeout(200);
        console.log(
          `[DEV] Filled date field "${field.fieldName}" after handling picker: "${dateValue}"`
        );
        return true;
      } catch (error) {
        console.log(`[DEV] Error handling date picker: ${error}`);
      }
    } catch (error) {
      console.log(`[DEV] Error filling date field "${field.fieldName}": ${error}`);
    }
    return false;
  }

  private async selectBestOption(
    page: Page,
    selector: string,
    options: ParsedFieldOption[] | undefined,
    desired: string | undefined,
    frame?: Frame,
    fieldLabel?: string
  ): Promise<boolean> {
    try {
      // Get the appropriate context (main page or iframe)
      const context: Frame | Page = frame || page;

      const el = await context.$(selector);
      if (!el || !options || options.length === 0) return false;
      const target = (desired || '').toLowerCase().trim();

      // If no desired value but we have options, use AI to select best option
      if (!target && options.length > 0) {
        try {
          const optionsText = options
            .map((o, i) => `${i + 1}. ${o.text} (value: ${o.value})`)
            .join('\n');
          const aiPrompt = `Given this dropdown field "${fieldLabel || 'field'}" with the following options:\n${optionsText}\n\nBased on the resume context, select the BEST option number (1-${options.length}) that most accurately represents the candidate's situation. Respond with ONLY the number.`;

          // Add timeout to prevent hanging
          const aiPromise = generateText(
            'You are an assistant helping fill out job application forms. Select the best option from dropdowns.',
            aiPrompt
          );

          const timeoutPromise = new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error('AI timeout')), 8000); // 8 second timeout
          });

          const aiResponse = await Promise.race([aiPromise, timeoutPromise]);
          const selectedIndex = parseInt(aiResponse.trim().match(/\d+/)?.[0] || '1', 10) - 1;

          if (selectedIndex >= 0 && selectedIndex < options.length) {
            await el.selectOption({ value: options[selectedIndex].value });
            console.log(
              `[DEV] AI selected option "${options[selectedIndex].text}" (index ${selectedIndex + 1}) for "${fieldLabel || selector}"`
            );
            return true;
          }
        } catch (aiError) {
          console.log(`[DEV] AI selection failed, falling back to heuristics: ${aiError}`);
        }
      }

      // Try exact match by text or value
      let match = options.find(
        (o) => o.text.toLowerCase() === target || o.value.toLowerCase() === target
      );

      // Try includes match
      if (!match && target) {
        match = options.find(
          (o) => o.text.toLowerCase().includes(target) || o.value.toLowerCase().includes(target)
        );
      }

      // Special handling: years of experience numeric -> bucket
      if (!match && target) {
        const yearsMatch = target.match(/(\d+)(?:\+)?\s*years?/);
        if (yearsMatch) {
          const years = parseInt(yearsMatch[1], 10);
          const preferTexts = options.map((o) => o.text.toLowerCase());
          const bucket =
            years < 1
              ? '0-1'
              : years < 3
                ? '1-3'
                : years < 5
                  ? '3-5'
                  : years < 7
                    ? '5-7'
                    : years < 10
                      ? '7-10'
                      : '10+';
          match = options.find((o) => o.text.toLowerCase().includes(bucket));
        }
      }

      // Fallback: yes/no selects
      if (!match) {
        const yn = this.normalizeYesNo(desired);
        if (yn) {
          match = options.find(
            (o) => o.text.toLowerCase().includes(yn) || o.value.toLowerCase().includes(yn)
          );
        }
      }

      // If still no match and we have a desired value, use AI to match
      if (!match && target && options.length > 0) {
        try {
          const optionsText = options
            .map((o, i) => `${i + 1}. ${o.text} (value: ${o.value})`)
            .join('\n');
          const aiPrompt = `Given this dropdown field "${fieldLabel || 'field'}" with desired value "${desired}" and the following options:\n${optionsText}\n\nSelect the BEST option number (1-${options.length}) that matches or is closest to "${desired}". Respond with ONLY the number.`;

          // Add timeout to prevent hanging
          const aiPromise = generateText(
            'You are an assistant helping fill out job application forms. Match dropdown options to desired values.',
            aiPrompt
          );

          const timeoutPromise = new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error('AI timeout')), 8000); // 8 second timeout
          });

          const aiResponse = await Promise.race([aiPromise, timeoutPromise]);
          const selectedIndex = parseInt(aiResponse.trim().match(/\d+/)?.[0] || '1', 10) - 1;

          if (selectedIndex >= 0 && selectedIndex < options.length) {
            match = options[selectedIndex];
          }
        } catch (aiError) {
          console.log(`[DEV] AI matching failed: ${aiError}`);
        }
      }

      // Last resort: first non-empty option
      if (!match) match = options.find((o) => o.value || o.text);

      if (match) {
        // Try multiple methods to select the option with timeout protection
        try {
          // Method 1: selectOption by value
          await el.selectOption({ value: match.value });
          await context.waitForTimeout(200);

          // Verify selection with timeout
          try {
            const verifyPromise = el.evaluate((el: HTMLSelectElement) => el.value);
            const timeoutPromise = new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error('Verification timeout')), 2000);
            });

            const selectedValue = await Promise.race([verifyPromise, timeoutPromise]);
            if (selectedValue === match.value) {
              console.log(
                `[DEV] Selected option "${match.text}" (value: ${match.value}) for selector: ${selector}`
              );
              return true;
            }
          } catch (verifyError) {
            console.log(`[DEV] Verification failed, but assuming selection worked`);
            return true; // Assume it worked if we got here
          }
        } catch (e1) {
          console.log(`[DEV] selectOption by value failed, trying by label...`);
        }

        try {
          // Method 2: selectOption by label
          await el.selectOption({ label: match.text });
          await context.waitForTimeout(200);
          console.log(`[DEV] Selected option "${match.text}" by label for selector: ${selector}`);
          return true;
        } catch (e2) {
          console.log(`[DEV] selectOption by label failed, trying JavaScript...`);
        }

        try {
          // Method 3: JavaScript direct assignment
          await el.evaluate((element: HTMLSelectElement, value: string) => {
            element.value = value;
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }, match.value);
          await context.waitForTimeout(200);
          console.log(
            `[DEV] Selected option "${match.text}" via JavaScript for selector: ${selector}`
          );
          return true;
        } catch (e3) {
          console.log(`[DEV] JavaScript selection failed`);
        }
      }
    } catch (e) {
      console.log(`[DEV] Error selecting option: ${e}`);
    }
    return false;
  }

  async fillApplication(
    jobUrl: string,
    userProfile: UserProfile,
    coverLetter: string,
    resumePath: string,
    applyLink?: string, // If provided and different from jobUrl, navigate to this URL first
    resumeText?: string // Resume text for AI processing
  ): Promise<ApplicationResult> {
    // Check environment variable to determine behavior
    const autoSubmit = process.env.JOB_AGENT_AUTO_SUBMIT === 'true';

    if (autoSubmit) {
      return this.fillApplicationAndSubmit(
        jobUrl,
        userProfile,
        coverLetter,
        resumePath,
        applyLink,
        resumeText
      );
    } else {
      return this.fillApplicationForReview(
        jobUrl,
        userProfile,
        coverLetter,
        resumePath,
        applyLink,
        resumeText
      );
    }
  }

  private async fillApplicationAndSubmit(
    jobUrl: string,
    userProfile: UserProfile,
    coverLetter: string,
    resumePath: string,
    applyLink?: string,
    resumeText?: string
  ): Promise<ApplicationResult> {
    if (!this.browser) {
      await this.init();
    }

    const page = await this.browser!.newPage();

    try {
      // Determine which URL to start from
      let formUrl = jobUrl;

      // Check if jobUrl already looks like an application page
      const jobUrlLower = jobUrl.toLowerCase();
      const isAlreadyApplyPage =
        jobUrlLower.includes('/apply') ||
        jobUrlLower.includes('/application') ||
        jobUrlLower.includes('application-form') ||
        jobUrlLower.includes('careers/apply');

      if (applyLink && applyLink !== jobUrl) {
        formUrl = applyLink;
      }

      console.log(`[DEV] Filling application - Job URL: ${jobUrl}`);
      console.log(`[DEV] Navigating to form URL: ${formUrl}`);
      await page.goto(formUrl, { waitUntil: 'networkidle' });
      await page.waitForLoadState('domcontentloaded');

      // Step 1: Parse all form fields on the page
      console.log(`[DEV] Parsing form fields on: ${formUrl}`);
      const parsedFields = await this.parseFormFields(page);
      console.log(`[DEV] Found ${parsedFields.length} form fields`);

      // If no form fields found, try different strategies
      if (parsedFields.length === 0) {
        // Strategy 1: If we have a valid applyLink, navigate to it
        if (applyLink && applyLink !== formUrl && !isAlreadyApplyPage) {
          console.log(
            `[DEV] No form fields found on job page, navigating to apply link: ${applyLink}`
          );
          await page.goto(applyLink, { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);

          // Re-parse fields on the apply page
          const applyPageFields = await this.parseFormFields(page);
          console.log(`[DEV] Found ${applyPageFields.length} form fields on apply page`);
          parsedFields.push(...applyPageFields);
        }

        // Strategy 2: If still no fields, try clicking apply buttons to trigger JavaScript navigation/forms
        if (parsedFields.length === 0) {
          console.log(`[DEV] No form fields found, trying to click apply buttons...`);

          // Look for apply buttons and click them
          const allButtons = await page.$$('[class*="apply"], button, a');
          const applyButtons: any[] = [];

          for (const el of allButtons) {
            const text = await el.textContent();
            const className = (await el.getAttribute('class')) || '';
            if (
              text?.toLowerCase().includes('apply') ||
              className.toLowerCase().includes('apply') ||
              className.toLowerCase().includes('cta')
            ) {
              applyButtons.push(el);
            }
          }

          console.log(`[DEV] Found ${applyButtons.length} potential apply buttons`);

          for (const button of applyButtons.slice(0, 3)) {
            // Try first 3 buttons
            try {
              const buttonText = await button.textContent();
              console.log(`[DEV] Clicking apply button: "${buttonText?.trim()}"`);

              // Check if this button will navigate to a different page
              const willNavigate = await this.checkIfElementWillNavigate(button, formUrl);
              if (willNavigate) {
                console.log(
                  `[DEV] Skipping apply button "${buttonText?.trim()}" - it will navigate to a different page`
                );
                continue;
              }

              await button.click();
              await page.waitForTimeout(2000); // Wait for potential navigation or form reveal

              // Check if URL changed (navigation)
              const currentUrl = page.url();
              console.log(`[DEV] After click, URL is: ${currentUrl}`);

              // Re-parse fields
              const newFields = await this.parseFormFields(page);
              console.log(`[DEV] After click, found ${newFields.length} form fields`);

              if (newFields.length > 0) {
                parsedFields.push(...newFields);
                break; // Stop trying other buttons if we found fields
              }
            } catch (error) {
              console.log(`[DEV] Error clicking button:`, error);
            }
          }
        }
      }

      // Log all found fields for debugging
      parsedFields.forEach((field) => {
        console.log(
          `[DEV] Field found: ${field.fieldName} (${field.elementType}${
            field.inputType ? `/${field.inputType}` : ''
          }) - Label: "${field.label}" - Placeholder: "${field.placeholder}" - Required: ${
            field.required
          }`
        );
      });

      // Step 2: Map fields to data, using AI where needed
      console.log(`[DEV] Mapping fields to data...`);
      const fieldMappings = await this.mapFieldsToData(
        parsedFields,
        userProfile,
        coverLetter,
        resumeText || ''
      );

      // Step 3: Fill all mapped fields
      console.log(`[DEV] Filling form fields...`);
      let coverLetterFilled = false;

      for (const mapping of fieldMappings) {
        const { field, mappedData } = mapping;
        try {
          if (field.elementType === 'select') {
            await this.selectBestOption(
              page,
              field.selector,
              field.options,
              mappedData,
              field.frame,
              field.label || field.placeholder
            );
            continue;
          }

          // Handle date inputs
          if (
            field.elementType === 'input' &&
            (field.inputType === 'date' || field.inputType === 'datetime-local')
          ) {
            const context: Frame | Page = field.frame || page;
            await this.fillDateField(context, field, mappedData);
            continue;
          }

          if (field.elementType === 'input' && field.inputType === 'checkbox') {
            const shouldCheck = (() => {
              // If label implies terms/privacy/consent and required, check it
              const label = (field.label || '').toLowerCase();
              if (label.includes('terms') || label.includes('privacy') || label.includes('consent'))
                return true;
              const yn = this.normalizeYesNo(mappedData);
              return yn === 'yes';
            })();
            const context: Frame | Page = field.frame || page;
            const el = await context.$(field.selector);
            if (el) {
              const checked = await el.isChecked().catch(() => false as any);
              if (shouldCheck && !checked) {
                await el.check();
                console.log(`[DEV] Checked checkbox for "${field.fieldName}"`);
              }
            }
            continue;
          }

          if (field.elementType === 'input' && field.inputType === 'radio') {
            if (field.options && field.options.length > 0) {
              const context: Frame | Page = field.frame || page;
              const name = field.fieldName;
              const radios = await context.$$(`input[type="radio"][name="${name}"]`);

              if (radios.length > 0) {
                // Enhanced radio button selection logic
                let clicked = false;
                const target = (mappedData || '').toLowerCase().trim();

                // First try: exact value match
                for (const radio of radios) {
                  const value = (await radio.getAttribute('value')) || '';
                  if (value.toLowerCase() === target) {
                    await radio.click();
                    console.log(
                      `[DEV] Selected radio "${value}" for "${name}" (exact value match)`
                    );
                    clicked = true;
                    break;
                  }
                }

                // Second try: partial value match
                if (!clicked && target) {
                  for (const radio of radios) {
                    const value = (await radio.getAttribute('value')) || '';
                    if (
                      value.toLowerCase().includes(target) ||
                      target.includes(value.toLowerCase())
                    ) {
                      await radio.click();
                      console.log(
                        `[DEV] Selected radio "${value}" for "${name}" (partial value match)`
                      );
                      clicked = true;
                      break;
                    }
                  }
                }

                // Third try: check associated labels for text match
                if (!clicked && target) {
                  for (const radio of radios) {
                    const radioId = await radio.getAttribute('id');
                    if (radioId) {
                      const label = await context.$(`label[for="${radioId}"]`);
                      if (label) {
                        const labelText = (await label.textContent())?.toLowerCase() || '';
                        if (labelText.includes(target)) {
                          await radio.click();
                          console.log(
                            `[DEV] Selected radio with label "${labelText}" for "${name}"`
                          );
                          clicked = true;
                          break;
                        }
                      }
                    }
                  }
                }

                // Fourth try: check parent element text (common pattern)
                if (!clicked && target) {
                  for (const radio of radios) {
                    const parentText = await radio.evaluate((el) => {
                      const parent = el.parentElement;
                      return parent ? parent.textContent?.toLowerCase() || '' : '';
                    });
                    if (parentText.includes(target)) {
                      await radio.click();
                      console.log(
                        `[DEV] Selected radio with parent text containing "${target}" for "${name}"`
                      );
                      clicked = true;
                      break;
                    }
                  }
                }

                // Fifth try: yes/no normalization for boolean questions
                if (!clicked) {
                  const yn = this.normalizeYesNo(mappedData);
                  if (yn) {
                    for (const radio of radios) {
                      const value = (await radio.getAttribute('value')) || '';
                      const parentText = await radio.evaluate((el) => {
                        const parent = el.parentElement;
                        return parent ? parent.textContent?.toLowerCase() || '' : '';
                      });
                      if (value.toLowerCase().includes(yn) || parentText.includes(yn)) {
                        await radio.click();
                        console.log(
                          `[DEV] Selected radio "${value}" for "${name}" (yes/no: ${yn})`
                        );
                        clicked = true;
                        break;
                      }
                    }
                  }
                }

                // Sixth try: Use AI to select best radio option
                if (!clicked && field.options && field.options.length > 0) {
                  try {
                    const optionsText = field.options
                      .map((o, i) => `${i + 1}. ${o.text} (value: ${o.value})`)
                      .join('\n');
                    const fieldLabel = field.label || field.placeholder || field.fieldName;
                    const aiPrompt = mappedData
                      ? `Given this radio button field "${fieldLabel}" with desired value "${mappedData}" and the following options:\n${optionsText}\n\nSelect the BEST option number (1-${field.options.length}) that matches or is closest to "${mappedData}". Respond with ONLY the number.`
                      : `Given this radio button field "${fieldLabel}" with the following options:\n${optionsText}\n\nBased on the resume context, select the BEST option number (1-${field.options.length}) that most accurately represents the candidate's situation. Respond with ONLY the number.`;

                    // Add timeout to prevent hanging
                    const aiPromise = generateText(
                      'You are an assistant helping fill out job application forms. Select the best option from radio buttons.',
                      aiPrompt
                    );

                    const timeoutPromise = new Promise<string>((_, reject) => {
                      setTimeout(() => reject(new Error('AI timeout')), 8000); // 8 second timeout
                    });

                    const aiResponse = await Promise.race([aiPromise, timeoutPromise]);

                    const selectedIndex =
                      parseInt(aiResponse.trim().match(/\d+/)?.[0] || '1', 10) - 1;
                    if (
                      selectedIndex >= 0 &&
                      selectedIndex < field.options.length &&
                      selectedIndex < radios.length
                    ) {
                      await radios[selectedIndex].click();
                      const value =
                        (await radios[selectedIndex].getAttribute('value')) ||
                        field.options[selectedIndex].value;
                      console.log(
                        `[DEV] AI selected radio "${value}" (option ${selectedIndex + 1}) for "${name}"`
                      );
                      clicked = true;
                    }
                  } catch (aiError) {
                    console.log(`[DEV] AI selection for radio failed: ${aiError}`);
                  }
                }

                // Final fallback: select first option
                if (!clicked) {
                  await radios[0].click();
                  const value = (await radios[0].getAttribute('value')) || 'first option';
                  console.log(`[DEV] Selected first radio option "${value}" for "${name}"`);
                }
              }
            }
            continue;
          }

          // Handle resume/cover letter - check if it's a file input or text input
          const fieldInfo =
            `${field.label || ''} ${field.placeholder || ''} ${field.fieldName}`.toLowerCase();
          const isResumeField = fieldInfo.includes('resume') || fieldInfo.includes('cv');
          const isCoverLetterField = fieldInfo.includes('cover') && fieldInfo.includes('letter');

          if (isResumeField || isCoverLetterField) {
            const context: Frame | Page = field.frame || page;
            const el = await context.$(field.selector);

            if (el) {
              // Check if it's a file input
              const tagName = await el.evaluate((el: Element) => el.tagName.toLowerCase());
              const inputType = await el.getAttribute('type');

              if (tagName === 'input' && inputType === 'file') {
                // It's a file input - upload file
                if (isResumeField && resumePath) {
                  try {
                    await el.setInputFiles(resumePath);
                    console.log(`[DEV] Uploaded resume file: "${resumePath}"`);
                  } catch (error) {
                    console.log(`[DEV] Error uploading resume file: ${error}`);
                  }
                } else if (isCoverLetterField) {
                  // Cover letter as file - create a temporary file if needed
                  // For now, skip file upload for cover letter (usually text)
                  console.log(
                    `[DEV] Cover letter field is file input, but cover letter is text - skipping`
                  );
                }
              } else {
                // It's a text input/textarea - fill with text
                if (isCoverLetterField && coverLetter) {
                  try {
                    await el.fill(coverLetter);
                    console.log(`[DEV] Filled cover letter text field`);
                    coverLetterFilled = true;
                  } catch (error) {
                    console.log(`[DEV] Error filling cover letter: ${error}`);
                  }
                } else if (isResumeField) {
                  // Resume field as text - might be a resume URL or text field
                  // For now, skip (resume should be uploaded as file)
                  console.log(
                    `[DEV] Resume field is text input, but resume should be uploaded as file - skipping`
                  );
                }
              }
            }
            continue;
          }

          // Default: fill text-like inputs and textareas
          if (mappedData) {
            const context: Frame | Page = field.frame || page;
            const el = await context.$(field.selector);
            if (el) {
              // Transform value before filling
              const transformedValue = this.transformValueForFieldType(mappedData, field);

              try {
                await el.fill(transformedValue || mappedData);
                console.log(
                  `[DEV] Filled field "${field.fieldName}": "${(transformedValue || mappedData).substring(0, 120)}${
                    (transformedValue || mappedData).length > 120 ? '...' : ''
                  }"`
                );
              } catch (error) {
                // Try using JavaScript if fill fails
                try {
                  await el.evaluate(
                    (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
                      element.value = value;
                      element.dispatchEvent(new Event('input', { bubbles: true }));
                      element.dispatchEvent(new Event('change', { bubbles: true }));
                    },
                    transformedValue || mappedData
                  );
                  console.log(`[DEV] Filled field "${field.fieldName}" via JavaScript`);
                } catch (jsError) {
                  console.log(`[DEV] Error filling field "${field.fieldName}": ${jsError}`);
                }
              }
            } else {
              console.log(`[DEV] Could not find element for field: ${field.fieldName}`);
            }
          }
        } catch (error) {
          console.log(`[DEV] Error filling field "${field.fieldName}":`, error as any);
        }
      }

      // Step 3.5: Fallback for cover letter if not filled via normal mapping
      if (!coverLetterFilled && coverLetter) {
        console.log(
          `[DEV] Cover letter not filled via normal mapping, searching for "cover letter" keyword elements...`
        );
        const coverLetterFilledFallback = await this.searchAndFillCoverLetterByKeyword(
          page,
          coverLetter
        );
        if (!coverLetterFilledFallback) {
          // Try iframes
          const iframes = await page.$$('iframe');
          for (let i = 0; i < iframes.length; i++) {
            try {
              const frame = await iframes[i].contentFrame();
              if (frame) {
                const frameCoverLetterFilled = await this.searchAndFillCoverLetterByKeyword(
                  frame,
                  coverLetter
                );
                if (frameCoverLetterFilled) {
                  console.log(`[DEV] Filled cover letter via keyword search in iframe ${i}`);
                  coverLetterFilled = true;
                  break;
                }
              }
            } catch (error) {
              // Continue trying other iframes
            }
          }
        } else {
          coverLetterFilled = true;
        }
      }

      // Step 3.6: Handle dynamic "Add" buttons for education/experience sections
      console.log(`[DEV] Looking for "Add" buttons for education/experience sections...`);
      const newFieldsAdded = await this.handleAddButtons(page);

      // If new fields were added, re-parse and fill them
      if (newFieldsAdded > 0) {
        console.log(`[DEV] Re-parsing form after clicking ${newFieldsAdded} "Add" buttons...`);

        // Re-parse fields after add button clicks
        const newParsedFields = await this.parseFormFields(page);
        const newFields = newParsedFields.filter(
          (newField) =>
            !parsedFields.some((existingField) => existingField.selector === newField.selector)
        );

        console.log(`[DEV] Found ${newFields.length} new fields after add button clicks`);

        if (newFields.length > 0) {
          // Map and fill the new fields
          const newFieldMappings = await this.mapFieldsToData(
            newFields,
            userProfile,
            coverLetter,
            resumeText || ''
          );

          // Fill the new fields
          for (const mapping of newFieldMappings) {
            const { field, mappedData } = mapping;
            try {
              if (field.elementType === 'select') {
                await this.selectBestOption(
                  page,
                  field.selector,
                  field.options,
                  mappedData,
                  field.frame
                );
                continue;
              }

              if (field.elementType === 'input' && field.inputType === 'radio') {
                if (field.options && field.options.length > 0) {
                  const context: Frame | Page = field.frame || page;
                  const name = field.fieldName;
                  const radios = await context.$$(`input[type="radio"][name="${name}"]`);

                  if (radios.length > 0) {
                    let clicked = false;
                    const target = (mappedData || '').toLowerCase().trim();

                    // Try exact value match first
                    for (const radio of radios) {
                      const value = (await radio.getAttribute('value')) || '';
                      if (value.toLowerCase() === target) {
                        await radio.click();
                        console.log(`[DEV] Selected new radio "${value}" for "${name}"`);
                        clicked = true;
                        break;
                      }
                    }

                    // Fallback: yes/no or first option
                    if (!clicked) {
                      const yn = this.normalizeYesNo(mappedData);
                      if (yn) {
                        for (const radio of radios) {
                          const value = (await radio.getAttribute('value')) || '';
                          if (value.toLowerCase().includes(yn)) {
                            await radio.click();
                            console.log(
                              `[DEV] Selected new radio "${value}" for "${name}" (yes/no: ${yn})`
                            );
                            clicked = true;
                            break;
                          }
                        }
                      }
                    }

                    if (!clicked && radios.length > 0) {
                      await radios[0].click();
                      console.log(`[DEV] Selected first option for new radio field "${name}"`);
                    }
                  }
                }
                continue;
              }

              // Fill text inputs and textareas
              if (mappedData) {
                const context: Frame | Page = field.frame || page;
                const el = await context.$(field.selector);
                if (el) {
                  await el.fill(mappedData);
                  console.log(
                    `[DEV] Filled new field "${field.fieldName}": "${mappedData.substring(0, 50)}${
                      mappedData.length > 50 ? '...' : ''
                    }"`
                  );
                }
              }
            } catch (error) {
              console.log(`[DEV] Error filling new field "${field.fieldName}":`, error);
            }
          }
        }
      }

      // Step 4: Upload resume if needed
      await this.uploadResume(page, resumePath);

      // Step 5: Take screenshot before submission
      const screenshot = await page.screenshot({ fullPage: true });

      // Step 6: Find and click submit button
      console.log(`[DEV] Looking for submit button...`);
      let submitted = false;

      // Helper function to find button by text
      const findButtonByText = async (textPatterns: string[]): Promise<boolean> => {
        // First try main document
        const buttons = await page.$$('button, input[type="submit"], input[type="button"]');

        for (const button of buttons) {
          const text = await button.textContent();
          const value = await button.getAttribute('value');
          const ariaLabel = await button.getAttribute('aria-label');

          const fullText = `${text} ${value} ${ariaLabel}`.toLowerCase();

          for (const pattern of textPatterns) {
            if (fullText.includes(pattern.toLowerCase())) {
              console.log(
                `[DEV] Clicking submit button: "${text || value || ariaLabel}" (matched pattern: "${pattern}")`
              );
              await button.click();
              return true;
            }
          }
        }

        // If not found in main document, try iframes
        const iframes = await page.$$('iframe');
        for (let i = 0; i < iframes.length; i++) {
          try {
            const frame = await iframes[i].contentFrame();
            if (frame) {
              const frameButtons = await frame.$$(
                'button, input[type="submit"], input[type="button"]'
              );

              for (const button of frameButtons) {
                const text = await button.textContent();
                const value = await button.getAttribute('value');
                const ariaLabel = await button.getAttribute('aria-label');

                const fullText = `${text} ${value} ${ariaLabel}`.toLowerCase();

                for (const pattern of textPatterns) {
                  if (fullText.includes(pattern.toLowerCase())) {
                    console.log(
                      `[DEV] Clicking submit button in iframe ${i}: "${text || value || ariaLabel}" (matched pattern: "${pattern}")`
                    );
                    await button.click();
                    return true;
                  }
                }
              }
            }
          } catch (error) {
            // Continue trying other iframes
          }
        }

        return false;
      };

      // Priority order for finding submit button
      const submitTextPatterns = [
        ['submit', 'application'],
        ['apply', 'now'],
        ['submit'],
        ['apply'],
        ['send'],
      ];

      for (const patterns of submitTextPatterns) {
        if (await findButtonByText(patterns)) {
          submitted = true;
          break;
        }
      }

      // Fallback to CSS selector if text search fails
      if (!submitted) {
        const submitSelectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          '[data-testid*="submit"]',
          '[data-testid*="apply"]',
        ];

        // First try main document
        for (const selector of submitSelectors) {
          try {
            const submitButton = await page.$(selector);
            if (submitButton) {
              const buttonText = await submitButton.textContent();
              console.log(
                `[DEV] Clicking submit button via CSS selector: "${buttonText || 'button'}" (selector: ${selector})`
              );
              await submitButton.click();
              submitted = true;
              break;
            }
          } catch (error) {
            // Continue trying other selectors
          }
        }

        // If not found in main document, try iframes
        if (!submitted) {
          const iframes = await page.$$('iframe');
          for (let i = 0; i < iframes.length; i++) {
            if (submitted) break;
            try {
              const frame = await iframes[i].contentFrame();
              if (frame) {
                for (const selector of submitSelectors) {
                  try {
                    const submitButton = await frame.$(selector);
                    if (submitButton) {
                      const buttonText = await submitButton.textContent();
                      console.log(
                        `[DEV] Clicking submit button in iframe ${i} via CSS selector: "${buttonText || 'button'}" (selector: ${selector})`
                      );
                      await submitButton.click();
                      submitted = true;
                      break;
                    }
                  } catch (error) {
                    // Continue trying other selectors
                  }
                }
              }
            } catch (error) {
              // Continue trying other iframes
            }
          }
        }
      }

      if (!submitted) {
        console.log(`[DEV] Could not find submit button - application not submitted`);
        return {
          success: false,
          error: 'Could not find submit button',
          screenshot,
        };
      }

      // Wait for submission to complete
      await page.waitForTimeout(5000);

      console.log(`[DEV] Application submitted successfully at ${new Date().toISOString()}`);
      return {
        success: true,
        screenshot,
        submittedAt: new Date(),
      };
    } catch (error) {
      console.log(`[DEV] Application submission failed: ${error}`);
      const screenshot = await page.screenshot({ fullPage: true });
      return {
        success: false,
        error: `Application failed: ${error}`,
        screenshot,
      };
    } finally {
      await page.close();
    }
  }

  private async fillApplicationForReview(
    jobUrl: string,
    userProfile: UserProfile,
    coverLetter: string,
    resumePath: string,
    applyLink?: string,
    resumeText?: string
  ): Promise<ApplicationResult> {
    if (!this.browser) {
      await this.init();
    }

    const page = await this.browser!.newPage();

    try {
      // Determine which URL to start from
      let formUrl = jobUrl;

      // Check if jobUrl already looks like an application page
      const jobUrlLower = jobUrl.toLowerCase();
      const isAlreadyApplyPage =
        jobUrlLower.includes('/apply') ||
        jobUrlLower.includes('/application') ||
        jobUrlLower.includes('application-form') ||
        jobUrlLower.includes('careers/apply');

      if (applyLink && applyLink !== jobUrl) {
        formUrl = applyLink;
      }

      console.log(`[DEV] Filling application - Job URL: ${jobUrl}`);
      console.log(`[DEV] Navigating to form URL: ${formUrl}`);
      await page.goto(formUrl, { waitUntil: 'networkidle' });
      await page.waitForLoadState('domcontentloaded');

      // Step 1: Parse all form fields on the page
      console.log(`[DEV] Parsing form fields on: ${formUrl}`);
      const parsedFields = await this.parseFormFields(page);
      console.log(`[DEV] Found ${parsedFields.length} form fields`);

      // If no form fields found, try different strategies
      if (parsedFields.length === 0) {
        // Strategy 1: If we have a valid applyLink, navigate to it
        if (applyLink && applyLink !== formUrl && !isAlreadyApplyPage) {
          console.log(
            `[DEV] No form fields found on job page, navigating to apply link: ${applyLink}`
          );
          await page.goto(applyLink, { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);

          // Re-parse fields on the apply page
          const applyPageFields = await this.parseFormFields(page);
          console.log(`[DEV] Found ${applyPageFields.length} form fields on apply page`);
          parsedFields.push(...applyPageFields);
        }

        // Strategy 2: If still no fields, try clicking apply buttons to trigger JavaScript navigation/forms
        if (parsedFields.length === 0) {
          console.log(`[DEV] No form fields found, trying to click apply buttons...`);

          // Look for apply buttons and click them
          const allButtons = await page.$$('[class*="apply"], button, a');
          const applyButtons: any[] = [];

          for (const el of allButtons) {
            const text = await el.textContent();
            const className = (await el.getAttribute('class')) || '';
            if (
              text?.toLowerCase().includes('apply') ||
              className.toLowerCase().includes('apply') ||
              className.toLowerCase().includes('cta')
            ) {
              applyButtons.push(el);
            }
          }

          console.log(`[DEV] Found ${applyButtons.length} potential apply buttons`);

          for (const button of applyButtons.slice(0, 3)) {
            // Try first 3 buttons
            try {
              const buttonText = await button.textContent();
              console.log(`[DEV] Clicking apply button: "${buttonText?.trim()}"`);

              // Check if this button will navigate to a different page
              const willNavigate = await this.checkIfElementWillNavigate(button, formUrl);
              if (willNavigate) {
                console.log(
                  `[DEV] Skipping apply button "${buttonText?.trim()}" - it will navigate to a different page`
                );
                continue;
              }

              await button.click();
              await page.waitForTimeout(2000); // Wait for potential navigation or form reveal

              // Check if URL changed (navigation)
              const currentUrl = page.url();
              console.log(`[DEV] After click, URL is: ${currentUrl}`);

              // Re-parse fields
              const newFields = await this.parseFormFields(page);
              console.log(`[DEV] After click, found ${newFields.length} form fields`);

              if (newFields.length > 0) {
                parsedFields.push(...newFields);
                break; // Stop trying other buttons if we found fields
              }
            } catch (error) {
              console.log(`[DEV] Error clicking button:`, error);
            }
          }
        }
      }

      // Log all found fields for debugging
      parsedFields.forEach((field) => {
        console.log(
          `[DEV] Field found: ${field.fieldName} (${field.elementType}${
            field.inputType ? `/${field.inputType}` : ''
          }) - Label: "${field.label}" - Placeholder: "${field.placeholder}" - Required: ${
            field.required
          }`
        );
      });

      // Step 2: Map fields to data, using AI where needed
      console.log(`[DEV] Mapping fields to data...`);
      const fieldMappings = await this.mapFieldsToData(
        parsedFields,
        userProfile,
        coverLetter,
        resumeText || ''
      );

      // Step 3: Fill all mapped fields
      console.log(`[DEV] Filling form fields...`);
      let coverLetterFilled = false;

      for (const mapping of fieldMappings) {
        const { field, mappedData } = mapping;
        try {
          if (field.elementType === 'select') {
            await this.selectBestOption(
              page,
              field.selector,
              field.options,
              mappedData,
              field.frame,
              field.label || field.placeholder
            );
            continue;
          }

          // Handle date inputs
          if (
            field.elementType === 'input' &&
            (field.inputType === 'date' || field.inputType === 'datetime-local')
          ) {
            const context: Frame | Page = field.frame || page;
            await this.fillDateField(context, field, mappedData);
            continue;
          }

          if (field.elementType === 'input' && field.inputType === 'checkbox') {
            const shouldCheck = (() => {
              // If label implies terms/privacy/consent and required, check it
              const label = (field.label || '').toLowerCase();
              if (label.includes('terms') || label.includes('privacy') || label.includes('consent'))
                return true;
              const yn = this.normalizeYesNo(mappedData);
              return yn === 'yes';
            })();
            const context: Frame | Page = field.frame || page;
            const el = await context.$(field.selector);
            if (el) {
              const checked = await el.isChecked().catch(() => false as any);
              if (shouldCheck && !checked) {
                await el.check();
                console.log(`[DEV] Checked checkbox for "${field.fieldName}"`);
              }
            }
            continue;
          }

          if (field.elementType === 'input' && field.inputType === 'radio') {
            if (field.options && field.options.length > 0) {
              const context: Frame | Page = field.frame || page;
              const name = field.fieldName;
              const radios = await context.$$(`input[type="radio"][name="${name}"]`);

              if (radios.length > 0) {
                // Enhanced radio button selection logic
                let clicked = false;
                const target = (mappedData || '').toLowerCase().trim();

                // First try: exact value match
                for (const radio of radios) {
                  const value = (await radio.getAttribute('value')) || '';
                  if (value.toLowerCase() === target) {
                    await radio.click();
                    console.log(
                      `[DEV] Selected radio "${value}" for "${name}" (exact value match)`
                    );
                    clicked = true;
                    break;
                  }
                }

                // Second try: partial value match
                if (!clicked && target) {
                  for (const radio of radios) {
                    const value = (await radio.getAttribute('value')) || '';
                    if (
                      value.toLowerCase().includes(target) ||
                      target.includes(value.toLowerCase())
                    ) {
                      await radio.click();
                      console.log(
                        `[DEV] Selected radio "${value}" for "${name}" (partial value match)`
                      );
                      clicked = true;
                      break;
                    }
                  }
                }

                // Third try: check associated labels for text match
                if (!clicked && target) {
                  for (const radio of radios) {
                    const radioId = await radio.getAttribute('id');
                    if (radioId) {
                      const label = await context.$(`label[for="${radioId}"]`);
                      if (label) {
                        const labelText = (await label.textContent())?.toLowerCase() || '';
                        if (labelText.includes(target)) {
                          await radio.click();
                          console.log(
                            `[DEV] Selected radio with label "${labelText}" for "${name}"`
                          );
                          clicked = true;
                          break;
                        }
                      }
                    }
                  }
                }

                // Fourth try: check parent element text (common pattern)
                if (!clicked && target) {
                  for (const radio of radios) {
                    const parentText = await radio.evaluate((el) => {
                      const parent = el.parentElement;
                      return parent ? parent.textContent?.toLowerCase() || '' : '';
                    });
                    if (parentText.includes(target)) {
                      await radio.click();
                      console.log(
                        `[DEV] Selected radio with parent text containing "${target}" for "${name}"`
                      );
                      clicked = true;
                      break;
                    }
                  }
                }

                // Fifth try: yes/no normalization for boolean questions
                if (!clicked) {
                  const yn = this.normalizeYesNo(mappedData);
                  if (yn) {
                    for (const radio of radios) {
                      const value = (await radio.getAttribute('value')) || '';
                      const parentText = await radio.evaluate((el) => {
                        const parent = el.parentElement;
                        return parent ? parent.textContent?.toLowerCase() || '' : '';
                      });
                      if (value.toLowerCase().includes(yn) || parentText.includes(yn)) {
                        await radio.click();
                        console.log(
                          `[DEV] Selected radio "${value}" for "${name}" (yes/no: ${yn})`
                        );
                        clicked = true;
                        break;
                      }
                    }
                  }
                }

                // Sixth try: Use AI to select best radio option
                if (!clicked && field.options && field.options.length > 0) {
                  try {
                    const optionsText = field.options
                      .map((o, i) => `${i + 1}. ${o.text} (value: ${o.value})`)
                      .join('\n');
                    const fieldLabel = field.label || field.placeholder || field.fieldName;
                    const aiPrompt = mappedData
                      ? `Given this radio button field "${fieldLabel}" with desired value "${mappedData}" and the following options:\n${optionsText}\n\nSelect the BEST option number (1-${field.options.length}) that matches or is closest to "${mappedData}". Respond with ONLY the number.`
                      : `Given this radio button field "${fieldLabel}" with the following options:\n${optionsText}\n\nBased on the resume context, select the BEST option number (1-${field.options.length}) that most accurately represents the candidate's situation. Respond with ONLY the number.`;

                    // Add timeout to prevent hanging
                    const aiPromise = generateText(
                      'You are an assistant helping fill out job application forms. Select the best option from radio buttons.',
                      aiPrompt
                    );

                    const timeoutPromise = new Promise<string>((_, reject) => {
                      setTimeout(() => reject(new Error('AI timeout')), 8000); // 8 second timeout
                    });

                    const aiResponse = await Promise.race([aiPromise, timeoutPromise]);

                    const selectedIndex =
                      parseInt(aiResponse.trim().match(/\d+/)?.[0] || '1', 10) - 1;
                    if (
                      selectedIndex >= 0 &&
                      selectedIndex < field.options.length &&
                      selectedIndex < radios.length
                    ) {
                      await radios[selectedIndex].click();
                      const value =
                        (await radios[selectedIndex].getAttribute('value')) ||
                        field.options[selectedIndex].value;
                      console.log(
                        `[DEV] AI selected radio "${value}" (option ${selectedIndex + 1}) for "${name}"`
                      );
                      clicked = true;
                    }
                  } catch (aiError) {
                    console.log(`[DEV] AI selection for radio failed: ${aiError}`);
                  }
                }

                // Final fallback: select first option
                if (!clicked) {
                  await radios[0].click();
                  const value = (await radios[0].getAttribute('value')) || 'first option';
                  console.log(`[DEV] Selected first radio option "${value}" for "${name}"`);
                }
              }
            }
            continue;
          }

          // Handle resume/cover letter - check if it's a file input or text input
          const fieldInfo =
            `${field.label || ''} ${field.placeholder || ''} ${field.fieldName}`.toLowerCase();
          const isResumeField = fieldInfo.includes('resume') || fieldInfo.includes('cv');
          const isCoverLetterField = fieldInfo.includes('cover') && fieldInfo.includes('letter');

          if (isResumeField || isCoverLetterField) {
            const context: Frame | Page = field.frame || page;
            const el = await context.$(field.selector);

            if (el) {
              // Check if it's a file input
              const tagName = await el.evaluate((el: Element) => el.tagName.toLowerCase());
              const inputType = await el.getAttribute('type');

              if (tagName === 'input' && inputType === 'file') {
                // It's a file input - upload file
                if (isResumeField && resumePath) {
                  try {
                    await el.setInputFiles(resumePath);
                    console.log(`[DEV] Uploaded resume file: "${resumePath}"`);
                  } catch (error) {
                    console.log(`[DEV] Error uploading resume file: ${error}`);
                  }
                } else if (isCoverLetterField) {
                  // Cover letter as file - create a temporary file if needed
                  // For now, skip file upload for cover letter (usually text)
                  console.log(
                    `[DEV] Cover letter field is file input, but cover letter is text - skipping`
                  );
                }
              } else {
                // It's a text input/textarea - fill with text
                if (isCoverLetterField && coverLetter) {
                  try {
                    await el.fill(coverLetter);
                    console.log(`[DEV] Filled cover letter text field`);
                    coverLetterFilled = true;
                  } catch (error) {
                    console.log(`[DEV] Error filling cover letter: ${error}`);
                  }
                } else if (isResumeField) {
                  // Resume field as text - might be a resume URL or text field
                  // For now, skip (resume should be uploaded as file)
                  console.log(
                    `[DEV] Resume field is text input, but resume should be uploaded as file - skipping`
                  );
                }
              }
            }
            continue;
          }

          // Default: fill text-like inputs and textareas
          if (mappedData) {
            const context: Frame | Page = field.frame || page;
            const el = await context.$(field.selector);
            if (el) {
              // Transform value before filling
              const transformedValue = this.transformValueForFieldType(mappedData, field);

              try {
                await el.fill(transformedValue || mappedData);
                console.log(
                  `[DEV] Filled field "${field.fieldName}": "${(transformedValue || mappedData).substring(0, 120)}${
                    (transformedValue || mappedData).length > 120 ? '...' : ''
                  }"`
                );
              } catch (error) {
                // Try using JavaScript if fill fails
                try {
                  await el.evaluate(
                    (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
                      element.value = value;
                      element.dispatchEvent(new Event('input', { bubbles: true }));
                      element.dispatchEvent(new Event('change', { bubbles: true }));
                    },
                    transformedValue || mappedData
                  );
                  console.log(`[DEV] Filled field "${field.fieldName}" via JavaScript`);
                } catch (jsError) {
                  console.log(`[DEV] Error filling field "${field.fieldName}": ${jsError}`);
                }
              }
            } else {
              console.log(`[DEV] Could not find element for field: ${field.fieldName}`);
            }
          }
        } catch (error) {
          console.log(`[DEV] Error filling field "${field.fieldName}":`, error);
        }
      }

      // Step 3.5: Fallback for cover letter if not filled via normal mapping
      if (!coverLetterFilled && coverLetter) {
        console.log(
          `[DEV] Cover letter not filled via normal mapping, searching for "cover letter" keyword elements...`
        );
        const coverLetterFilledFallback = await this.searchAndFillCoverLetterByKeyword(
          page,
          coverLetter
        );
        if (!coverLetterFilledFallback) {
          // Try iframes
          const iframes = await page.$$('iframe');
          for (let i = 0; i < iframes.length; i++) {
            try {
              const frame = await iframes[i].contentFrame();
              if (frame) {
                const frameCoverLetterFilled = await this.searchAndFillCoverLetterByKeyword(
                  frame,
                  coverLetter
                );
                if (frameCoverLetterFilled) {
                  console.log(`[DEV] Filled cover letter via keyword search in iframe ${i}`);
                  coverLetterFilled = true;
                  break;
                }
              }
            } catch (error) {
              // Continue trying other iframes
            }
          }
        } else {
          coverLetterFilled = true;
        }
      }

      // Step 3.6: Handle dynamic "Add" buttons for education/experience sections
      console.log(`[DEV] Looking for "Add" buttons for education/experience sections...`);
      const newFieldsAdded = await this.handleAddButtons(page);

      // If new fields were added, re-parse and fill them
      if (newFieldsAdded > 0) {
        console.log(`[DEV] Re-parsing form after clicking ${newFieldsAdded} "Add" buttons...`);

        // Re-parse fields after add button clicks
        const newParsedFields = await this.parseFormFields(page);
        const newFields = newParsedFields.filter(
          (newField) =>
            !parsedFields.some((existingField) => existingField.selector === newField.selector)
        );

        console.log(`[DEV] Found ${newFields.length} new fields after add button clicks`);

        if (newFields.length > 0) {
          // Map and fill the new fields
          const newFieldMappings = await this.mapFieldsToData(
            newFields,
            userProfile,
            coverLetter,
            resumeText || ''
          );

          // Fill the new fields
          for (const mapping of newFieldMappings) {
            const { field, mappedData } = mapping;
            try {
              if (field.elementType === 'select') {
                await this.selectBestOption(
                  page,
                  field.selector,
                  field.options,
                  mappedData,
                  field.frame
                );
                continue;
              }

              if (field.elementType === 'input' && field.inputType === 'radio') {
                if (field.options && field.options.length > 0) {
                  const context: Frame | Page = field.frame || page;
                  const name = field.fieldName;
                  const radios = await context.$$(`input[type="radio"][name="${name}"]`);

                  if (radios.length > 0) {
                    let clicked = false;
                    const target = (mappedData || '').toLowerCase().trim();

                    // Try exact value match first
                    for (const radio of radios) {
                      const value = (await radio.getAttribute('value')) || '';
                      if (value.toLowerCase() === target) {
                        await radio.click();
                        console.log(`[DEV] Selected new radio "${value}" for "${name}"`);
                        clicked = true;
                        break;
                      }
                    }

                    // Fallback: yes/no or first option
                    if (!clicked) {
                      const yn = this.normalizeYesNo(mappedData);
                      if (yn) {
                        for (const radio of radios) {
                          const value = (await radio.getAttribute('value')) || '';
                          if (value.toLowerCase().includes(yn)) {
                            await radio.click();
                            console.log(
                              `[DEV] Selected new radio "${value}" for "${name}" (yes/no: ${yn})`
                            );
                            clicked = true;
                            break;
                          }
                        }
                      }
                    }

                    if (!clicked && radios.length > 0) {
                      await radios[0].click();
                      console.log(`[DEV] Selected first option for new radio field "${name}"`);
                    }
                  }
                }
                continue;
              }

              // Fill text inputs and textareas
              if (mappedData) {
                const context: Frame | Page = field.frame || page;
                const el = await context.$(field.selector);
                if (el) {
                  await el.fill(mappedData);
                  console.log(
                    `[DEV] Filled new field "${field.fieldName}": "${mappedData.substring(0, 50)}${
                      mappedData.length > 50 ? '...' : ''
                    }"`
                  );
                }
              }
            } catch (error) {
              console.log(`[DEV] Error filling new field "${field.fieldName}":`, error);
            }
          }
        }
      }

      // Step 4: Upload resume if needed
      await this.uploadResume(page, resumePath);

      // Step 5: Take screenshot before submission
      const screenshot = await page.screenshot({ fullPage: true });

      // Step 6: Keep browser open for manual verification and submission
      console.log(`[DEV] ============================================`);
      console.log(`[DEV] Form fields have been populated successfully!`);
      console.log(`[DEV] Browser is open for manual verification.`);
      console.log(`[DEV] Please review all fields and submit manually when ready.`);
      console.log(`[DEV] ============================================`);

      return {
        success: true,
        screenshot,
        // Note: submittedAt will be undefined since we're not auto-submitting
      };
    } catch (error) {
      console.log(`[DEV] Application filling failed: ${error}`);
      const screenshot = await page.screenshot({ fullPage: true });
      return {
        success: false,
        error: `Application failed: ${error}`,
        screenshot,
      };
    }
    // Note: Page is kept open for manual verification - no finally block to close it
  }

  private async fillField(
    page: Page,
    selectors: string[],
    value: string,
    fieldName?: string
  ): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const field = await page.$(selector);
        if (field) {
          await field.fill(value);
          // Dev logging - show which field was filled and what value
          if (fieldName) {
            console.log(`[DEV] Filled ${fieldName}: "${value}" (using selector: ${selector})`);
          }
          return true;
        }
      } catch (error) {
        // Continue trying other selectors
      }
    }
    if (fieldName) {
      console.log(
        `[DEV] Could not find field for ${fieldName} - tried selectors: ${selectors.join(', ')}`
      );
    }
    return false;
  }

  private async uploadResume(page: Page, resumePath: string): Promise<boolean> {
    const fileInputSelectors = [
      'input[type="file"]',
      'input[name*="resume"]',
      'input[name*="cv"]',
      'input[id*="resume"]',
      'input[id*="cv"]',
      'input[accept*="pdf"]',
      'input[accept*="doc"]',
      'input[class*="file"]',
      'input[data-testid*="resume"]',
      'input[data-testid*="cv"]',
      'input[aria-label*="resume"]',
      'input[aria-label*="cv"]',
    ];

    // Helper function to try uploading to a context (page or frame)
    const tryUploadInContext = async (
      context: Page | Frame,
      contextName: string
    ): Promise<boolean> => {
      // First try standard selectors
      for (const selector of fileInputSelectors) {
        try {
          const fileInput = await context.$(selector);
          if (fileInput) {
            // Check if it's visible or if we need to make it visible
            const isVisible = await fileInput.isVisible().catch(() => false);
            if (!isVisible) {
              // Try to make it visible by clicking parent or triggering click
              try {
                await fileInput.evaluate((el: HTMLInputElement) => {
                  el.style.display = 'block';
                  el.style.visibility = 'visible';
                  el.style.opacity = '1';
                });
              } catch (e) {
                // Continue anyway
              }
            }

            await fileInput.setInputFiles(resumePath);
            console.log(
              `[DEV] Uploaded resume: "${resumePath}" (using selector: ${selector} in ${contextName})`
            );
            await context.waitForTimeout(500); // Wait for upload to process
            return true;
          }
        } catch (error) {
          // Continue trying other selectors
        }
      }

      // Try keyword-based search
      const keywordUploaded = await this.searchAndUploadResumeByKeyword(context, resumePath);
      if (keywordUploaded) {
        console.log(`[DEV] Uploaded resume via keyword search in ${contextName}`);
        await context.waitForTimeout(500);
        return true;
      }

      return false;
    };

    // First try main document
    const mainUploaded = await tryUploadInContext(page, 'main document');
    if (mainUploaded) {
      return true;
    }

    // Try iframes recursively
    const iframes = await page.$$('iframe');
    for (let i = 0; i < iframes.length; i++) {
      try {
        const frame = await iframes[i].contentFrame();
        if (frame) {
          const frameUploaded = await tryUploadInContext(frame, `iframe ${i}`);
          if (frameUploaded) {
            return true;
          }
        }
      } catch (error) {
        // Continue trying other iframes
      }
    }

    // Final attempt: Try clicking on any upload button/area and then uploading
    console.log(`[DEV] Standard methods failed, trying click-then-upload approach...`);
    try {
      const uploadButtons = await page.$$(
        'button[class*="upload"], button[class*="resume"], button[class*="cv"], [role="button"][class*="upload"], [class*="file-upload"], [class*="dropzone"]'
      );

      for (const button of uploadButtons.slice(0, 3)) {
        try {
          const buttonText = await button.textContent();
          const buttonClass = (await button.getAttribute('class')) || '';
          const combined = `${buttonText} ${buttonClass}`.toLowerCase();

          if (
            combined.includes('resume') ||
            combined.includes('cv') ||
            combined.includes('upload') ||
            combined.includes('file')
          ) {
            console.log(`[DEV] Clicking upload button: "${buttonText?.trim()}"`);
            await button.click();
            await page.waitForTimeout(1000);

            // After clicking, try to find and upload file input
            const fileInput = await page.$('input[type="file"]');
            if (fileInput) {
              await fileInput.setInputFiles(resumePath);
              console.log(`[DEV] Uploaded resume after clicking upload button`);
              await page.waitForTimeout(500);
              return true;
            }
          }
        } catch (error) {
          // Continue
        }
      }
    } catch (error) {
      // Ignore
    }

    console.log(
      `[DEV] Could not find resume upload field - tried all methods including selectors, keyword search, and click-then-upload`
    );
    return false;
  }

  private async searchAndUploadResumeByKeyword(
    context: Page | Frame,
    resumePath: string
  ): Promise<boolean> {
    try {
      // Find all clickable elements that might contain "resume" text
      const resumeElements = await context.$$(
        '[class*="resume"], [class*="cv"], button, a, div, span, label'
      );

      for (const element of resumeElements) {
        try {
          const textContent = (await element.textContent())?.toLowerCase() || '';
          const className = (await element.getAttribute('class'))?.toLowerCase() || '';
          const id = (await element.getAttribute('id'))?.toLowerCase() || '';
          const ariaLabel = (await element.getAttribute('aria-label'))?.toLowerCase() || '';

          const combinedText = `${textContent} ${className} ${id} ${ariaLabel}`;

          if (
            combinedText.includes('resume') ||
            combinedText.includes('cv') ||
            (combinedText.includes('upload') &&
              (combinedText.includes('file') || combinedText.includes('document')))
          ) {
            console.log(`[DEV] Found potential resume element with text: "${textContent.trim()}"`);

            // Check if this element is actually a file input (might be hidden)
            const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
            if (tagName === 'input') {
              const inputType = await element.getAttribute('type');
              if (inputType === 'file') {
                await element.setInputFiles(resumePath);
                console.log(`[DEV] Uploaded resume via hidden file input found by keyword search`);
                return true;
              }
            }

            // Skip clicking elements as it may navigate to different pages
            console.log(`[DEV] Skipping click for resume element to avoid navigation`);
          }
        } catch (error) {
          // Continue trying other elements
        }
      }
    } catch (error) {
      console.log(`[DEV] Error during keyword search for resume upload:`, error);
    }

    return false;
  }

  private async searchAndFillCoverLetterByKeyword(
    context: Page | Frame,
    coverLetter: string
  ): Promise<boolean> {
    try {
      // Find all text input/textarea elements that might be for cover letters
      const textElements = await context.$$(
        'textarea, input[type="text"], div[contenteditable="true"], div[role="textbox"]'
      );

      for (const element of textElements) {
        try {
          const textContent = (await element.textContent())?.toLowerCase() || '';
          const placeholder = (await element.getAttribute('placeholder'))?.toLowerCase() || '';
          const ariaLabel = (await element.getAttribute('aria-label'))?.toLowerCase() || '';
          const id = (await element.getAttribute('id'))?.toLowerCase() || '';
          const name = (await element.getAttribute('name'))?.toLowerCase() || '';
          const className = (await element.getAttribute('class'))?.toLowerCase() || '';

          const combinedText = `${textContent} ${placeholder} ${ariaLabel} ${id} ${name} ${className}`;

          if (combinedText.includes('cover') && combinedText.includes('letter')) {
            console.log(
              `[DEV] Found potential cover letter element with text: "${placeholder || textContent}"`
            );

            // Try to fill the element
            try {
              await element.fill(coverLetter);
              console.log(
                `[DEV] Filled cover letter via keyword search: "${coverLetter.substring(0, 120)}..."`
              );
              return true;
            } catch (fillError) {
              // Try clicking first then filling
              try {
                await element.click();
                await context.waitForTimeout(500);
                await element.fill(coverLetter);
                console.log(
                  `[DEV] Filled cover letter after click via keyword search: "${coverLetter.substring(0, 120)}..."`
                );
                return true;
              } catch (clickFillError) {
                console.log(`[DEV] Could not fill cover letter element found by keyword search`);
              }
            }
          }
        } catch (error) {
          // Continue trying other elements
        }
      }

      // Also search for labels or other elements that might indicate cover letter fields
      const labelElements = await context.$$('label, span, div, p');

      for (const element of labelElements) {
        try {
          const textContent = (await element.textContent())?.toLowerCase() || '';
          const combinedText = textContent;

          if (combinedText.includes('cover') && combinedText.includes('letter')) {
            console.log(`[DEV] Found cover letter label: "${textContent}"`);

            // Try to find associated input/textarea
            const elementId =
              (await element.getAttribute('for')) || (await element.getAttribute('id'));

            if (elementId) {
              // Look for input/textarea with matching id
              const associatedElement = await context.$(`#${elementId}`);
              if (associatedElement) {
                const tagName = await associatedElement.evaluate((el) => el.tagName.toLowerCase());
                if (['textarea', 'input', 'div'].includes(tagName)) {
                  try {
                    await associatedElement.fill(coverLetter);
                    console.log(
                      `[DEV] Filled cover letter via associated element: "${coverLetter.substring(0, 120)}..."`
                    );
                    return true;
                  } catch (fillError) {
                    console.log(`[DEV] Could not fill associated cover letter element`);
                  }
                }
              }
            }

            // Try finding next sibling input/textarea
            const nextInput = await element.$(
              'xpath=following::textarea[1] | following::input[1] | following::div[@contenteditable="true"][1]'
            );
            if (nextInput) {
              try {
                await nextInput.fill(coverLetter);
                console.log(
                  `[DEV] Filled cover letter via sibling element: "${coverLetter.substring(0, 120)}..."`
                );
                return true;
              } catch (fillError) {
                console.log(`[DEV] Could not fill sibling cover letter element`);
              }
            }
          }
        } catch (error) {
          // Continue trying other elements
        }
      }
    } catch (error) {
      console.log(`[DEV] Error during keyword search for cover letter:`, error);
    }

    return false;
  }

  private async handleAddButtons(page: Page): Promise<number> {
    let buttonsClicked = 0;
    try {
      // Look for "Add" buttons related to education, experience, work, etc.
      const addButtonSelectors = [
        'button',
        'a',
        'input[type="button"]',
        'input[type="submit"]',
        'div[role="button"]',
        'span[role="button"]',
        '[class*="add"]',
        '[class*="plus"]',
        '[class*="btn"]',
      ];

      const addButtons: Array<{ element: any; text: string; score: number }> = [];

      for (const selector of addButtonSelectors) {
        const elements = await page.$$(selector);
        for (const element of elements) {
          try {
            const textContent = (await element.textContent())?.toLowerCase() || '';
            const ariaLabel = (await element.getAttribute('aria-label'))?.toLowerCase() || '';
            const title = (await element.getAttribute('title'))?.toLowerCase() || '';
            const className = (await element.getAttribute('class'))?.toLowerCase() || '';

            const combinedText = `${textContent} ${ariaLabel} ${title} ${className}`;

            // Keywords that indicate this is an "add" button for sections
            const addKeywords = ['add', 'plus', '+', 'new', 'another', 'more', 'additional'];
            const sectionKeywords = [
              'education',
              'experience',
              'work',
              'employment',
              'job',
              'position',
              'school',
              'university',
              'degree',
              'certification',
              'skill',
              'project',
            ];

            let score = 0;

            // Check for add keywords
            const hasAddKeyword = addKeywords.some((keyword) => combinedText.includes(keyword));
            if (hasAddKeyword) score += 5;

            // Check for section keywords
            const hasSectionKeyword = sectionKeywords.some((keyword) =>
              combinedText.includes(keyword)
            );
            if (hasSectionKeyword) score += 5;

            // Bonus for exact matches
            if (
              combinedText.includes('add education') ||
              combinedText.includes('add experience') ||
              combinedText.includes('add work') ||
              combinedText.includes('add job')
            ) {
              score += 10;
            }

            // Look for plus icons or symbols
            if (
              combinedText.includes('+') ||
              className.includes('plus') ||
              className.includes('add')
            ) {
              score += 3;
            }

            if (score >= 5) {
              addButtons.push({
                element,
                text: textContent.trim() || ariaLabel || title || 'button',
                score,
              });
            }
          } catch (error) {
            // Continue to next element
          }
        }
      }

      // Sort by score (highest first)
      addButtons.sort((a, b) => b.score - a.score);

      console.log(`[DEV] Found ${addButtons.length} potential "Add" buttons (sorted by relevance)`);
      for (const button of addButtons.slice(0, 5)) {
        console.log(`[DEV]   - Score ${button.score}: "${button.text}"`);
      }

      // Click the top-scoring buttons to add sections
      const maxButtonsToClick = 3; // Limit to avoid clicking too many

      for (const button of addButtons) {
        if (buttonsClicked >= maxButtonsToClick) break;

        try {
          // Check if this button/link will navigate to a different page
          const willNavigate = await this.checkIfElementWillNavigate(button.element, page.url());
          if (willNavigate) {
            console.log(
              `[DEV] Skipping "Add" button "${button.text}" - it will navigate to a different page`
            );
            continue;
          }

          console.log(`[DEV] Clicking "Add" button: "${button.text}" (score: ${button.score})`);
          await button.element.click();

          // Wait for the new fields to appear
          await page.waitForTimeout(1500);

          buttonsClicked++;
          console.log(`[DEV] Successfully clicked "Add" button, waiting for fields to appear`);
        } catch (clickError) {
          console.log(`[DEV] Failed to click "Add" button "${button.text}": ${clickError}`);
        }
      }

      // If we clicked any buttons, wait a bit more for all dynamic content to load
      if (buttonsClicked > 0) {
        await page.waitForTimeout(2000);
        console.log(
          `[DEV] Clicked ${buttonsClicked} "Add" buttons, waiting for dynamic content to load`
        );
      }
    } catch (error) {
      console.log(`[DEV] Error handling add buttons: ${error}`);
    }

    return buttonsClicked;
  }

  private async checkIfElementWillNavigate(element: any, currentUrl: string): Promise<boolean> {
    try {
      // Check if it's a link element
      const tagName = await element.evaluate((el: Element) => el.tagName.toLowerCase());
      const href = await element.getAttribute('href');
      const target = await element.getAttribute('target');
      const onclick = await element.getAttribute('onclick');

      // If it's a link with href
      if (tagName === 'a' && href) {
        // Skip if href is just # or empty
        if (href === '#' || href === '' || href.startsWith('javascript:void')) {
          return false;
        }

        // Check if it opens in new tab/window
        if (target === '_blank' || target === '_new') {
          return true;
        }

        // Check if href is an absolute URL (different domain)
        if (href.startsWith('http://') || href.startsWith('https://')) {
          const currentDomain = new URL(currentUrl).hostname;
          const hrefDomain = new URL(href).hostname;
          if (currentDomain !== hrefDomain) {
            return true;
          }
        }

        // Check if href looks like a different page (not just #anchor)
        if (
          href.startsWith('./') ||
          href.startsWith('../') ||
          href.includes('.html') ||
          href.includes('.php') ||
          href.includes('/')
        ) {
          // This could be navigation to a different page
          return true;
        }

        // If href starts with ?, it's likely a query parameter change (same page)
        if (href.startsWith('?')) {
          return false;
        }
      }

      // Check for onclick that might navigate
      if (onclick) {
        const onclickLower = onclick.toLowerCase();
        if (
          onclickLower.includes('window.location') ||
          onclickLower.includes('window.open') ||
          onclickLower.includes('location.href') ||
          onclickLower.includes('document.location')
        ) {
          return true;
        }
      }

      // For buttons, check if they have form action or similar
      if (tagName === 'button' || tagName === 'input') {
        const formAction = await element.getAttribute('formaction');
        if (formAction) {
          return true;
        }
      }

      return false;
    } catch (error) {
      // If we can't determine, err on the side of caution
      console.log(`[DEV] Error checking if element will navigate: ${error}`);
      return true; // Assume it will navigate to be safe
    }
  }

  async processMultipleApplications(
    applications: Array<{
      jobUrl: string;
      coverLetter: string;
      resumePath: string;
      applyLink?: string; // Optional link to apply page if different from job page
      resumeText?: string; // Resume text for AI processing
    }>,
    userProfile: UserProfile
  ): Promise<ApplicationResult[]> {
    const results: ApplicationResult[] = [];

    for (const app of applications) {
      try {
        const result = await this.fillApplication(
          app.jobUrl,
          userProfile,
          app.coverLetter,
          app.resumePath,
          app.applyLink,
          app.resumeText
        );
        results.push(result);

        // Add delay between applications
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (error) {
        results.push({
          success: false,
          error: `Failed to process application: ${error}`,
        });
      }
    }

    return results;
  }
}
