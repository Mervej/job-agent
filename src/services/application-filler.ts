import { chromium, Browser, Page, Frame } from 'playwright';
import { UserProfile } from './cover-letter-generator';
import { generateText } from './ai.service';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { StructuredResume } from './resume';
import { FormAnalyzerAgent } from '../agents/form-analyzer.agent';
import { FieldFillerAgent } from '../agents/field-filler.agent';
import { VerifierAgent } from '../agents/verifier.agent';
import { HtmlFormExtractorAgent, AIField } from '../agents/html-form-extractor.agent';

export interface ApplicationResult {
  success: boolean;
  error?: string;
  screenshot?: Buffer;
  screenshotPath?: string;
  submittedAt?: Date;
}

// Types are defined in agents/types.ts — re-exported here for backward compatibility
export type { ParsedFieldOption, ParsedField, FieldMapping } from '../agents/types';
import type { ParsedField, FieldMapping, ParsedFieldOption } from '../agents/types';

/**
 * Builds an AI prompt that asks the model to pick the single best option
 * from a predefined list. Used for dropdowns, radio groups, and any other
 * field where only a fixed set of values is valid.
 */
function buildOptionsPrompt(
  question: string,
  options: ParsedFieldOption[],
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

export class ApplicationFiller {
  private browser: Browser | null = null;
  private formAnalyzer = new FormAnalyzerAgent();
  private fieldFiller = new FieldFillerAgent();
  private verifier = new VerifierAgent();
  private htmlExtractor = new HtmlFormExtractorAgent();

  async init() {
    // Default: show browser window. Set BROWSER_HEADLESS=true to run silently (e.g. production).
    const headless = process.env.BROWSER_HEADLESS === 'true';
    this.browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // this.processMultipleApplications(
    //   [
    //     {
    //       jobUrl: 'https://apply.workable.com/innovaccer-analytics/j/B8949A7346/',
    //       coverLetter:
    //         "Dear Hiring Manager,\n\nI am excited to apply for the Software Development Engineer-III (Backend) position at Innovaccer as advertised on your website. With my extensive experience in backend development, system design, and scalable architectures, I believe that I can bring a wealth of knowledge and expertise to this role.\n\nAs a Senior Software Engineer with over 8 years of experience, I have developed high-performance event-driven microservices and led cross-functional teams in my previous roles at Innovaccer, Bajaj Finserv Health, BookMyShow, and Terribly Tiny Tales. My expertise lies in building scalable backend systems for healthcare marketing campaigns, migrating monolithic applications to microservices with Kafka and Azure Service Bus, and creating end-to-end payment reconciliation systems that achieve 100% transaction tracking accuracy.\n\nI am confident that my skills align well with the key requirements of this role, including a Bachelor's degree in Computer Science or related field (or equivalent work experience), over 6 years of overall backend microservices experience, and working experience with Python, Django/FastAPI/Flask/Sanic, SQL, Cloud (Azure/AWS), Docker, MongoDB or other noSQL database. I have also demonstrated a deep knowledge of software engineering principles, design patterns, and best practices, as well as strong problem-solving skills and the ability to quickly debug and resolve complex issues.\n\nIn my previous role at Innovaccer, I was responsible for building scalable backend systems for the Cured team's healthcare marketing campaigns, implementing audience segmentation, template management, and real-e",
    //       resumePath:
    //         '/Users/mervej.raj/Documents/Projects/Personal/job-agent/src/data/resumes/5.pdf',
    //       applyLink: 'https://apply.workable.com/innovaccer-analytics/j/B8949A7346/apply/',
    //       resumeText:
    //         '\n\nMervej Raj\n«\nGitlab|\nï\nLinkedIn|\n#\nmervejraj@gmail.com|\nH\n+91 97645 77845\nSummary\nSenior Software Engineer with 8+ years of experience in backend development,  system design,  and scalable\narchitectures.   Expert  in  building  high-performance,  event-driven  microservices  and  leading  cross-functional\nteams.  Strong advocate for automation, DevOps integration, and clean, maintainable code.\nWork Experience\nInnovaccer, Noida — Software EngineerSep 2025 – Present\n–  Builtscalable backend systemsfor  the  Cured  team  to  orchestratemulti-channel healthcare mar-\nketing campaigns,  implementingaudience segmentation,template management,  andreal-time\nanalytics APIsthat enable automated outreach viaSMS, email, and IVRacross multiple clients.\nBajaj Finserv Health, Pune — Principal Software EngineerMar 2023 – Sep 2025\n–  Migratedmonolith to microservicesandmonorepo architecturewithKafkaandAzure Service\nBus— reducing deployment time by30%, improving scalability by20%, cutting downtime by12%, and\nincreasing throughput by15%.\n–  Createdend-to-end payment reconciliation systemachieving100% transaction tracking accuracy\nand50% faster reconciliation.  Improved payment success to95%and payout success to99%.\n–  Led engineering team, mentoring onarchitecture, delivery, andcross-functional collaboration.\nBookMyShow, Mumbai — Software Development Engineer IIJul 2021 – Mar 2023\n–  DeliveredBMS Play Credit CardwithRBL Bank,RBI mandate card tokenisation,  andAPI\nintegrationswith SBI and RBL for bank offers, boosting engagement by25%.\n–  Builtbackend and CMSfor BMS offers withAPI governanceinNode.jsandGolang— improving\nefficiency  by20%,  accelerating  rollouts  by15%,  enhancing  reliability  by30%,  and  reducing  latency  by\n20%.\nTerribly Tiny Tales, Mumbai — Senior Software EngineerApr 2019 – Jul 2021\n–  Developedbackend applicationswithNode.js, MySQL, Redis,  andElasticsearch,  and  designed\nsubscription-based payment systemusingRazorpaywith recurring billing — improving performance\nby25%.\nLivelike, Gurugram — Software DeveloperJun 2017 – Mar 2019\n–  Developed  and  integratedvirtual reality apps,  enhancing  immersive  experience  offerings  for  multiple\nclients.\nPersonal Projects\nPixel Streaming Demo\nBuilt a WebRTC-based product enabling instant interactivity with 3D apps off-device using Node.js, MySQL,\nReact & AWS. Achieved near-zero download time and low latency, with autoscaling to handle real-time traffic\nsurges.\nEducation\n2013 – 2017    B.Tech, National Institute of Technology, Nagpur\n2010 – 2012    12th, Cotton College, Assam\nSkills & Highlights\nProgrammingNode.js (NestJS, Express) — 6+ yrs; Golang — 4+ yrs\nDatabasesMySQL, PostgreSQL, MongoDB, Elasticsearch, Redis, Aerospike\nFrameworks / ToolsPub-sub, Queues, Mailing, Notifications, Payment Gateways (PayU, Razorpay etc)\nAI & AutomationAI Tools (GitHub Copilot, Cursor, Windsurf), MCP Servers (Postgres, Azure ,AWS,\nGitlab, Context7 etc)\nDevOps / CloudAWS (EC2, ECS, S3), Azure (Pipelines, AKS, Blob Storage), CI/CD Design, Build\nAutomation',
    //       structuredResume: {
    //         profileDetails: {
    //           name: 'Mervej Raj',
    //           email: 'mervejraj@gmail.com',
    //           phone: '+91 97645 77845',
    //           location: 'India',
    //           linkedin: 'https://www.linkedin.com/in/mervejraj/',
    //           github: 'https://gitlab.com/users/Mervej',
    //           website: '',
    //         },
    //         summary:
    //           'Senior Software Engineer with 8+ years of experience in backend development, system design, and scalable architectures. Expert in building high-performance, event-driven microservices and leading cross-functional teams. Strong advocate for automation, DevOps integration, and clean, maintainable code.',
    //         experience: [
    //           {
    //             company: 'Innovaccer',
    //             role: 'Software Engineer',
    //             startDate: '09/2025',
    //             endDate: 'Present',
    //             location: 'Noida',
    //             description:
    //               'Built scalable backend systems for the Cured team to orchestrate multi-channel healthcare marketing campaigns.',
    //             achievements: [
    //               'Implemented audience segmentation, template management, and real-time analytics APIs.',
    //               'Enabled automated outreach via SMS, email, and IVR across multiple clients.',
    //             ],
    //           },
    //           {
    //             company: 'Bajaj Finserv Health',
    //             role: 'Principal Software Engineer',
    //             startDate: '03/2023',
    //             endDate: '09/2025',
    //             location: 'Pune',
    //             description:
    //               'Led migration to microservices and designed end-to-end payment reconciliation systems.',
    //             achievements: [
    //               'Migrated monolith to microservices and monorepo architecture with Kafka and Azure Service Bus, improving scalability and reducing downtime.',
    //               'Created payment reconciliation system achieving 100% transaction tracking accuracy and 50% faster reconciliation.',
    //               'Led engineering team, mentoring on architecture and delivery.',
    //             ],
    //           },
    //           {
    //             company: 'BookMyShow',
    //             role: 'Software Development Engineer II',
    //             startDate: '07/2021',
    //             endDate: '03/2023',
    //             location: 'Mumbai',
    //             description:
    //               'Developed banking integrations and backend systems for offers and payment-related services.',
    //             achievements: [
    //               'Delivered BMS Play Credit Card integration with RBL Bank and RBI mandate tokenization.',
    //               'Built backend and CMS for BMS offers with API governance in Node.js and Golang.',
    //             ],
    //           },
    //           {
    //             company: 'Terribly Tiny Tales',
    //             role: 'Senior Software Engineer',
    //             startDate: '04/2019',
    //             endDate: '07/2021',
    //             location: 'Mumbai',
    //             description:
    //               'Developed backend systems and payment solutions for digital content subscriptions.',
    //             achievements: [
    //               'Designed subscription-based payment system using Razorpay with recurring billing.',
    //               'Improved performance by 25% using Node.js, MySQL, Redis, and Elasticsearch.',
    //             ],
    //           },
    //           {
    //             company: 'Livelike',
    //             role: 'Software Developer',
    //             startDate: '06/2017',
    //             endDate: '03/2019',
    //             location: 'Gurugram',
    //             description: 'Developed and integrated virtual reality apps for client projects.',
    //             achievements: ['Enhanced immersive experience offerings for multiple clients.'],
    //           },
    //         ],
    //         education: [
    //           {
    //             institution: 'National Institute of Technology, Nagpur',
    //             degree: 'B.Tech',
    //             fieldOfStudy: '',
    //             startDate: '2013',
    //             endDate: '2017',
    //             description: '',
    //           },
    //           {
    //             institution: 'Cotton College, Assam',
    //             degree: '12th',
    //             fieldOfStudy: '',
    //             startDate: '2010',
    //             endDate: '2012',
    //             description: '',
    //           },
    //         ],
    //         projects: [
    //           {
    //             name: 'Pixel Streaming Demo',
    //             description:
    //               'Built a WebRTC-based product enabling instant interactivity with 3D apps off-device using Node.js, MySQL, React & AWS. Achieved near-zero download time and low latency with autoscaling to handle real-time traffic surges.',
    //             technologies: ['WebRTC', 'Node.js', 'MySQL', 'React', 'AWS'],
    //             startDate: '',
    //             endDate: '',
    //           },
    //         ],
    //         skills: [
    //           'Node.js',
    //           'NestJS',
    //           'Express',
    //           'Golang',
    //           'MySQL',
    //           'PostgreSQL',
    //           'MongoDB',
    //           'Elasticsearch',
    //           'Redis',
    //           'Aerospike',
    //           'Pub-sub',
    //           'Queues',
    //           'Mailing',
    //           'Notifications',
    //           'Payment Gateways',
    //           'PayU',
    //           'Razorpay',
    //           'GitHub Copilot',
    //           'Cursor',
    //           'Windsurf',
    //           'MCP Servers',
    //           'Postgres',
    //           'Azure',
    //           'AWS',
    //           'Gitlab',
    //           'Context7',
    //           'EC2',
    //           'ECS',
    //           'S3',
    //           'Pipelines',
    //           'AKS',
    //           'Blob Storage',
    //           'CI/CD',
    //           'Build Automation',
    //           'System Design',
    //           'Microservices',
    //           'Automation',
    //           'DevOps',
    //           'Backend Development',
    //         ],
    //       },
    //     },
    //     {
    //       jobUrl:
    //         'https://stripe.com/jobs/listing/software-engineer-operations-platform/7108247?gh_src=73vnei',
    //       coverLetter:
    //         "Dear Hiring Manager,\n\nI am writing to express my interest in the Software Engineer, Operations position at Stripe. With over eight years of experience as a Senior Software Engineer, I have honed my skills in backend development, system design, and scalable architectures. My passion for building impactful products aligns perfectly with Stripe's mission to increase the GDP of the internet.\n\nAt Innovaccer, Noida, I led cross-functional teams and built scalable backend systems that orchestrated multi-channel healthcare marketing campaigns across multiple clients. My work resulted in a 25% boost in engagement through API integrations with SBI and RBL for bank offers.\n\nDuring my tenure at Bajaj Finserv Health, Pune, I migrated monolithic systems to microservices architecture using Kafka and Azure Service Bus. This led to a 30% reduction in deployment time, improved scalability by 20%, cut downteime by 12%, and increased throughput by 15%.\n\nMy experience at BookMyShow, Mumbai, involved delivering the BMS Play Credit Card with RBL Bank, meeting RBI mandate card tokenization requirements. I also led backend and CMS development for BMS offers using Node.js and Golang, which improved efficiency by 20%, accelerated rollouts by 15%, enhanced reliability by 30%, and reduced latency by 20%.\n\nAt Terribly Tiny Tales, Mumbai, I developed backend applications with Node.js, MySQL, Redis, and Elasticsearch, designing a subscription-based payment system using Razorpay for recurring billing. My work resulted in improved performance metrics across the board.\n\nI am proficient in JavaScript (React) & Ruby, strong written and verbal communicator, and thrive on ambiguity, autonomy, and responsibility. I look forward to contributing my skills and passion towards Stripe's mission of empowering businesses to accept payments, grow their revenue, and accelerate new business opportunities.\n\nThank you for considering my application. I am excited about the opportunity to join Stripe and contribute to its success.\n\nSincerely,\nMervej Raj",
    //       resumePath:
    //         '/Users/mervej.raj/Documents/Projects/Personal/job-agent/src/data/resumes/5.pdf',
    //       applyLink:
    //         'https://stripe.com/jobs/listing/software-engineer-operations-platform/7108247/apply?gh_src=73vnei',
    //       resumeText:
    //         '\n\nMervej Raj\n«\nGitlab|\nï\nLinkedIn|\n#\nmervejraj@gmail.com|\nH\n+91 97645 77845\nSummary\nSenior Software Engineer with 8+ years of experience in backend development,  system design,  and scalable\narchitectures.   Expert  in  building  high-performance,  event-driven  microservices  and  leading  cross-functional\nteams.  Strong advocate for automation, DevOps integration, and clean, maintainable code.\nWork Experience\nInnovaccer, Noida — Software EngineerSep 2025 – Present\n–  Builtscalable backend systemsfor  the  Cured  team  to  orchestratemulti-channel healthcare mar-\nketing campaigns,  implementingaudience segmentation,template management,  andreal-time\nanalytics APIsthat enable automated outreach viaSMS, email, and IVRacross multiple clients.\nBajaj Finserv Health, Pune — Principal Software EngineerMar 2023 – Sep 2025\n–  Migratedmonolith to microservicesandmonorepo architecturewithKafkaandAzure Service\nBus— reducing deployment time by30%, improving scalability by20%, cutting downtime by12%, and\nincreasing throughput by15%.\n–  Createdend-to-end payment reconciliation systemachieving100% transaction tracking accuracy\nand50% faster reconciliation.  Improved payment success to95%and payout success to99%.\n–  Led engineering team, mentoring onarchitecture, delivery, andcross-functional collaboration.\nBookMyShow, Mumbai — Software Development Engineer IIJul 2021 – Mar 2023\n–  DeliveredBMS Play Credit CardwithRBL Bank,RBI mandate card tokenisation,  andAPI\nintegrationswith SBI and RBL for bank offers, boosting engagement by25%.\n–  Builtbackend and CMSfor BMS offers withAPI governanceinNode.jsandGolang— improving\nefficiency  by20%,  accelerating  rollouts  by15%,  enhancing  reliability  by30%,  and  reducing  latency  by\n20%.\nTerribly Tiny Tales, Mumbai — Senior Software EngineerApr 2019 – Jul 2021\n–  Developedbackend applicationswithNode.js, MySQL, Redis,  andElasticsearch,  and  designed\nsubscription-based payment systemusingRazorpaywith recurring billing — improving performance\nby25%.\nLivelike, Gurugram — Software DeveloperJun 2017 – Mar 2019\n–  Developed  and  integratedvirtual reality apps,  enhancing  immersive  experience  offerings  for  multiple\nclients.\nPersonal Projects\nPixel Streaming Demo\nBuilt a WebRTC-based product enabling instant interactivity with 3D apps off-device using Node.js, MySQL,\nReact & AWS. Achieved near-zero download time and low latency, with autoscaling to handle real-time traffic\nsurges.\nEducation\n2013 – 2017    B.Tech, National Institute of Technology, Nagpur\n2010 – 2012    12th, Cotton College, Assam\nSkills & Highlights\nProgrammingNode.js (NestJS, Express) — 6+ yrs; Golang — 4+ yrs\nDatabasesMySQL, PostgreSQL, MongoDB, Elasticsearch, Redis, Aerospike\nFrameworks / ToolsPub-sub, Queues, Mailing, Notifications, Payment Gateways (PayU, Razorpay etc)\nAI & AutomationAI Tools (GitHub Copilot, Cursor, Windsurf), MCP Servers (Postgres, Azure ,AWS,\nGitlab, Context7 etc)\nDevOps / CloudAWS (EC2, ECS, S3), Azure (Pipelines, AKS, Blob Storage), CI/CD Design, Build\nAutomation',
    //       structuredResume: {
    //         profileDetails: {
    //           name: 'Mervej Raj',
    //           email: 'mervejraj@gmail.com',
    //           phone: '+91 97645 77845',
    //           location: 'India',
    //           linkedin: 'https://www.linkedin.com/in/mervejraj/',
    //           github: 'https://gitlab.com/users/Mervej',
    //           website: '',
    //         },
    //         summary:
    //           'Senior Software Engineer with 8+ years of experience in backend development, system design, and scalable architectures. Expert in building high-performance, event-driven microservices and leading cross-functional teams. Strong advocate for automation, DevOps integration, and clean, maintainable code.',
    //         experience: [
    //           {
    //             company: 'Innovaccer',
    //             role: 'Software Engineer',
    //             startDate: '09/2025',
    //             endDate: 'Present',
    //             location: 'Noida',
    //             description:
    //               'Built scalable backend systems for the Cured team to orchestrate multi-channel healthcare marketing campaigns.',
    //             achievements: [
    //               'Implemented audience segmentation, template management, and real-time analytics APIs.',
    //               'Enabled automated outreach via SMS, email, and IVR across multiple clients.',
    //             ],
    //           },
    //           {
    //             company: 'Bajaj Finserv Health',
    //             role: 'Principal Software Engineer',
    //             startDate: '03/2023',
    //             endDate: '09/2025',
    //             location: 'Pune',
    //             description:
    //               'Led migration to microservices and designed end-to-end payment reconciliation systems.',
    //             achievements: [
    //               'Migrated monolith to microservices and monorepo architecture with Kafka and Azure Service Bus, improving scalability and reducing downtime.',
    //               'Created payment reconciliation system achieving 100% transaction tracking accuracy and 50% faster reconciliation.',
    //               'Led engineering team, mentoring on architecture and delivery.',
    //             ],
    //           },
    //           {
    //             company: 'BookMyShow',
    //             role: 'Software Development Engineer II',
    //             startDate: '07/2021',
    //             endDate: '03/2023',
    //             location: 'Mumbai',
    //             description:
    //               'Developed banking integrations and backend systems for offers and payment-related services.',
    //             achievements: [
    //               'Delivered BMS Play Credit Card integration with RBL Bank and RBI mandate tokenization.',
    //               'Built backend and CMS for BMS offers with API governance in Node.js and Golang.',
    //             ],
    //           },
    //           {
    //             company: 'Terribly Tiny Tales',
    //             role: 'Senior Software Engineer',
    //             startDate: '04/2019',
    //             endDate: '07/2021',
    //             location: 'Mumbai',
    //             description:
    //               'Developed backend systems and payment solutions for digital content subscriptions.',
    //             achievements: [
    //               'Designed subscription-based payment system using Razorpay with recurring billing.',
    //               'Improved performance by 25% using Node.js, MySQL, Redis, and Elasticsearch.',
    //             ],
    //           },
    //           {
    //             company: 'Livelike',
    //             role: 'Software Developer',
    //             startDate: '06/2017',
    //             endDate: '03/2019',
    //             location: 'Gurugram',
    //             description: 'Developed and integrated virtual reality apps for client projects.',
    //             achievements: ['Enhanced immersive experience offerings for multiple clients.'],
    //           },
    //         ],
    //         education: [
    //           {
    //             institution: 'National Institute of Technology, Nagpur',
    //             degree: 'B.Tech',
    //             fieldOfStudy: '',
    //             startDate: '2013',
    //             endDate: '2017',
    //             description: '',
    //           },
    //           {
    //             institution: 'Cotton College, Assam',
    //             degree: '12th',
    //             fieldOfStudy: '',
    //             startDate: '2010',
    //             endDate: '2012',
    //             description: '',
    //           },
    //         ],
    //         projects: [
    //           {
    //             name: 'Pixel Streaming Demo',
    //             description:
    //               'Built a WebRTC-based product enabling instant interactivity with 3D apps off-device using Node.js, MySQL, React & AWS. Achieved near-zero download time and low latency with autoscaling to handle real-time traffic surges.',
    //             technologies: ['WebRTC', 'Node.js', 'MySQL', 'React', 'AWS'],
    //             startDate: '',
    //             endDate: '',
    //           },
    //         ],
    //         skills: [
    //           'Node.js',
    //           'NestJS',
    //           'Express',
    //           'Golang',
    //           'MySQL',
    //           'PostgreSQL',
    //           'MongoDB',
    //           'Elasticsearch',
    //           'Redis',
    //           'Aerospike',
    //           'Pub-sub',
    //           'Queues',
    //           'Mailing',
    //           'Notifications',
    //           'Payment Gateways',
    //           'PayU',
    //           'Razorpay',
    //           'GitHub Copilot',
    //           'Cursor',
    //           'Windsurf',
    //           'MCP Servers',
    //           'Postgres',
    //           'Azure',
    //           'AWS',
    //           'Gitlab',
    //           'Context7',
    //           'EC2',
    //           'ECS',
    //           'S3',
    //           'Pipelines',
    //           'AKS',
    //           'Blob Storage',
    //           'CI/CD',
    //           'Build Automation',
    //           'System Design',
    //           'Microservices',
    //           'Automation',
    //           'DevOps',
    //           'Backend Development',
    //         ],
    //       },
    //     },
    //   ],
    //   {
    //     name: 'Mervej Raj',
    //     email: 'mervejraj@gmail.com',
    //     phone: '+91 97645 77845',
    //     location: 'India',
    //     linkedin: 'https://www.linkedin.com/in/mervejraj/',
    //     github: 'https://gitlab.com/users/Mervej',
    //     experience:
    //       'Senior Software Engineer with 8+ years of experience in backend development, system design, and scalable architectures. Expert in building high-performance, event-driven microservices and leading cross-functional teams. Strong advocate for automation, DevOps integration, and clean, maintainable code.',
    //     skills: [
    //       'Node.js',
    //       'NestJS',
    //       'Express',
    //       'Golang',
    //       'MySQL',
    //       'PostgreSQL',
    //       'MongoDB',
    //       'Elasticsearch',
    //       'Redis',
    //       'Aerospike',
    //       'Pub-sub',
    //       'Queues',
    //       'Mailing',
    //       'Notifications',
    //       'Payment Gateways',
    //       'PayU',
    //       'Razorpay',
    //       'GitHub Copilot',
    //       'Cursor',
    //       'Windsurf',
    //       'MCP Servers',
    //       'Postgres',
    //       'Azure',
    //       'AWS',
    //       'Gitlab',
    //       'Context7',
    //       'EC2',
    //       'ECS',
    //       'S3',
    //       'Pipelines',
    //       'AKS',
    //       'Blob Storage',
    //       'CI/CD',
    //       'Build Automation',
    //       'System Design',
    //       'Microservices',
    //       'Automation',
    //       'DevOps',
    //       'Backend Development',
    //     ],
    //     achievements: [],
    //     expectedCTC: '65,00,000',
    //     currentCTC: '50,00,000',
    //   }
    // );
  }

  async close() {
    const headless = process.env.BROWSER_HEADLESS === 'true';
    if (this.browser && headless) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async createPage(): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    const page = await this.browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    return page;
  }

  private async navigateToJobUrl(page: Page, jobUrl: string): Promise<void> {
    console.log(`[DEV] Navigating to job URL: ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000); // Allow extra time for dynamic content
  }

  private async findApplicationLink(
    page: Page,
    explicitApplyLink?: string
  ): Promise<string | null> {
    // If an explicit apply link is provided, we try it first
    if (explicitApplyLink) {
      console.log(`[DEV] Using provided apply link: ${explicitApplyLink}`);
      return explicitApplyLink;
    }

    console.log('[DEV] Searching for application link on the page...');

    // Strategy 1: Look for buttons or links with typical apply text
    const applySelectors = [
      'a[href*="apply"]',
      'a[href*="jobs"]',
      'a[href*="careers"]',
      'button:has-text("Apply")',
      'button:has-text("Apply Now")',
      'button:has-text("Submit Application")',
      'a:has-text("Apply")',
      'a:has-text("Apply Now")',
      'a:has-text("Submit Application")',
    ];

    for (const selector of applySelectors) {
      const element = await page.$(selector);
      if (element) {
        const href = await element.getAttribute('href');
        if (href) {
          const url = new URL(href, page.url()).toString();
          console.log(`[DEV] Found application link via selector ${selector}: ${url}`);
          return url;
        }
      }
    }

    // Strategy 1b: JS-navigation apply buttons (no href) — click the first visible button/link
    // whose text/aria-label contains "apply" and capture the resulting URL.
    const jsApplyBtn = await page.evaluateHandle(() => {
      const candidates = [...document.querySelectorAll('button, a, [role="button"]')];
      return candidates.find(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        return (
          !el.getAttribute('href') &&  // skip anchors (handled above)
          /\bapply\b/.test(text + ' ' + aria)
        );
      }) || null;
    });
    const jsApplyEl = jsApplyBtn.asElement();
    if (jsApplyEl) {
      const beforeUrl = page.url();
      await jsApplyEl.click();
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const afterUrl = page.url();
      if (afterUrl !== beforeUrl) {
        console.log(`[DEV] JS-button click navigated to: ${afterUrl}`);
        return afterUrl;
      }
    }

    // Strategy 2: Check all iframes — whichever one has the most form fields is the application form.
    // This is ATS-agnostic: no need to whitelist Workable / Greenhouse / Lever / etc. by domain.
    const frameCandidates = page.mainFrame().childFrames();
    let bestFrameUrl: string | null = null;
    let bestCount = 2; // require at least 3 fields to qualify
    for (const frame of frameCandidates) {
      const count = await frame.evaluate(() =>
        document.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
        ).length
      ).catch(() => 0);
      if (count > bestCount) {
        bestCount = count;
        bestFrameUrl = frame.url();
      }
    }
    if (bestFrameUrl) {
      console.log(`[DEV] Found application iframe with ${bestCount} form fields: ${bestFrameUrl}`);
      return bestFrameUrl;
    }

    console.log('[DEV] Could not automatically determine application link.');
    return null;
  }

  /**
   * Forcefully removes any DOM overlay/backdrop elements that block pointer events.
   * Covers: Workable cookie-consent, Evergreen modals, generic GDPR overlays.
   */
  private async removeBlockingOverlays(page: Page): Promise<void> {
    const removed = await page.evaluate(() => {
      const selectors = [
        // Workable cookie consent
        '[data-ui="backdrop"]',
        '[data-ui="cookie-consent"]',
        '[aria-label="Cookie Consent"]',
        // Evergreen / Segment UI modals
        '[data-role="backdrop"]',
        '[data-role="modal-wrapper"]',
        '[data-evergreen-dialog-backdrop]',
        // Generic
        '.cookie-consent', '#cookie-consent',
        '.gdpr-overlay', '#gdpr-overlay',
        '.modal-backdrop', '.overlay',
      ];
      let count = 0;
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => {
          el.remove();
          count++;
        });
      }
      // Restore scroll if body was locked
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      return count;
    });
    if (removed > 0) {
      console.log(`[DEV] Removed ${removed} blocking overlay element(s) via JS.`);
    }
  }

  /**
   * Looks for "Import resume from" / "autofill" type buttons on the form
   * and uses them to let the ATS parse the resume and pre-populate fields.
   *
   * Workable flow: click [data-ui="autofill-button"] → modal opens with a
   * hidden file input [data-ui="autofill-computer"] → setInputFiles on it →
   * Workable parses the PDF and auto-fills Personal Info fields.
   */
  private async tryResumeAutofill(page: Page, resumePath: string): Promise<void> {
    // Strategy 1: Workable-specific autofill button + hidden file input
    const autofillBtn = await page.$('[data-ui="autofill-button"] button, [data-ui="autofill-button"]');
    if (autofillBtn) {
      console.log('[Autofill] Found Workable autofill button, clicking...');
      await autofillBtn.scrollIntoViewIfNeeded();
      await autofillBtn.click();
      await page.waitForTimeout(1500);

      // The modal contains a hidden file input for "My computer"
      const fileInput = await page.$('input[data-ui="autofill-computer"], input#file-upload[type="file"]');
      if (fileInput) {
        console.log('[Autofill] Setting resume on autofill file input...');
        await fileInput.setInputFiles(resumePath);
        // Wait for Workable to parse the resume and populate fields
        await page.waitForTimeout(4000);
        console.log('[Autofill] Resume uploaded via autofill — fields should be pre-populated.');
        return;
      }
      console.log('[Autofill] Autofill modal opened but file input not found.');
      return;
    }

    // Strategy 2: Generic patterns (other ATSes)
    const autofillPatterns = [
      /fill.*(from|with).*(resume|cv)/i,
      /autofill.*(resume|cv|profile)/i,
      /import.*(resume|cv|profile)/i,
      /parse.*(resume|cv)/i,
    ];

    const btns = await page.$$('button, a[role="button"], [role="button"]');
    for (const btn of btns) {
      const text = ((await btn.textContent()) || '').trim();
      const ariaLabel = (await btn.getAttribute('aria-label')) || '';
      const combined = `${text} ${ariaLabel}`;
      if (autofillPatterns.some((re) => re.test(combined))) {
        console.log(`[Autofill] Found autofill button: "${text || ariaLabel}"`);
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        await page.waitForTimeout(2000);
        return;
      }
    }
    console.log('[Autofill] No autofill-from-resume button found.');
  }

  private async navigateToApplicationPage(page: Page, applyLink: string): Promise<void> {
    console.log(`[DEV] Navigating to application link: ${applyLink}`);
    await page.goto(applyLink, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }

  private async waitForForm(page: Page): Promise<void> {
    console.log('[DEV] Waiting for form to appear...');
    await page.waitForTimeout(2000);

    // Wait for any form element or a known application container.
    await page.waitForSelector(
      'form, [role="form"], .application-form, .apply-form, input[type="text"], input[type="email"], textarea',
      { timeout: 15000 }
    );

    // Dismiss cookie consent / GDPR dialogs that would block all subsequent clicks
    await this.dismissCookieConsent(page);
  }

  private async dismissCookieConsent(page: Page): Promise<void> {
    const consentSelectors = [
      // Workable-specific
      '[data-ui="cookie-consent-accept"]',
      '[data-ui="cookie-consent-decline"]',
      // Generic ARIA / data attributes used by many ATSes and CMPs
      '[data-ui="cookie-consent"] button',
      '[aria-label="Cookie Consent"] button',
      // Common CMP button text patterns
      'button:has-text("Accept all")',
      'button:has-text("Accept All")',
      'button:has-text("Accept All Cookies")',
      'button:has-text("Allow all")',
      'button:has-text("Allow All")',
      'button:has-text("Agree")',
      'button:has-text("I agree")',
      'button:has-text("OK")',
      'button:has-text("Got it")',
    ];

    for (const sel of consentSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click();
          console.log(`[DEV] Dismissed cookie consent via: ${sel}`);
          await page.waitForTimeout(600);
          break;
        }
      } catch {
        // selector not found — try next
      }
    }

    // Forcefully remove any remaining backdrop/consent overlay via JS
    // This handles cases where the button click didn't work or the overlay reappeared
    await this.removeBlockingOverlays(page);
  }

  private async getAllFrames(page: Page): Promise<Frame[]> {
    const frames: Frame[] = [];

    // Recursively gather all descendant frames
    const collectChildFrames = (frame: Frame) => {
      for (const child of frame.childFrames()) {
        frames.push(child);
        collectChildFrames(child);
      }
    };
    collectChildFrames(page.mainFrame());

    return frames;
  }

  /**
   * Detects which frame contains the actual application form by finding the frame
   * with the most visible form controls. Falls back to main frame.
   * This makes the filler work whether the form is on the main page (Workable direct URL,
   * Greenhouse direct URL) or embedded in an iframe (company careers pages that embed ATSes).
   */
  private async getFormFrame(page: Page): Promise<Frame> {
    const allFrames = [page.mainFrame(), ...(await this.getAllFrames(page))];
    let bestFrame = page.mainFrame();
    let maxControls = 0;

    for (const frame of allFrames) {
      try {
        const count = await frame.evaluate(() =>
          document.querySelectorAll(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]),' +
            'textarea,select'
          ).length
        );
        if (count > maxControls) {
          maxControls = count;
          bestFrame = frame;
        }
      } catch { /* cross-origin or detached */ }
    }

    if (bestFrame !== page.mainFrame()) {
      console.log(`[Orchestrator] Form detected in iframe: ${bestFrame.url()} (${maxControls} controls)`);
    } else {
      console.log(`[Orchestrator] Form in main frame (${maxControls} controls)`);
    }
    return bestFrame;
  }

  private async parseFormFields(page: Page): Promise<ParsedField[]> {
    console.log('[DEV] Parsing all form fields across page and frames...');

    const allFields: ParsedField[] = [];

    // Parse main page — pass mainFrame() so fields get a valid frame reference
    await this.parseFieldsFromContext(page, allFields, 'main page', page.mainFrame());

    // Parse all frames
    const frames = await this.getAllFrames(page);
    for (const frame of frames) {
      try {
        const frameName = frame.name() || frame.url() || 'unnamed frame';
        await this.parseFieldsFromContext(frame, allFields, frameName, frame);
      } catch (error) {
        console.log(`[DEV] Error parsing fields in frame ${frame.name() || frame.url()}:`, error);
      }
    }

    console.log(
      '[DEV] Parsed fields:',
      allFields.map((f) => ({
        name: f.fieldName,
        label: f.label,
        placeholder: f.placeholder,
        question: f.questionText,
        autocomplete: f.autocomplete,
        selector: f.selector,
        type: f.inputType,
        required: f.required,
      }))
    );

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
    frame?: Frame
  ): Promise<void> {
    try {
      console.log(`[DEV] Parsing form fields in ${contextName}...`);

      const contextFields = await context.evaluate(() => {
        const fields: ParsedField[] = [];

        // Utility: robust visibility check to avoid capturing hidden/template fields
        const isVisible = (el: HTMLElement): boolean => {
          if (!el) return false;
          if (el.hasAttribute('hidden')) return false;
          if (el.getAttribute('aria-hidden') === 'true') return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return true;
        };

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
            // contenteditable divs (used by Workable/Lever for summary/rich-text fields)
            'div[contenteditable="true"]',
            // selects (including hidden ones used as underlying control in custom dropdowns)
            'select',
            // booleans
            'input[type="checkbox"]',
            'input[type="radio"]',
            // file uploads (resume, CV, cover letter)
            'input[type="file"]',
          ].join(', ')
        );

        const makeUniqueSelector = (el: Element): string => {
          const tag = el.tagName.toLowerCase();
          const id = (el as HTMLElement).id;
          const name = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).name;
          const type = (el as HTMLInputElement).type;
          const placeholder = (el as HTMLInputElement | HTMLTextAreaElement).placeholder;
          const dataId = el.getAttribute('data-id') || el.getAttribute('data-field') || el.getAttribute('aria-label');

          let sel = tag;
          if (tag === 'div' && el.getAttribute('contenteditable') === 'true') {
            sel = 'div[contenteditable="true"]';
          } else {
            if (type && tag === 'input') sel += `[type="${type}"]`;
            if (name) sel += `[name="${name}"]`;
            if (id) sel += `[id="${id}"]`;
            if (!name && !id && placeholder) sel += `[placeholder="${placeholder}"]`;
            if (!name && !id && !placeholder && dataId) sel += `[aria-label="${dataId}"]`;
          }

          if (sel === tag || sel === 'div[contenteditable="true"]') {
            // fallback to nth-of-type within parent
            const parent = el.parentElement;
            if (parent) {
              const queryTag = tag === 'div' ? 'div[contenteditable="true"]' : tag;
              const siblings = Array.from(parent.querySelectorAll(queryTag));
              const idx = siblings.indexOf(el);
              if (idx >= 0) sel += `:nth-of-type(${idx + 1})`;
            }
          }
          return sel;
        };

        const getLabelFor = (input: Element): string => {
          const el = input as HTMLElement;

          // 1. aria-label has highest priority
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel && ariaLabel.trim().length > 0) {
            return ariaLabel.trim();
          }

          // 2. aria-labelledby -> text of referenced element(s)
          const ariaLabelledBy = el.getAttribute('aria-labelledby');
          if (ariaLabelledBy) {
            const ids = ariaLabelledBy.split(/\s+/);
            const parts: string[] = [];
            ids.forEach((id) => {
              const labelledEl = document.getElementById(id);
              const text = labelledEl?.textContent?.trim();
              if (text) parts.push(text);
            });
            if (parts.length > 0) {
              return parts.join(' ');
            }
          }

          // 3. explicit for="id"
          const id = (input as HTMLInputElement).id;
          if (id) {
            const forLabel = document.querySelector(`label[for="${id}"]`);
            if (forLabel) return forLabel.textContent?.trim() || '';
          }

          // 4. wrapping label
          const parentLabel = input.closest('label');
          if (parentLabel) return parentLabel.textContent?.trim() || '';

          // 5. previous sibling label in same group
          const group = input.closest('.form-group, .field, .form-row, .row, div');
          if (group) {
            const maybeLabel = group.querySelector('label');
            if (maybeLabel) return maybeLabel.textContent?.trim() || '';
          }

          // 6. fallback to placeholder if it's descriptive
          const placeholder =
            (input as HTMLInputElement | HTMLTextAreaElement).placeholder ||
            el.getAttribute('data-placeholder');
          if (placeholder && placeholder.trim().length > 0) {
            return placeholder.trim();
          }

          return '';
        };

        // Try to find a "question" or prompt text that appears near/above the input
        const getQuestionText = (input: Element): string => {
          const isQuestionLike = (el: Element | null, textOverride?: string): boolean => {
            if (!el) return false;
            const tag = el.tagName.toLowerCase();
            // Skip the input element itself and form controls
            if (['input', 'select', 'textarea', 'button', 'form'].includes(tag)) return false;
            const text = (textOverride ?? (el.textContent || '')).trim();
            if (!text) return false;
            // Ignore very short texts (e.g., "*", ":" etc.) and very long texts (likely not a question)
            if (text.length < 3 || text.length > 300) return false;
            // Ignore if it's mostly numbers or special chars
            if (/^[\d\s\-\+\*\.]+$/.test(text)) return false;
            return true;
          };

          const extractText = (el: Element): string => {
            // Get direct text content, ignoring nested form controls
            let text = '';
            for (const node of Array.from(el.childNodes)) {
              if (node.nodeType === Node.TEXT_NODE) {
                text += (node.textContent || '').trim() + ' ';
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                const childEl = node as Element;
                const tag = childEl.tagName.toLowerCase();
                // Skip form controls
                if (!['input', 'select', 'textarea', 'button'].includes(tag)) {
                  const childText = extractText(childEl);
                  if (childText) text += childText + ' ';
                }
              }
            }
            return text.trim();
          };

          // Strategy 0: if there's an associated label that looks like a question, reuse it
          const directLabel = getLabelFor(input);
          if (directLabel && /[:?]$/.test(directLabel.trim())) {
            return directLabel.trim();
          }

          // Strategy 1: Check previous siblings recursively
          const checkSiblings = (el: Element | null, depth: number): string => {
            if (!el || depth > 3) return '';

            let prev: Element | null = (el as HTMLElement).previousElementSibling;
            let hops = 0;
            while (prev && hops < 10) {
              const tag = prev.tagName.toLowerCase();

              // Check the sibling itself
              if (!['input', 'select', 'textarea', 'button', 'form'].includes(tag)) {
                const text = extractText(prev);
                if (isQuestionLike(prev, text)) {
                  return text;
                }
              }

              // Check children of the sibling (common pattern: <div><p>Question?</p><input/></div>)
              const children = prev.querySelectorAll(
                'p, span, div, label, h1, h2, h3, h4, h5, h6, legend, strong, b, em'
              );
              for (const child of Array.from(children)) {
                const childText = extractText(child);
                if (isQuestionLike(child, childText)) {
                  return childText;
                }
              }

              prev = prev.previousElementSibling;
              hops++;
            }

            // Recurse up to parent
            if (el.parentElement) {
              return checkSiblings(el.parentElement, depth + 1);
            }

            return '';
          };

          // Strategy 2: Check parent's text content (but exclude the input itself)
          const checkParent = (): string => {
            const parent = input.parentElement;
            if (parent) {
              const parentClone = parent.cloneNode(true) as Element;
              // Try to remove original input from clone
              const inputId = (input as HTMLElement).id;
              const inputName = (input as HTMLInputElement).name;
              const inputClone =
                (inputId && parentClone.querySelector(`#${inputId}`)) ||
                (inputName &&
                  parentClone.querySelector(
                    `input[name="${inputName}"], textarea[name="${inputName}"], select[name="${inputName}"]`
                  ));
              if (inputClone) {
                inputClone.remove();
              }
              const text = extractText(parentClone);
              if (isQuestionLike(parentClone, text)) {
                return text;
              }
            }
            return '';
          };

          // Strategy 3: Look in form group container
          const checkFormGroup = (): string => {
            const group = input.closest(
              '.form-group, .field, .form-row, .row, .question, .form-item, [class*="field"], [class*="form"], [class*="question"], form, section, article, li, [role="group"]'
            );
            if (group && group !== input) {
              // Walk through all nodes in the group
              const walk = (node: Node): string => {
                if (node === input) return '';
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const el = node as Element;
                  const tag = el.tagName.toLowerCase();
                  if (
                    !['input', 'select', 'textarea', 'button', 'form', 'script', 'style'].includes(
                      tag
                    )
                  ) {
                    const text = extractText(el);
                    if (isQuestionLike(el, text)) {
                      // Try to ensure it appears before the input in DOM order
                      try {
                        const range = document.createRange();
                        range.setStart(el, 0);
                        range.setEnd(input, 0);
                        if (!range.collapsed) {
                          return text;
                        }
                      } catch {
                        return text;
                      }
                    }
                  }
                  // Check children
                  for (const child of Array.from(el.childNodes)) {
                    const result = walk(child);
                    if (result) return result;
                  }
                }
                return '';
              };

              // Start from group's children
              for (const child of Array.from(group.childNodes)) {
                const result = walk(child);
                if (result) return result;
              }
            }
            return '';
          };

          // Try strategies in order
          const result1 = checkSiblings(input as HTMLElement, 0);
          if (result1) return result1;

          const result2 = checkParent();
          if (result2) return result2;

          const result3 = checkFormGroup();
          if (result3) return result3;

          return '';
        };

        const seen = new Set<Element>();

        formElements.forEach((element, index) => {
          if (!(element instanceof HTMLElement)) return;
          if (seen.has(element)) return;
          seen.add(element);

          // Skip disabled or non-visible controls (except file inputs which user might need to see)
          const tagName = element.tagName.toLowerCase();
          const inputEl = element as HTMLInputElement;
          const textAreaEl = element as HTMLTextAreaElement;
          const selectEl = element as HTMLSelectElement;

          const type = tagName === 'input' ? inputEl.type || 'text' : tagName;

          if (
            element.hasAttribute('disabled') ||
            element.getAttribute('aria-disabled') === 'true'
          ) {
            return;
          }

          // Allow hidden <select> elements through — they are often the underlying native
          // control behind a custom dropdown (e.g. react-select, Workable notice period).
          const isHiddenSelect = tagName === 'select' && !isVisible(element);
          if (type !== 'file' && !isHiddenSelect && !isVisible(element)) {
            return;
          }

          // Skip hidden, submit, button inputs (but keep file inputs for resume/cover letter)
          if (
            tagName === 'input' &&
            (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset')
          ) {
            return;
          }

          const required = !!(
            (tagName === 'input' && inputEl.required) ||
            (tagName === 'textarea' && textAreaEl.required) ||
            (tagName === 'select' && selectEl.required) ||
            element.getAttribute('aria-required') === 'true'
          );

          const isContentEditable = tagName === 'div' && element.getAttribute('contenteditable') === 'true';

          const placeholder =
            tagName === 'select' || isContentEditable
              ? ''
              : inputEl.placeholder ||
              textAreaEl.placeholder ||
              element.getAttribute('data-placeholder') ||
              '';

          const name = (inputEl.name || textAreaEl.name || selectEl.name || '').trim();
          const id = (inputEl.id || textAreaEl.id || selectEl.id || '').trim();
          const autocomplete = (
            inputEl.autocomplete ||
            textAreaEl.autocomplete ||
            selectEl.autocomplete ||
            ''
          ).trim();
          const label = getLabelFor(element);
          const questionText = getQuestionText(element);

          // Capture the nearest ancestor section/region heading so we can distinguish
          // e.g. "Summary" inside "Profile" vs "Summary" inside "Details"/"Questions"
          const getSectionHeading = (el: Element): string => {
            let ancestor = el.parentElement;
            while (ancestor) {
              const role = ancestor.getAttribute('role');
              const tag = ancestor.tagName.toLowerCase();
              if (role === 'region' || tag === 'section' || tag === 'fieldset') {
                // Look for the first heading inside this region
                const heading = ancestor.querySelector('h1, h2, h3, h4, h5, h6, legend, [role="heading"]');
                if (heading) {
                  const text = (heading.textContent || '').trim();
                  if (text) return text.toLowerCase();
                }
              }
              ancestor = ancestor.parentElement;
            }
            return '';
          };
          const sectionHeading = getSectionHeading(element);

          // For radio buttons: if questionText is empty, try to find the question
          // in a broader ancestor search (Workable puts it 4-5 levels up)
          let resolvedQuestionText = questionText;
          if (!resolvedQuestionText && type === 'radio') {
            let ancestor = element.parentElement;
            let depth = 0;
            while (ancestor && depth < 8) {
              const prevSiblings = [];
              let prev: Element | null = ancestor.previousElementSibling;
              while (prev) {
                prevSiblings.push(prev);
                prev = prev.previousElementSibling;
              }
              for (const sib of prevSiblings) {
                const txt = (sib.textContent || '').trim();
                if (txt.length > 5 && txt.length < 300 && !/^[\d\s\-\+\*\.]+$/.test(txt)) {
                  resolvedQuestionText = txt;
                  break;
                }
              }
              if (resolvedQuestionText) break;
              ancestor = ancestor.parentElement;
              depth++;
            }
          }

          // Detect combobox inputs: <input role="combobox" aria-haspopup="listbox">
          // These are custom dropdowns (e.g. Workable notice period) — filled via
          // click-to-open + click-option, NOT plain text fill.
          const isCombobox =
            tagName === 'input' &&
            element.getAttribute('role') === 'combobox' &&
            (element.getAttribute('aria-haspopup') === 'listbox' ||
              element.getAttribute('aria-haspopup') === 'true');

          // For combobox inputs, prefer aria-labelledby over other label strategies
          let resolvedLabel = label;
          if (isCombobox && !resolvedLabel) {
            const labelledBy = element.getAttribute('aria-labelledby');
            if (labelledBy) {
              const labelEl = document.getElementById(labelledBy);
              resolvedLabel = labelEl?.textContent?.trim() || '';
            }
          }

          const parsed: ParsedField = {
            selector: makeUniqueSelector(element),
            elementType: isContentEditable ? 'div' : tagName as ParsedField['elementType'],
            inputType: tagName === 'input' ? type : undefined,
            isCombobox: isCombobox || undefined,
            fieldName: name || id || `field_${index}`,
            placeholder: placeholder || undefined,
            label: resolvedLabel || undefined,
            questionText: resolvedQuestionText || undefined,
            autocomplete: autocomplete || undefined,
            sectionHeading: sectionHeading || undefined,
            required,
            currentValue:
              tagName === 'select'
                ? selectEl.value || undefined
                : isContentEditable
                ? (element as HTMLElement).innerText || undefined
                : inputEl.value || textAreaEl.value || undefined,
          };

          if (tagName === 'select') {
            parsed.options = Array.from(selectEl.options).map((opt) => ({
              value: opt.value,
              text: (opt.textContent || '').trim(),
            }));
          }

          // Combobox: options are rendered dynamically (not in DOM until opened),
          // so we can't pre-extract them. Mark as needing listbox interaction.
          // The listbox ID is in aria-owns / aria-controls.
          if (isCombobox) {
            const listboxId =
              element.getAttribute('aria-owns') ||
              element.getAttribute('aria-controls') ||
              '';
            // Store listbox id in selector so filler can find options after opening
            parsed.selector = makeUniqueSelector(element) + (listboxId ? `||listbox:${listboxId}` : '');
          }

          if (type === 'radio') {
            // collect radio options by same name
            const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
            parsed.options = Array.from(radios).map((r) => ({
              value: (r as HTMLInputElement).value,
              text: getLabelFor(r) || (r as HTMLInputElement).getAttribute('value') || '',
            }));
          }

          if (type === 'checkbox' && !parsed.label && placeholder) {
            parsed.label = placeholder;
          }

          // Skip contenteditable divs that have no identifying label/question (likely decorative)
          if (isContentEditable && !parsed.label && !parsed.questionText && !parsed.placeholder) {
            return;
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
    } catch (error) {
      console.log(`[DEV] Error parsing fields in ${contextName}:`, error);
    }
  }

  private getFieldSemanticType(field: ParsedField): string {
    const info = `${field.label || ''} ${field.placeholder || ''} ${field.fieldName} ${field.autocomplete || ''} ${field.questionText || ''}`.toLowerCase();

    if (field.inputType === 'email' || info.includes('email')) return 'email';
    if (field.inputType === 'tel' || info.includes('phone') || info.includes('mobile'))
      return 'phone';
    if (info.includes('first name') || info.includes('firstname') || info.includes('given name'))
      return 'firstName';
    if (info.includes('last name') || info.includes('lastname') || info.includes('surname'))
      return 'lastName';
    if (
      info.includes('full name') ||
      info.includes('your name') ||
      (info.includes('name') &&
        !info.includes('company') &&
        !info.includes('school') &&
        !info.includes('institution') &&
        !info.includes('file') &&
        !info.includes('last') &&
        !info.includes('first'))
    )
      return 'fullName';
    if (info.includes('linkedin')) return 'linkedin';
    if (info.includes('github')) return 'github';
    if (info.includes('portfolio') || info.includes('website')) return 'portfolio';
    if (info.includes('location') || info.includes('city') || info.includes('country'))
      return 'location';
    if (info.includes('resume') || info.includes('cv')) return 'resume';
    if (info.includes('cover letter') || info.includes('motivation letter')) return 'coverLetter';
    // Only treat as profile summary if it's inside a "Profile" section
    // (not a job-specific details/questions section)
    const sectionHeading = (field.sectionHeading || '').toLowerCase();
    const isProfileSection =
      sectionHeading.includes('profile') ||
      sectionHeading.includes('about') ||
      sectionHeading === '';  // no section = top-level, treat as profile
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
    if (
      !isJobSpecificSection &&
      isProfileSection &&
      (info.includes('summary') ||
        info.includes('about you') ||
        info.includes('about yourself') ||
        info.includes('professional profile') ||
        info.includes('bio'))
    )
      return 'summary';
    if (info.includes('experience') || info.includes('years') || info.includes('background'))
      return 'experience';
    if (info.includes('skills') || info.includes('technologies') || info.includes('stack'))
      return 'skills';
    if (info.includes('current ctc') || info.includes('current salary') || info.includes('current compensation') || info.includes('current annual'))
      return 'currentCTC';
    if (info.includes('expected ctc') || info.includes('expected salary') || info.includes('expected compensation') || info.includes('expected annual') || info.includes('salary expectation'))
      return 'expectedCTC';
    if (info.includes('notice period') || info.includes('notice'))
      return 'noticePeriod';
    if (info.includes('work authorization') || info.includes('work permit') || info.includes('visa') || info.includes('authorized to work') || info.includes('legally'))
      return 'workAuthorization';
    if (info.includes('relocat'))
      return 'relocation';
    if (info.includes('gender') || info.includes('pronouns') || info.includes('ethnicity') || info.includes('race') || info.includes('disability') || info.includes('veteran'))
      return 'diversity';

    return 'other';
  }

  private async mapFieldsToData(
    fields: ParsedField[],
    userProfile: UserProfile,
    coverLetter: string,
    resumeText: string,
    structuredResume?: StructuredResume | null
  ): Promise<FieldMapping[]> {
    const mappings: FieldMapping[] = [];

    for (const field of fields) {
      let mappedData: string | undefined;
      let needsAI = false;
      let aiPrompt: string | undefined;

      const info = `${field.label || ''} ${field.placeholder || ''} ${field.fieldName} ${field.autocomplete || ''} ${field.questionText || ''}`.toLowerCase();

      const resumeContext = resumeText || '';
      const semanticType = this.getFieldSemanticType(field);

      // Short-circuit based on semantic type
      switch (semanticType) {
        case 'email':
          mappedData = userProfile.email;
          break;
        case 'phone':
          mappedData = userProfile.phone || '';
          break;
        case 'firstName':
          mappedData = userProfile.name.split(' ')[0];
          break;
        case 'lastName':
          mappedData = userProfile.name.split(' ').slice(1).join(' ');
          break;
        case 'fullName':
          mappedData = userProfile.name;
          break;
        case 'linkedin':
          mappedData = userProfile.linkedin || '';
          break;
        case 'github':
          mappedData = userProfile.github || '';
          break;
        case 'portfolio':
          mappedData = userProfile.github || userProfile.linkedin || '';
          break;
        case 'location':
          mappedData = userProfile.location || '';
          break;
        case 'coverLetter':
          mappedData = coverLetter;
          break;
        case 'currentCTC':
          mappedData = userProfile.currentCTC || '';
          break;
        case 'expectedCTC':
          mappedData = userProfile.expectedCTC || '';
          break;
        case 'noticePeriod':
          mappedData = userProfile.noticePeriod || '';
          break;
        case 'workAuthorization':
          // Default to yes — candidate is applying, implying they are authorized
          mappedData = userProfile.workAuthorization || 'Yes';
          break;
        case 'relocation':
          // Default to yes — always willing to relocate unless profile says otherwise
          mappedData = userProfile.willingToRelocate || 'Yes';
          break;
        case 'diversity':
          // Leave blank — candidate should fill these voluntarily
          mappedData = '';
          break;
        case 'summary': {
          // Build a clean technical context from structured resume — exclude profile details (phone, location, etc.)
          let technicalContext = '';
          if (structuredResume) {
            if (structuredResume.experience?.length) {
              technicalContext += 'Experience:\n' + structuredResume.experience.map(e =>
                `${e.role} at ${e.company} (${e.startDate} – ${e.endDate || 'Present'})${e.description ? ': ' + e.description : ''}${e.achievements?.length ? '\n- ' + e.achievements.join('\n- ') : ''}`
              ).join('\n\n') + '\n\n';
            }
            if (structuredResume.skills?.length) {
              technicalContext += 'Skills: ' + structuredResume.skills.join(', ') + '\n\n';
            }
            if (structuredResume.projects?.length) {
              technicalContext += 'Projects:\n' + structuredResume.projects.map(p =>
                `${p.name}${p.description ? ': ' + p.description : ''}${p.technologies?.length ? ' [' + p.technologies.join(', ') + ']' : ''}`
              ).join('\n') + '\n\n';
            }
          }
          const summaryContext = technicalContext.trim() || resumeContext;
          needsAI = true;
          aiPrompt = `Write a concise 2–3 sentence professional summary in first person, focused entirely on technical expertise, years of experience, and key skills. Do NOT include contact details, location, phone, or links. Base it only on the technical information below.\n\n${summaryContext}`;
          break;
        }
      }

      // If already mapped via semantic type, we can skip further logic
      if (!mappedData) {
        // Resume / CV upload fields will be handled separately by uploadResume
        if (
          info.includes('resume') ||
          info.includes('cv') ||
          (field.inputType === 'file' &&
            (field.fieldName.toLowerCase().includes('resume') ||
              field.fieldName.toLowerCase().includes('cv')))
        ) {
          mappedData = undefined;
          needsAI = false;
        } else if (info.includes('why this role') || info.includes('why do you want')) {
          // Motivation / cover letter style questions
          needsAI = true;
          aiPrompt = `You are helping a candidate answer an application question based on their resume.

Question:
${field.questionText || field.label || 'Explain why you are a good fit for this role.'}

Candidate resume:
${resumeContext}

Write a concise, 2–4 sentence answer in first person, specific and grounded in the resume.`;
        } else if (info.includes('years of experience') || info.includes('experience (years)')) {
          // Try to compute years of experience from structured resume if available
          if (
            structuredResume &&
            structuredResume.experience &&
            structuredResume.experience.length > 0
          ) {
            const now = new Date();
            const earliest = structuredResume.experience[structuredResume.experience.length - 1];
            const extractYear = (dateStr: string | undefined | null): number | null => {
              if (!dateStr) return null;
              const match = dateStr.match(/\b(19|20)\d{2}\b/);
              return match ? parseInt(match[0], 10) : null;
            };
            const startYear = extractYear(earliest.startDate);
            if (startYear) {
              const years = now.getFullYear() - startYear;
              mappedData = String(years);
            } else {
              needsAI = true;
              aiPrompt = `Estimate total years of professional experience from this resume. Return only a number:

${resumeContext}`;
            }
          } else {
            needsAI = true;
            aiPrompt = `Estimate total years of professional experience from this resume. Return only a number:

${resumeContext}`;
          }
        } else if (semanticType === 'skills' || info.includes('skills')) {
          if (structuredResume?.skills && structuredResume.skills.length > 0) {
            mappedData = structuredResume.skills.join(', ');
          } else if (userProfile.skills && userProfile.skills.length > 0) {
            mappedData = userProfile.skills.join(', ');
          } else {
            needsAI = true;
            aiPrompt = `Extract the candidate's key technical and professional skills as a comma-separated list from this resume:

${resumeContext}`;
          }
        } else if (semanticType === 'experience') {
          if (structuredResume?.experience && structuredResume.experience.length > 0) {
            const expText = structuredResume.experience
              .map(
                (exp) =>
                  `${exp.role} at ${exp.company} (${exp.startDate} - ${exp.endDate || 'Present'})`
              )
              .join('; ');
            mappedData = expText;
          } else {
            needsAI = true;
            aiPrompt = `Summarize the candidate's most relevant work experience for this field in 3–4 lines, using first person:

${resumeContext}`;
          }
        } else if (info.includes('current company') || info.includes('employer')) {
          mappedData =
            userProfile.currentCompany || structuredResume?.experience?.[0]?.company || '';
        } else if (
          info.includes('current title') ||
          info.includes('role') ||
          info.includes('position')
        ) {
          mappedData = userProfile.currentRole || structuredResume?.experience?.[0]?.role || '';
        } else if (info.includes('city') || info.includes('location')) {
          mappedData = userProfile.location || '';
        } else if (info.includes('website')) {
          mappedData = userProfile.github || userProfile.linkedin || '';
        }
      }

      const questionForFallback = field.questionText || field.label || '';

      // ── Universal options handling ──────────────────────────────────────────
      // Applies to select, radio, and any field that exposes a fixed list of choices.
      // Goal: mappedData must always end up as an *exact* option text (or AI picks one).
      const validOptions = (field.options || []).filter(
        (o) => o.text && o.text.trim() && !/^(-+|select\.?\.?\.?|choose\.?\.?\.?|please select)$/i.test(o.text.trim())
      );

      if (validOptions.length > 0) {
        if (mappedData) {
          // We have a candidate value — try to match it to an available option
          const v = mappedData.toLowerCase();
          const match = validOptions.find(
            (o) =>
              o.text.toLowerCase() === v ||
              o.text.toLowerCase().includes(v) ||
              v.includes(o.text.toLowerCase())
          );
          if (match) {
            mappedData = match.text; // normalise to exact option text
          } else {
            // Our value doesn't match any option — let AI pick the closest one
            needsAI = true;
            aiPrompt = buildOptionsPrompt(questionForFallback || field.fieldName, validOptions, resumeContext, mappedData);
            mappedData = undefined;
          }
        } else if (!needsAI) {
          // No value yet and no AI prompt — ask AI to pick from the list
          needsAI = true;
          aiPrompt = buildOptionsPrompt(questionForFallback || field.fieldName, validOptions, resumeContext);
        } else if (needsAI && aiPrompt) {
          // AI is already being invoked — append options constraint to the existing prompt
          const optionList = validOptions.map((o) => o.text).join(', ');
          aiPrompt += `\n\nAvailable options (respond with ONLY one of these, exactly as written): ${optionList}`;
        }
      } else if (!mappedData && !needsAI) {
        // No options, no value yet — generic text fallback
        if (questionForFallback.includes('?')) {
          needsAI = true;
          aiPrompt = `You are the candidate filling out a job application.

Question:
${questionForFallback}

Write a concise answer in first person, grounded ONLY in the resume below.

Resume:
${resumeContext}`;
        }
      }

      mappings.push({
        field,
        mappedData,
        needsAI,
        aiPrompt,
      });
    }

    return mappings;
  }

  private async uploadResume(page: Page, resumePath: string): Promise<boolean> {
    const fileInputSelectors = [
      'input[type="file"]',
      'input[name*="resume"]',
      'input[name*="cv"]',
      'input[id*="resume"]',
      'input[id*="cv"]',
      'input[accept*="pdf"]',
      'input[accept*="application/pdf"]',
    ];

    for (const selector of fileInputSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`[DEV] Found file input(s) with selector ${selector}, uploading resume...`);
        for (const element of elements) {
          try {
            await element.setInputFiles(resumePath);
            console.log('[DEV] Resume uploaded successfully.');
            return true;
          } catch (error) {
            console.log('[DEV] Error uploading resume to one of the inputs:', error);
          }
        }
      }
    }

    // If not found on main page, search in frames
    const frames = await this.getAllFrames(page);
    for (const frame of frames) {
      for (const selector of fileInputSelectors) {
        const elements = await frame.$$(selector);
        if (elements.length > 0) {
          console.log(
            `[DEV] Found file input(s) with selector ${selector} in frame ${frame.name() || frame.url()}, uploading resume...`
          );
          for (const element of elements) {
            try {
              await element.setInputFiles(resumePath);
              console.log('[DEV] Resume uploaded successfully in frame.');
              return true;
            } catch (error) {
              console.log('[DEV] Error uploading resume to one of the inputs in frame:', error);
            }
          }
        }
      }
    }

    console.log('[DEV] No suitable resume upload field found.');
    return false;
  }

  private async generateAnswersForAIFields(
    mappings: FieldMapping[],
    resumeText: string
  ): Promise<FieldMapping[]> {
    const aiMappings = mappings.filter((m) => m.needsAI && m.aiPrompt);

    if (aiMappings.length === 0) return mappings;

    // Resume is sent once as system context; each question is asked individually.
    // This keeps each call well within the context window and avoids JSON parsing fragility.
    const systemPrompt = `Candidate resume:\n${resumeText}`;

    console.log(`[AI] Answering ${aiMappings.length} field questions sequentially`);

    for (const mapping of aiMappings) {
      const label = mapping.field.label || mapping.field.fieldName;
      try {
        // Extract the question text from the embedded prompt, or fall back to field metadata
        const prompt = mapping.aiPrompt!;
        const questionMatch = prompt.match(/Question:\s*([\s\S]+?)(?:\nResume:|\nCandidate resume:|$)/);
        const question =
          questionMatch?.[1].trim() ||
          mapping.field.questionText ||
          mapping.field.label ||
          mapping.field.placeholder ||
          mapping.field.fieldName;

        console.log(`[AI] Asking: "${question.slice(0, 80)}"`);

        // Use more tokens for summary/about fields which need 3-4 sentences
        const semanticType = this.getFieldSemanticType(mapping.field);
        const maxTokens = semanticType === 'summary' ? 300 : 150;
        const answer = await generateText(systemPrompt, question, maxTokens);

        if (answer?.trim()) {
          mapping.mappedData = answer.trim();
          console.log(`[AI] "${label}" → "${answer.trim().slice(0, 80)}"`);
        } else {
          console.log(`[AI] Empty answer for "${label}"`);
        }
      } catch (err) {
        console.log(`[AI] Failed for "${label}":`, err);
      }
    }

    return mappings;
  }

  /**
   * After the main fill pass, check each mapped field's actual DOM value.
   * Any field that is still empty/unchanged gets re-queued for another fill attempt.
   */
  private async recheckAndRefillEmpty(page: Page, mappings: FieldMapping[]): Promise<void> {
    const stillEmpty: FieldMapping[] = [];

    for (const mapping of mappings) {
      if (!mapping.mappedData) continue;
      const field = mapping.field;
      if (!field.frame) continue;

      try {
        const frame = field.frame as Frame;
        const selectorClean = field.selector.split('||')[0];
        const el = await frame.$(selectorClean);
        if (!el) continue;

        const currentValue = await el.evaluate((e: HTMLElement) => {
          if (
            e instanceof HTMLInputElement ||
            e instanceof HTMLTextAreaElement ||
            e instanceof HTMLSelectElement
          ) {
            return e.value;
          }
          return (e as HTMLElement).innerText || e.textContent || '';
        });

        if (!currentValue || currentValue.trim() === '') {
          console.log(
            `[Recheck] "${field.label || field.fieldName}" is still empty — will retry.`
          );
          stillEmpty.push(mapping);
        }
      } catch {
        // ignore individual errors
      }
    }

    if (stillEmpty.length > 0) {
      console.log(`[Recheck] Retrying ${stillEmpty.length} still-empty field(s)...`);
      await this.fieldFiller.fillAll(stillEmpty, page);
    } else {
      console.log('[Recheck] All mapped fields appear to have values.');
    }
  }

  private async submitForm(page: Page): Promise<boolean> {
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Submit")',
      'button:has-text("Apply")',
      'button:has-text("Apply Now")',
      'button:has-text("Next")',
      'button:has-text("Continue")',
      'button[aria-label*="submit"]',
      'button[aria-label*="apply"]',
    ];

    for (const selector of submitSelectors) {
      const button = await page.$(selector);
      if (button) {
        console.log(`[DEV] Clicking submit button: ${selector}`);
        await button.click();
        await page.waitForTimeout(3000); // Wait for submission to process
        return true;
      }
    }

    console.log('[DEV] No submit button found.');
    return false;
  }

  /**
   * Fills the form using AI-extracted fields.
   * The AI has already determined selectors and answers — Playwright just executes fills.
   *
   * Handles:
   *  - text / textarea: direct fill
   *  - select: native selectOption by label, with JS fallback for custom dropdowns
   *  - radio: check the matching option by label
   *  - checkbox: check/uncheck based on truthy answer
   *  - file: setInputFiles with the resume path (when answer === "RESUME_FILE")
   */
  /**
   * Generic entry-filling for experience/education (and any repeating section).
   *
   * Instead of hardcoding platform-specific selectors, this uses a DOM snapshot diff:
   *   1. Mark all existing controls with data-snap before clicking Add
   *   2. Click the Add button (found by aria-label / button text)
   *   3. Extract field info only from controls that appeared after the snapshot
   *   4. Let AI answer those fields with entry-specific context
   *   5. Find the save/confirm button by locating the common ancestor of the new
   *      controls, then picking the first positive-action button inside it
   *   6. Click save, repeat for the next entry
   *
   * Works across Workable, Greenhouse, Lever, SmartRecruiters, etc. without
   * any platform-specific selectors.
   *
   * After all entries are filled, re-fills the profile summary (React re-renders
   * during saves can clear controlled textareas).
   */
  private async fillStructuredEntries(
    page: Page,
    formFrame: Frame,
    structuredResume: StructuredResume,
    profileSummaryValue: string,
    resumePath: string
  ): Promise<void> {
    const CONTROL_SEL =
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),' +
      'textarea,select';

    // ── Mark all existing controls so we can diff after Add click ────────────────
    const snapshotControls = () =>
      formFrame.evaluate((sel: string) => {
        document.querySelectorAll<HTMLElement>(sel)
          .forEach(el => { el.dataset.snap = '1'; });
      }, CONTROL_SEL);

    // ── Build form-field XML only for controls that appeared after snapshot ───────
    // (same logic as HtmlFormExtractorAgent.getFormHTML, scoped to new elements)
    const extractNewFieldsHTML = (): Promise<string> =>
      formFrame.evaluate((sel: string) => {
        const isVisible = (el: HTMLElement) => {
          if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };

        const getLabel = (el: HTMLElement): string => {
          const aria = el.getAttribute('aria-label');
          if (aria?.trim()) return aria.trim();
          const lby = el.getAttribute('aria-labelledby');
          if (lby) {
            const t = lby.split(' ')
              .map(id => document.getElementById(id)?.textContent?.trim() || '')
              .filter(Boolean).join(' ');
            if (t) return t;
          }
          const id = (el as HTMLInputElement).id;
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            const t = lbl ? (lbl.textContent || '').replace(/[*]/g, '').trim() : '';
            if (t) return t;
          }
          // Placeholder
          const ph = (el as HTMLInputElement).placeholder?.trim();
          if (ph) return ph;
          // Name → readable label (phone → "Phone", start_date → "Start Date")
          const name = (el as HTMLInputElement).name || '';
          if (name && /^[a-z][a-z0-9_]*$/.test(name))
            return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          // Nearby label as last resort
          const grp = el.closest('[class*="field"],[class*="form"],[class*="row"],[class*="group"],li');
          if (grp) {
            const lbl = grp.querySelector('label,legend');
            const t = lbl ? (lbl.textContent || '').replace(/[*]/g, '').trim() : '';
            if (t) return t;
          }
          return '';
        };

        const makeSelector = (el: HTMLElement): string => {
          const tag = el.tagName.toLowerCase();
          const id = (el as HTMLInputElement).id;
          const name = (el as HTMLInputElement).name;
          const aria = el.getAttribute('aria-label');
          const ph = (el as HTMLInputElement).placeholder;
          const idx = el.dataset.autofillIdx;
          if (id) return `${tag}[id='${id}']`;
          if (name) return `${tag}[name='${name}']`;  // name alone is unambiguous
          if (aria) return `${tag}[aria-label='${aria}']`;
          if (ph) return `${tag}[placeholder='${ph}']`;
          return idx ? `${tag}[data-autofill-idx='${idx}']` : tag;
        };

        // Assign autofill-idx only to new (no data-snap) controls, above current max
        let maxIdx = -1;
        document.querySelectorAll<HTMLElement>('[data-autofill-idx]').forEach(el => {
          const v = parseInt(el.dataset.autofillIdx || '-1');
          if (v > maxIdx) maxIdx = v;
        });
        const newEls = Array.from(document.querySelectorAll<HTMLElement>(sel))
          .filter(el => !el.dataset.snap);
        newEls.forEach(el => {
          if (!el.dataset.autofillIdx) el.dataset.autofillIdx = String(++maxIdx);
        });

        const DATE_NAME_LABELS: Record<string, string> = {
          start_date: 'Start Date', end_date: 'End Date',
          from_date: 'From Date', to_date: 'To Date',
        };
        const seenRadios = new Set<string>();
        const lines = ['<form-fields>'];

        for (const el of newEls) {
          if (!isVisible(el)) continue;
          const tag = el.tagName.toLowerCase();
          const inputType = (el as HTMLInputElement).type || 'text';
          const name = (el as HTMLInputElement).name || '';
          if (inputType === 'radio') {
            if (seenRadios.has(name)) continue;
            seenRadios.add(name);
          }
          const selector = makeSelector(el);
          const rawLabel = getLabel(el);
          const label = DATE_NAME_LABELS[name] || rawLabel;
          const required = (el as HTMLInputElement).required ||
            el.getAttribute('aria-required') === 'true';
          const ph = (el as HTMLInputElement).placeholder?.trim() || '';
          const maxLen = (el as HTMLTextAreaElement).maxLength > 0
            ? (el as HTMLTextAreaElement).maxLength : null;
          let type = 'text';
          if (tag === 'textarea') type = 'textarea';
          else if (tag === 'select') type = 'select';
          else if (inputType === 'radio') type = 'radio';
          else if (inputType === 'checkbox') type = 'checkbox';
          else if (inputType === 'file') type = 'file';

          lines.push(`  <field type="${type}" selector="${selector}" required="${required}"` +
            `${ph ? ` placeholder="${ph}"` : ''}${maxLen ? ` maxlength="${maxLen}"` : ''}>`);
          lines.push(`    <label>${label}</label>`);

          if (tag === 'select') {
            const opts = Array.from((el as HTMLSelectElement).options)
              .map(o => o.text.trim()).filter(t => t && !/^(select|choose|--)/i.test(t));
            if (opts.length) lines.push(`    <options>${opts.join(', ')}</options>`);
          }
          if (inputType === 'radio' && name) {
            const radios = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`);
            const opts: string[] = [];
            radios.forEach(r => {
              const lbl = r.id ? document.querySelector(`label[for="${r.id}"]`)?.textContent?.trim() : '';
              if (lbl || r.value) opts.push(lbl || r.value);
            });
            if (opts.length) lines.push(`    <options>${opts.join(', ')}</options>`);
          }
          lines.push('  </field>');
        }
        lines.push('</form-fields>');
        return lines.join('\n');
      }, CONTROL_SEL);

    // ── Find an "Add" button by aria-label / visible text ────────────────────────
    const findAddButton = async (keywords: string[]) => {
      for (const kw of keywords) {
        const re = new RegExp(kw, 'i');
        // getByRole checks accessible name (aria-label takes priority over text content)
        const byRole = formFrame.getByRole('button', { name: re });
        if (await byRole.count() > 0) return byRole.first();
        // Fallback: iterate elements with aria-label and check programmatically
        const handles = await formFrame.locator('[aria-label]').all();
        for (const handle of handles) {
          const label = await handle.getAttribute('aria-label');
          if (label && re.test(label)) return handle;
        }
        // Last resort: visible text content
        const byText = formFrame.locator('button,[role="button"]').filter({ hasText: re });
        if (await byText.count() > 0) return byText.first();
      }
      return null;
    };

    // ── Find the save/confirm button by reading the DOM ───────────────────────────
    // Locates the common ancestor of newly added form controls, then picks the first
    // visible button inside that ancestor whose text is NOT a negative action
    // (Cancel, Clear, Delete, Remove, Discard, Close).
    const findSaveButton = async (): Promise<string | null> =>
      formFrame.evaluate((sel: string) => {
        const NEGATIVE = /^(cancel|clear|delete|remove|discard|close|reset|back)$/i;

        const newControls = Array.from(document.querySelectorAll<HTMLElement>(sel))
          .filter(el => !el.dataset.snap);
        if (!newControls.length) return null;

        // Walk up from the first new control to find a common ancestor that also
        // contains a button
        let ancestor: Element | null = newControls[0];
        while (ancestor) {
          const buttons = Array.from(ancestor.querySelectorAll<HTMLElement>('button,[role="button"]'))
            .filter(btn => {
              if (btn.hasAttribute('hidden')) return false;
              const s = window.getComputedStyle(btn);
              if (s.display === 'none' || s.visibility === 'hidden') return false;
              const r = btn.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) return false;
              const text = (btn.textContent || '').trim();
              return text && !NEGATIVE.test(text);
            });
          if (buttons.length > 0) {
            const btn = buttons[0];
            // Build a unique-enough selector to click later
            if (btn.id) return `#${btn.id}`;
            const dataUi = btn.getAttribute('data-ui');
            if (dataUi) return `[data-ui="${dataUi}"]`;
            const ariaLabel = btn.getAttribute('aria-label');
            if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
            // Use text content as last resort via nth-match
            const text = (btn.textContent || '').trim();
            return `button:has-text("${text}")`;
          }
          ancestor = ancestor.parentElement;
        }
        return null;
      }, CONTROL_SEL);

    // ── Section definitions (generic — no platform selectors) ────────────────────
    const sections = [
      {
        label: 'experience',
        addKeywords: ['add experience', 'add work experience', 'add job', 'add employment'],
        entries: (structuredResume.experience || []).map(e => ({
          context:
            `Job Title / Role: ${e.role || ''}\n` +
            `Company: ${e.company || ''}\n` +
            `Start Date: ${e.startDate || ''}\n` +
            `End Date: ${e.endDate || 'Present'}\n` +
            `Description: ${e.description || (e.achievements || []).join(' ')}`,
          display: `${e.role} @ ${e.company}`,
        })),
      },
      {
        label: 'education',
        addKeywords: ['add education', 'add school', 'add degree', 'add qualification'],
        entries: ((structuredResume.education || []) as any[]).map((e: any) => ({
          context:
            `School / Institution: ${e.school || e.institution || ''}\n` +
            `Degree: ${e.degree || ''}\n` +
            `Field of Study: ${e.field || e.fieldOfStudy || ''}\n` +
            `Start Date: ${e.startDate || ''}\n` +
            `End Date: ${e.endDate || ''}`,
          display: `${e.degree || e.school || e.institution}`,
        })),
      },
    ];

    for (const section of sections) {
      if (!section.entries.length) continue;

      const addBtn = await findAddButton(section.addKeywords);
      if (!addBtn) {
        console.log(`[StructuredEntries] No "${section.label}" add button found — skipping`);
        continue;
      }

      for (const entry of section.entries) {
        try {
          // 1. Snapshot — mark all current controls so we can find new ones after click
          await snapshotControls();

          // 2. Click Add
          await addBtn.waitFor({ state: 'visible', timeout: 5000 });
          await addBtn.click({ timeout: 10000 });
          await page.waitForTimeout(800);

          // 3. Extract new field XML (only controls without data-snap)
          const newFieldsHTML = await extractNewFieldsHTML();
          const fieldCount = (newFieldsHTML.match(/<field /g) || []).length;
          if (fieldCount === 0) {
            console.log(`[StructuredEntries] No new fields found for "${entry.display}" — skipping`);
            continue;
          }
          console.log(`[StructuredEntries] ${fieldCount} new fields for "${entry.display}"`);

          // 4. AI extracts schema + answers with entry-specific context
          const answered = await this.htmlExtractor.extractAndAnswerFields(
            newFieldsHTML, entry.context, { coverLetterText: undefined }
          );

          // 5. Fill
          await this.fillFromAIFields(page, answered, resumePath);

          // 6. Find and click the save button by reading DOM structure
          const saveSel = await findSaveButton();
          if (saveSel) {
            await formFrame.locator(saveSel).first().click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(600);
            console.log(`[StructuredEntries] Saved "${entry.display}" via "${saveSel}"`);
          } else {
            console.log(`[StructuredEntries] No save button found for "${entry.display}"`);
          }
        } catch (err: any) {
          console.log(`[StructuredEntries] Error on "${entry.display}":`, err?.message || err);
        }
      }
    }

    // ── Re-fill profile summary ─────────────────────────────────────────────────
    // After all saves, React may have cleared the profile summary textarea.
    // Find it via data-snap (it was present before any Add click) and its label.
    if (profileSummaryValue) {
      const refilled = await formFrame.evaluate((val: string) => {
        const all = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'));
        // Profile summary was visible before the first Add click → has data-snap
        const ta = all.find(el => {
          if (!el.dataset.snap) return false;
          const label =
            (el.id ? (document.querySelector(`label[for="${el.id}"]`)?.textContent || '') : '') ||
            el.getAttribute('aria-label') || el.name || '';
          return /summary|bio|professional.?profile/i.test(label);
        });
        if (!ta) return false;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (setter) setter.call(ta, val); else ta.value = val;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, profileSummaryValue);
      console.log(refilled
        ? '[StructuredEntries] Re-filled profile summary'
        : '[StructuredEntries] Profile summary not found for re-fill');
    }
  }

  private async fillFromAIFields(
    page: Page,
    fields: AIField[],
    resumePath: string,
    coverLetterPdfPath?: string
  ): Promise<{ filled: number; failed: number }> {
    let filled = 0;
    let failed = 0;

    for (const field of fields) {
      const label = field.label || field.selector;
      try {
        // Try main page first, then all descendant frames (recursive — handles ATSes embedded deep)
        const frames = [page.mainFrame(), ...(await this.getAllFrames(page))];
        let handled = false;

        for (const frame of frames) {
          const el = await frame.$(field.selector.split('||')[0]).catch(() => null);
          if (!el) continue;

          if (field.answer === 'COVER_LETTER_FILE') {
            if (coverLetterPdfPath) {
              await el.setInputFiles(coverLetterPdfPath);
              console.log(`[AIFill] cover letter PDF "${label}" → ${coverLetterPdfPath}`);
            } else {
              console.log(`[AIFill] cover letter file "${label}" — no PDF available, skipping`);
            }
            handled = true;
          } else if (field.type === 'file' || field.answer === 'RESUME_FILE') {
            await el.setInputFiles(resumePath);
            console.log(`[AIFill] file "${label}" → ${resumePath}`);
            handled = true;

          } else if (field.type === 'text' || field.type === 'textarea') {
            // Check if element is editable — if not, it may be a combobox trigger
            const isEditable = await el.evaluate((e: HTMLElement) => {
              const tag = e.tagName.toLowerCase();
              if (tag === 'textarea') return true;
              const input = e as HTMLInputElement;
              if (input.readOnly || input.disabled) return false;
              if (input.getAttribute('aria-readonly') === 'true') return false;
              if (input.getAttribute('role') === 'combobox') return false;
              if (input.getAttribute('aria-haspopup')) return false;
              return true;
            });

            if (isEditable) {
              // Date-like fields: fill then Tab to dismiss any calendar popup
              const isDateField =
                /date|month|year/i.test(field.label) ||
                /^\d{1,2}\/\d{4}$/.test(field.answer) ||
                field.placeholder === 'MM/YYYY';

              // Use React-compatible native value setter so controlled components
              // (like Workable's summary textarea) retain their value after re-renders
              await el.evaluate((elem: HTMLElement, val: string) => {
                const input = elem as HTMLInputElement | HTMLTextAreaElement;
                const proto = input.tagName === 'TEXTAREA'
                  ? window.HTMLTextAreaElement.prototype
                  : window.HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                if (setter) setter.call(input, val);
                else input.value = val;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }, field.answer);

              if (isDateField) {
                await page.keyboard.press('Tab');
                await page.waitForTimeout(300);
              }
              console.log(`[AIFill] ${field.type} "${label}" → "${field.answer.slice(0, 60)}"`);
              handled = true;
            } else {
              // Non-editable input — treat as combobox: click to open, pick matching option
              const mapping: FieldMapping = {
                field: {
                  selector: field.selector,
                  elementType: 'input',
                  inputType: 'text',
                  isCombobox: true,
                  fieldName: field.selector,
                  label: field.label,
                  required: field.required,
                  frame,
                  options: (field.options || []).map(o => ({ value: o, text: o })),
                },
                mappedData: field.answer,
                needsAI: false,
              };
              const attempt = await this.fieldFiller.fill(mapping, page);
              if (attempt.success) {
                console.log(`[AIFill] combobox "${label}" → "${field.answer}"`);
                handled = true;
              } else {
                console.log(`[AIFill] combobox "${label}" failed: ${attempt.error}`);
              }
            }

          } else if (field.type === 'select') {
            // Reuse existing fillSelect logic from FieldFillerAgent via a simulated FieldMapping
            const mapping: FieldMapping = {
              field: {
                selector: field.selector,
                elementType: 'select',
                fieldName: field.selector,
                label: field.label,
                required: field.required,
                frame,
                options: (field.options || []).map(o => ({ value: o, text: o })),
              },
              mappedData: field.answer,
              needsAI: false,
            };
            const attempt = await this.fieldFiller.fill(mapping, page);
            if (attempt.success) {
              console.log(`[AIFill] select "${label}" → "${field.answer}"`);
              handled = true;
            } else {
              console.log(`[AIFill] select "${label}" failed: ${attempt.error}`);
            }

          } else if (field.type === 'radio') {
            const radioName = await el.getAttribute('name') || field.selector;
            const mapping: FieldMapping = {
              field: {
                selector: field.selector,
                elementType: 'input',
                inputType: 'radio',
                fieldName: radioName,
                label: field.label,
                required: field.required,
                frame,
                options: (field.options || []).map(o => ({ value: o, text: o })),
              },
              mappedData: field.answer,
              needsAI: false,
            };
            const attempt = await this.fieldFiller.fill(mapping, page);
            if (attempt.success) {
              console.log(`[AIFill] radio "${label}" → "${field.answer}"`);
              handled = true;
            } else {
              console.log(`[AIFill] radio "${label}" failed: ${attempt.error}`);
            }

          } else if (field.type === 'checkbox') {
            const v = field.answer.toLowerCase();
            const shouldCheck = ['yes', 'true', '1', 'agree', 'accept', 'checked'].some(kw => v.includes(kw));
            await el.setChecked(shouldCheck);
            console.log(`[AIFill] checkbox "${label}" → ${shouldCheck}`);
            handled = true;
          }

          if (handled) {
            filled++;
            break;
          }
        }

        if (!handled) {
          console.log(`[AIFill] SKIP "${label}" — selector not found: ${field.selector}`);
          failed++;
        }
      } catch (err: any) {
        console.log(`[AIFill] ERROR "${label}": ${err?.message || err}`);
        failed++;
      }
    }

    console.log(`[AIFill] Done — filled: ${filled}, failed/skipped: ${failed}`);
    return { filled, failed };
  }

  /**
   * Returns true when the current page already IS an application form
   * (i.e. it has several visible input/textarea/select fields), so we
   * should skip looking for an "Apply" link and re-navigating.
   */
  private async isFormPage(page: Page): Promise<boolean> {
    const count = await page.evaluate(() =>
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
      ).length
    ).catch(() => 0);
    return count >= 3;
  }

  public async processSingleApplication(
    jobUrl: string,
    coverLetter: string,
    resumePath: string,
    userProfile: UserProfile,
    resumeText: string,
    applyLink?: string,
    structuredResume?: StructuredResume | null
  ): Promise<ApplicationResult> {
    const page = await this.createPage();

    try {
      // 1. Navigate to the provided URL
      await this.navigateToJobUrl(page, jobUrl);

      // If the URL is already the application form (e.g. app.greenhouse.io/embed/job_app?token=…,
      // a direct Workable /apply link, etc.) skip the "find apply link" step entirely.
      const alreadyOnForm = applyLink
        ? false  // caller gave an explicit separate apply link — honour it
        : await this.isFormPage(page);

      let applicationLink: string | null;
      if (alreadyOnForm) {
        console.log('[Orchestrator] jobUrl appears to be the application form itself — skipping link discovery.');
        applicationLink = jobUrl;
      } else {
        applicationLink = await this.findApplicationLink(page, applyLink);
      }

      if (!applicationLink) {
        return {
          success: false,
          error: 'Could not find application link on the job page.',
        };
      }

      // 2. Navigate to the application form (no-op when we're already on it)
      if (applicationLink !== jobUrl) {
        await this.navigateToApplicationPage(page, applicationLink);
      }
      await this.waitForForm(page);

      // 2b. Upload resume early so the ATS can auto-populate what it can
      await this.uploadResume(page, resumePath);
      await page.waitForTimeout(2000); // give ATS time to parse and populate

      // 2c. Detect which frame holds the form (main frame for direct URLs, iframe for embedded ATSes)
      const formFrame = await this.getFormFrame(page);

      // 3. Detect platform (read URL/DOM from the form frame)
      const formAnalysis = await this.formAnalyzer.analyze(formFrame);
      console.log('[Orchestrator] Form analysis:', formAnalysis);

      // 4. Expand dynamic sections (+ Add buttons) so all fields are visible before extraction
      await this.formAnalyzer.expandDynamicSections(formFrame, async () => {
        return await formFrame.evaluate(() =>
          document.querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])').length
        );
      });

      // 5a. Get cleaned form HTML
      const formHTML = await this.htmlExtractor.getFormHTML(page);

      // 5b. Augment resume text with structured profile fields
      const augmentedResume = [
        resumeText,
        '\n--- Additional Profile Details ---',
        userProfile.phone        ? `Phone: ${userProfile.phone}` : '',
        userProfile.location     ? `Location: ${userProfile.location}` : '',
        userProfile.linkedin     ? `LinkedIn: ${userProfile.linkedin}` : '',
        userProfile.github       ? `GitHub: ${userProfile.github}` : '',
        userProfile.currentCTC   ? `Current CTC: ${userProfile.currentCTC}` : '',
        userProfile.expectedCTC  ? `Expected CTC: ${userProfile.expectedCTC}` : '',
        userProfile.noticePeriod ? `Notice Period: ${userProfile.noticePeriod}` : '',
      ].filter(Boolean).join('\n');

      // 5c. Single batch AI call: form XML + resume → all field answers at once
      const aiFields = await this.htmlExtractor.extractAndAnswerFields(formHTML, augmentedResume, {
        coverLetterText: coverLetter || undefined,
      });

      if (aiFields.length === 0) {
        console.log('[Orchestrator] AI returned no fields — taking screenshot and aborting fill.');
        const screenshot = await page.screenshot({ fullPage: true });
        const screenshotPath = path.join(os.tmpdir(), `job-agent-verify-${Date.now()}.png`);
        fs.writeFileSync(screenshotPath, screenshot);
        return { success: false, screenshot, screenshotPath, error: 'AI could not extract any form fields from the page HTML.' };
      }

      // Find the profile summary answer so it can be re-applied after structured entry filling
      // (React re-renders during experience/education saves can clear controlled textareas)
      const profileSummaryAnswer = aiFields.find(
        f => f.type === 'textarea' && f.label?.toLowerCase() === 'summary' &&
             !['detail','question','additional','screening','experience','work','job','employment','education']
               .some(kw => (f.section || '').toLowerCase().includes(kw))
      )?.answer || structuredResume?.summary || '';

      // 5d. Generate cover letter PDF if cover letter text is available
      let coverLetterPdfPath: string | undefined;
      if (coverLetter) {
        coverLetterPdfPath = path.join(os.tmpdir(), `cover-letter-${Date.now()}.pdf`);
        try {
          const { CoverLetterGenerator } = await import('./cover-letter-generator');
          await new CoverLetterGenerator().generateCoverLetterPDF(coverLetter, coverLetterPdfPath);
          console.log(`[Orchestrator] Cover letter PDF written to ${coverLetterPdfPath}`);
        } catch (err) {
          console.log('[Orchestrator] Cover letter PDF generation failed, skipping:', err);
          coverLetterPdfPath = undefined;
        }
      }

      // 6. Fill all fields using AI-provided selectors and answers
      await this.fillFromAIFields(page, aiFields, resumePath, coverLetterPdfPath);

      // 6b. Fill structured experience/education entries then re-fill profile summary
      if (structuredResume) {
        await this.fillStructuredEntries(page, formFrame, structuredResume, profileSummaryAnswer, resumePath);
      }

      // 7. Take screenshot and save to disk for skill verification
      const screenshot = await page.screenshot({ fullPage: true });
      const screenshotPath = path.join(os.tmpdir(), `job-agent-verify-${Date.now()}.png`);
      fs.writeFileSync(screenshotPath, screenshot);
      console.log(`[Orchestrator] Verification screenshot saved: ${screenshotPath}`);

      // 8. Submit (only if JOB_AGENT_AUTO_SUBMIT=true)
      const autoSubmit = process.env.JOB_AGENT_AUTO_SUBMIT === 'true';
      if (!autoSubmit) {
        console.log('[Orchestrator] Auto-submit disabled. Form filled and left open for review.');
        return { success: true, screenshot, screenshotPath, submittedAt: undefined };
      }

      const submitted = await this.submitForm(page);

      return {
        success: submitted,
        screenshot,
        screenshotPath,
        submittedAt: submitted ? new Date() : undefined,
        error: submitted ? undefined : 'Form submission might have failed or not detected.',
      };
    } catch (error) {
      console.log('[DEV] Error processing single application:', error);
      const screenshot = await page.screenshot({ fullPage: true }).catch(() => undefined);
      let screenshotPath: string | undefined;
      if (screenshot) {
        screenshotPath = path.join(os.tmpdir(), `job-agent-verify-${Date.now()}.png`);
        fs.writeFileSync(screenshotPath, screenshot);
      }

      return {
        success: false,
        screenshot,
        screenshotPath,
        error: `Error processing application: ${error}`,
      };
    } finally {
      const headless = process.env.BROWSER_HEADLESS === 'true';
      if (headless) {
        await page.close();
      }
    }
  }

  public async processMultipleApplications(
    applications: {
      jobUrl: string;
      coverLetter: string;
      resumePath: string;
      applyLink?: string;
      resumeText: string;
      structuredResume?: StructuredResume | null;
    }[],
    userProfile: UserProfile
  ): Promise<ApplicationResult[]> {
    const results: ApplicationResult[] = [];

    for (const application of applications) {
      try {
        const result = await this.processSingleApplication(
          application.jobUrl,
          application.coverLetter,
          application.resumePath,
          userProfile,
          application.resumeText,
          application.applyLink,
          application.structuredResume
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
