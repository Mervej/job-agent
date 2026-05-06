import { chromium, Browser, Page } from 'playwright';
import axios from 'axios';

export interface JobDescription {
  title: string;
  company: string;
  description: string;
  location?: string;
  salary?: string;
  requirements?: string[];
  benefits?: string[];
  url: string;
  applyLink?: string; // Link to apply page if it's different from the job description page
}

export class JobCrawler {
  private browser: Browser | null = null;

  async init() {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async crawlJobDescription(url: string): Promise<JobDescription> {
    if (!this.browser) {
      await this.init();
    }

    const page = await this.browser!.newPage();

    try {
      // Set user agent to avoid detection
      await page.setExtraHTTPHeaders({
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      });

      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Wait for content to load
      await page.waitForTimeout(2000);

      // Generic extraction using heuristics and content analysis
      const jobData = await page.evaluate(() => {
        // Helper: Find main content area by analyzing page structure
        const findMainContent = (): Element | null => {
          // Try semantic HTML first
          const main = document.querySelector('main, [role="main"], article');
          if (main) return main;

          // Find largest content container (excluding nav, header, footer)
          const candidates = document.querySelectorAll('div, section');
          let largest: Element | null = null;
          let maxTextLength = 0;

          candidates.forEach((el) => {
            const tagName = el.tagName.toLowerCase();
            if (['nav', 'header', 'footer', 'aside'].includes(tagName)) return;

            const text = el.textContent || '';
            const textLength = text.trim().length;

            // Skip if too small or too large (likely entire page)
            if (textLength > 500 && textLength < 50000 && textLength > maxTextLength) {
              maxTextLength = textLength;
              largest = el;
            }
          });

          return largest || document.body;
        };

        const mainContent = findMainContent();

        // Extract title - usually the largest H1 near the top
        let title = '';
        const h1Elements = Array.from(document.querySelectorAll('h1')).sort((a, b) => {
          const aRect = a.getBoundingClientRect();
          const bRect = b.getBoundingClientRect();
          return aRect.top - bRect.top; // Sort by position
        });

        if (h1Elements.length > 0) {
          title = h1Elements[0].textContent?.trim() || '';
        }

        // Extract company - comprehensive search with multiple strategies
        let company = '';
        const titleElement = h1Elements[0];

        // Strategy 1: Look for elements with explicit company classes/ids
        const companyElements = document.querySelectorAll(
          '[class*="company"], [id*="company"], [class*="employer"], .stripe-logo, .company-name'
        );
        for (const elem of Array.from(companyElements)) {
          const text = elem.textContent?.trim() || '';
          if (text.length > 1 && text.length < 50 && !text.includes('\n')) {
            // Exclude navigation, buttons, and other UI elements
            const className = (elem.className || '').toLowerCase();
            const tagName = elem.tagName.toLowerCase();
            if (
              !className.includes('button') &&
              !className.includes('nav') &&
              !className.includes('menu') &&
              tagName !== 'button' &&
              tagName !== 'a' &&
              tagName !== 'nav'
            ) {
              company = text;
              console.log(`[DEV] Found company via explicit selector: "${company}"`);
              break;
            }
          }
        }

        // Strategy 2: Look in document title for company name
        if (!company) {
          const title = document.title;
          // Common patterns: "Job Title - Company", "Company - Job Title", "Job Title at Company"
          const titlePatterns = [
            // "Software Engineer - Stripe" -> Stripe
            /^(.+?)\s*[-\|]\s*(.+?)$/,
            // "Software Engineer at Stripe - Remote" -> Stripe
            /^(.+?)\s+(?:at|@)\s+(.+?)\s*[-\|]/,
            // "Stripe - Software Engineer" -> Stripe
            /^(.+?)\s*[-\|]\s*(.+?)$/,
          ];

          for (const pattern of titlePatterns) {
            const match = title.match(pattern);
            if (match) {
              // For "Job - Company" format, company is usually the second part
              // For "Company - Job" format, company is usually the first part
              let potentialCompany = '';

              // If title ends with common job-related words, company is likely the first part
              if (title.match(/(?:jobs?|careers?|hiring|recruiting)$/i)) {
                potentialCompany = match[1];
              } else {
                // Otherwise, check which part looks more like a company name
                const part1 = match[1]?.trim() || '';
                const part2 = match[2]?.trim() || '';

                // Company names are typically shorter and don't contain job-related words
                const jobWords = [
                  'engineer',
                  'developer',
                  'manager',
                  'analyst',
                  'designer',
                  'specialist',
                  'senior',
                  'junior',
                  'lead',
                  'principal',
                ];
                const isPart1Job = jobWords.some((word) => part1.toLowerCase().includes(word));
                const isPart2Job = jobWords.some((word) => part2.toLowerCase().includes(word));

                if (!isPart1Job && isPart2Job) {
                  potentialCompany = part1;
                } else if (isPart1Job && !isPart2Job) {
                  potentialCompany = part2;
                } else {
                  // Fallback: shorter part is likely company
                  potentialCompany = part1.length <= part2.length ? part1 : part2;
                }
              }

              if (potentialCompany && potentialCompany.length > 1 && potentialCompany.length < 50) {
                company = potentialCompany.trim();
                console.log(
                  `[DEV] Found company via title pattern: "${company}" from title "${title}"`
                );
                break;
              }
            }
          }
        }

        // Strategy 3: Look for company name near the job title
        if (!company && titleElement) {
          // Search in siblings and nearby elements
          const searchArea = [
            ...Array.from(titleElement.parentElement?.children || []),
            ...Array.from(titleElement.nextElementSibling ? [titleElement.nextElementSibling] : []),
            ...Array.from(
              titleElement.previousElementSibling ? [titleElement.previousElementSibling] : []
            ),
          ];

          for (const elem of searchArea) {
            if (elem === titleElement) continue;

            const text = elem.textContent?.trim() || '';
            const className = (elem.className || '').toLowerCase();
            const tagName = elem.tagName.toLowerCase();

            // Skip unwanted elements
            if (
              tagName === 'button' ||
              tagName === 'a' ||
              tagName === 'script' ||
              tagName === 'style' ||
              className.includes('button') ||
              className.includes('nav') ||
              className.includes('menu') ||
              className.includes('apply') ||
              text.toLowerCase().includes('apply')
            ) {
              continue;
            }

            // Company names are typically short, clean text
            if (
              text.length > 1 &&
              text.length < 50 &&
              text.split(/\s+/).length < 6 &&
              !text.includes('\n') &&
              !text.includes('|') &&
              !text.includes('-') &&
              !/^\d/.test(text) // Not starting with numbers
            ) {
              // Exclude common non-company words
              const excludeWords = [
                'apply',
                'submit',
                'save',
                'share',
                'follow',
                'connect',
                'full',
                'time',
                'remote',
                'hybrid',
                'onsite',
              ];
              if (!excludeWords.some((word) => text.toLowerCase().includes(word))) {
                company = text;
                console.log(`[DEV] Found company near title: "${company}"`);
                break;
              }
            }
          }
        }

        // Strategy 4: Look in meta tags
        if (!company) {
          const metaTags = document.querySelectorAll(
            'meta[name*="author"], meta[property*="author"], meta[name*="company"]'
          );
          for (const meta of Array.from(metaTags)) {
            const content = meta.getAttribute('content');
            if (content && content.length > 1 && content.length < 50) {
              company = content.trim();
              console.log(`[DEV] Found company via meta tag: "${company}"`);
              break;
            }
          }
        }

        // Strategy 5: Look for logo alt text or aria-labels
        if (!company) {
          const logos = document.querySelectorAll(
            'img[alt*="logo"], img[alt*="company"], [aria-label*="company"]'
          );
          for (const logo of Array.from(logos)) {
            const alt = logo.getAttribute('alt') || logo.getAttribute('aria-label');
            if (alt && alt.length > 1 && alt.length < 50 && !alt.toLowerCase().includes('logo')) {
              company = alt.trim();
              console.log(`[DEV] Found company via logo alt: "${company}"`);
              break;
            }
          }
        }

        // Strategy 6: Last resort - look in header area for any reasonable company-like text
        if (!company) {
          const header = document.querySelector('header, [class*="header"], [id*="header"]');
          if (header) {
            const headerText = header.textContent || '';
            const words = headerText
              .split(/\s+/)
              .filter(
                (word) =>
                  word.length > 2 &&
                  word.length < 20 &&
                  !word.match(/^\d/) &&
                  !['apply', 'submit', 'job', 'careers', 'hiring'].includes(word.toLowerCase())
              );

            // Look for capitalized words that might be company names
            for (const word of words) {
              if (word[0] === word[0].toUpperCase() && word.length > 3) {
                company = word;
                console.log(`[DEV] Found company via header analysis: "${company}"`);
                break;
              }
            }
          }
        }

        // Extract location and salary from text patterns
        let location = '';
        let salary = '';

        // Look for location patterns (city, state, country, "Remote", etc.)
        const locationPatterns = [
          /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}(?:\s+\d{5})?)/, // "City, State"
          /(Remote|On-site|Hybrid|Onsite)/i,
          /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+)/, // "City, Country"
        ];

        // Look for salary patterns
        const salaryPatterns = [
          /\$[\d,]+(?:\s*-\s*\$[\d,]+)?/,
          /[\d,]+\s*-\s*[\d,]+\s*(?:USD|dollars?)/i,
          /(?:salary|compensation):\s*\$?[\d,]+/i,
        ];

        // Search in main content and header area
        const searchAreas = [
          titleElement?.parentElement,
          document.querySelector('header'),
          mainContent,
        ].filter(Boolean) as Element[];

        searchAreas.forEach((area) => {
          const text = area.textContent || '';
          if (!location) {
            for (const pattern of locationPatterns) {
              const match = text.match(pattern);
              if (match) {
                location = match[1] || match[0];
                break;
              }
            }
          }
          if (!salary) {
            for (const pattern of salaryPatterns) {
              const match = text.match(pattern);
              if (match) {
                salary = match[0];
                break;
              }
            }
          }
        });

        // Extract description - get main content text, excluding navigation and metadata
        let description = '';
        if (mainContent) {
          // Remove common non-content elements
          const clone = mainContent.cloneNode(true) as Element;
          const removals = clone.querySelectorAll(
            'nav, header, footer, aside, script, style, form, button, [class*="nav"], [class*="menu"]'
          );
          removals.forEach((el) => el.remove());

          description = clone.textContent?.trim() || '';

          // Clean up excessive whitespace
          description = description.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n');
        }

        // Extract requirements and benefits by finding relevant headings
        const requirements: string[] = [];
        const benefits: string[] = [];

        const extractListFromHeading = (heading: Element, keywords: string[]): string[] => {
          const headingText = heading.textContent?.toLowerCase() || '';
          if (!keywords.some((kw) => headingText.includes(kw))) return [];

          const items: string[] = [];
          let current: Element | null = heading.nextElementSibling;
          let depth = 0;
          const maxDepth = 10; // Limit search depth

          while (current && depth < maxDepth) {
            // Stop at next heading of same or higher level
            if (current.tagName.match(/^H[1-6]$/)) {
              const currentLevel = parseInt(current.tagName[1]);
              const headingLevel = parseInt(heading.tagName[1] || '2');
              if (currentLevel <= headingLevel) break;
            }

            // Extract list items
            if (current.tagName === 'UL' || current.tagName === 'OL') {
              current.querySelectorAll('li').forEach((li) => {
                const text = li.textContent?.trim() || '';
                if (text.length > 10) items.push(text); // Filter out very short items
              });
            } else if (current.tagName === 'LI') {
              const text = current.textContent?.trim() || '';
              if (text.length > 10) items.push(text);
            }

            current = current.nextElementSibling;
            depth++;
          }

          return items;
        };

        // Find requirements
        const requirementKeywords = ['requirement', 'qualification', 'must have', 'needed'];
        const headings = document.querySelectorAll('h1, h2, h3, h4');
        headings.forEach((heading) => {
          if (requirements.length === 0) {
            const items = extractListFromHeading(heading, requirementKeywords);
            if (items.length > 0) requirements.push(...items);
          }
        });

        // Find benefits
        const benefitKeywords = ['benefit', 'perk', 'offer', 'compensation', 'package'];
        headings.forEach((heading) => {
          if (benefits.length === 0) {
            const items = extractListFromHeading(heading, benefitKeywords);
            if (items.length > 0) benefits.push(...items);
          }
        });

        // Detect apply link - look for apply buttons/links with multiple heuristics
        let applyLink = '';

        // Helper to find apply link
        const findApplyLink = (): string => {
          // Search for links and buttons with apply-related text/attributes
          const candidates = Array.from(
            document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')
          );

          console.log(`[DEV] Found ${candidates.length} potential apply elements`);

          // Priority selectors - more comprehensive detection
          const selectors: ((el: Element) => boolean)[] = [
            // Exact text matches (highest priority)
            (el: Element) =>
              (el.textContent?.toLowerCase().trim() === 'apply now' ||
                el.textContent?.toLowerCase().trim() === 'apply for this role' ||
                el.textContent?.toLowerCase().trim() === 'apply' ||
                el.textContent?.toLowerCase().trim() === 'submit application' ||
                el.textContent?.toLowerCase().trim() === 'apply for this job' ||
                el.textContent?.toLowerCase().trim() === 'apply for this position' ||
                el.textContent?.toLowerCase().trim() === 'apply for this opportunity' ||
                el.textContent?.toLowerCase().trim() === 'apply for this position' ||
                el.textContent?.toLowerCase().trim() === 'application') ??
              false,
            // Href contains common apply patterns
            (el: Element) => {
              const href = (el as HTMLAnchorElement).href;
              if (!href) return false;
              const hrefLower = href.toLowerCase();
              return (
                hrefLower.includes('/apply') ||
                hrefLower.includes('/application') ||
                hrefLower.includes('/jobs/apply') ||
                hrefLower.includes('application-form') ||
                hrefLower.includes('careers/apply') ||
                false
              );
            },
            // Aria labels containing apply
            (el: Element) =>
              el.getAttribute('aria-label')?.toLowerCase().includes('apply') ?? false,
            // Data attributes
            (el: Element) =>
              (el.getAttribute('data-testid')?.toLowerCase().includes('apply') ||
                el.getAttribute('data-cy')?.toLowerCase().includes('apply') ||
                el.getAttribute('data-qa')?.toLowerCase().includes('apply')) ??
              false,
            // Class names
            (el: Element) =>
              (el.className?.toLowerCase().includes('apply') ||
                el.className?.toLowerCase().includes('application') ||
                el.className?.toLowerCase().includes('cta')) ??
              false,
            // Text content contains apply (broader match)
            (el: Element) => {
              const text = el.textContent?.toLowerCase() || '';
              return (
                text.includes('apply now') ||
                text.includes('apply for') ||
                text.includes('submit application') ||
                (text.includes('apply') && !text.includes('linkedin') && !text.includes('share')) ||
                false
              );
            },
          ];

          for (const [selectorIndex, selector] of selectors.entries()) {
            for (const candidate of candidates) {
              try {
                if (selector(candidate)) {
                  // Get the URL
                  const href = (candidate as HTMLAnchorElement).href;
                  const text = candidate.textContent?.trim();

                  console.log(
                    `[DEV] Apply element match - Selector ${selectorIndex + 1}, Text: "${text}", Href: "${href}"`
                  );

                  if (href && href !== window.location.href && href !== '#') {
                    // Check if it's a relative URL and convert to absolute
                    const absoluteUrl = href.startsWith('http')
                      ? href
                      : new URL(href, window.location.href).href;
                    console.log(`[DEV] Found apply link: ${absoluteUrl}`);
                    return absoluteUrl;
                  }
                  // If no href (button), check if it has onclick or data attributes that might lead to apply
                  const onclick = candidate.getAttribute('onclick');
                  const dataHref =
                    candidate.getAttribute('data-href') || candidate.getAttribute('data-url');
                  if (onclick && onclick.includes('apply')) {
                    console.log(`[DEV] Found apply onclick: ${onclick}`);
                    // Extract URL from onclick if possible
                    const urlMatch = onclick.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
                    if (urlMatch) return urlMatch[1];
                  }
                  if (dataHref) {
                    console.log(`[DEV] Found apply data-href: ${dataHref}`);
                    return dataHref.startsWith('http')
                      ? dataHref
                      : new URL(dataHref, window.location.href).href;
                  }
                  // If no href but matches apply text, assume same page form
                  if (
                    text &&
                    (text.toLowerCase().includes('apply') || text.toLowerCase().includes('submit'))
                  ) {
                    console.log(`[DEV] Apply button found but no href - assuming same page form`);
                    return '';
                  }
                }
              } catch (e) {
                console.log(`[DEV] Error checking candidate:`, e);
              }
            }
          }

          console.log(
            `[DEV] No apply link found - assuming application is on same page or handled via JavaScript`
          );
          return '';
        };

        applyLink = findApplyLink();

        return {
          title,
          company,
          description,
          location,
          salary,
          requirements: [...new Set(requirements)],
          benefits: [...new Set(benefits)],
          url: window.location.href,
          applyLink,
        };
      });

      // If requirements/benefits weren't extracted, fall back to regex extraction from description
      if (!jobData.requirements || jobData.requirements.length === 0) {
        jobData.requirements = this.extractRequirementsFromText(jobData.description);
      }
      if (!jobData.benefits || jobData.benefits.length === 0) {
        jobData.benefits = this.extractBenefitsFromText(jobData.description);
      }

      return jobData;
    } catch (error) {
      console.error(`Error crawling job at ${url}:`, error);
      throw new Error(`Failed to crawl job description: ${error}`);
    } finally {
      await page.close();
    }
  }

  // Fallback method for extracting requirements from plain text using regex
  private extractRequirementsFromText(description: string): string[] {
    const requirements: string[] = [];

    // Common requirement patterns
    const patterns = [
      /(?:required|must have|need|qualifications?)[:\s]*([^.!?]+)/gi,
      /(?:experience|years?)[:\s]*(\d+\+?\s*years?)/gi,
      /(?:skills?|technologies?)[:\s]*([^.!?]+)/gi,
      /(?:degree|education)[:\s]*([^.!?]+)/gi,
    ];

    patterns.forEach((pattern) => {
      const matches = description.match(pattern);
      if (matches) {
        requirements.push(...matches.map((match) => match.trim()));
      }
    });

    return [...new Set(requirements)]; // Remove duplicates
  }

  // Fallback method for extracting benefits from plain text using regex
  private extractBenefitsFromText(description: string): string[] {
    const benefits: string[] = [];

    const patterns = [
      /(?:benefits?|perks?|offers?)[:\s]*([^.!?]+)/gi,
      /(?:health|dental|vision|insurance)/gi,
      /(?:remote|flexible|work from home)/gi,
      /(?:pto|vacation|sick leave)/gi,
    ];

    patterns.forEach((pattern) => {
      const matches = description.match(pattern);
      if (matches) {
        benefits.push(...matches.map((match) => match.trim()));
      }
    });

    return [...new Set(benefits)];
  }

  async crawlMultipleJobs(urls: string[]): Promise<JobDescription[]> {
    const results: JobDescription[] = [];

    for (const url of urls) {
      try {
        const jobData = await this.crawlJobDescription(url);
        results.push(jobData);

        // Add delay between requests to be respectful
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to crawl ${url}:`, error);
        // Continue with other URLs even if one fails
      }
    }

    return results;
  }
}
