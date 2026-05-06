# Job Agent - Automated Job Application System

## Overview

This enhanced Job Agent can now:

1. **Crawl job descriptions** from job posting URLs
2. **Generate tailored cover letters** using AI
3. **Automatically fill and submit** job applications
4. **Track application status** and results

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create `.env` file:

```bash
# AI Provider (choose one)
AI_PROVIDER=openai  # or ollama
OPENAI_API_KEY=your_openai_key_here

# OR for local Ollama
# AI_PROVIDER=ollama
# OLLAMA_URL=http://localhost:11434

# Optional
PORT=3000
DB_PATH=./src/data/job-history.db
```

### 3. Start the Server

```bash
npm run dev
```

## API Endpoints

### Resume Management

#### Upload Resume with User Profile

```bash
curl -X POST \
  -F "file=@/path/to/resume.pdf" \
  -F "name=John Doe" \
  -F "email=john@example.com" \
  -F "phone=+1234567890" \
  -F "location=San Francisco, CA" \
  -F "linkedin=https://linkedin.com/in/johndoe" \
  -F "github=https://github.com/johndoe" \
  -F "experience=5 years of software development" \
  -F 'skills=["JavaScript", "TypeScript", "React", "Node.js"]' \
  -F 'achievements=["Led team of 5 developers", "Increased performance by 40%"]' \
  http://localhost:3000/upload
```

#### List Resumes

```bash
curl http://localhost:3000/upload
```

#### Get User Profile for Resume

```bash
curl http://localhost:3000/upload/1/profile
```

#### Update User Profile

```bash
curl -X PUT http://localhost:3000/upload/1/profile \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1987654321",
    "location": "New York, NY",
    "skills": ["JavaScript", "TypeScript", "React", "Node.js", "Python"]
  }'
```

### Job Application Automation

#### Apply to Multiple Jobs

```bash
curl -X POST http://localhost:3000/apply/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrls": [
      "https://company1.com/job/123",
      "https://company2.com/job/456"
    ],
    "resumeId": 1
  }'
```

#### Apply to Single Job

```bash
curl -X POST http://localhost:3000/apply/job \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "https://company.com/job/123",
    "resumeId": 1
  }'
```

## Handling Job Descriptions on Multiple Pages

The job agent now intelligently handles both scenarios:

### Scenario 1: Job Description and Apply Button on the Same Page

When the job description and apply button are on the same page, the agent will:

1. Crawl the job details from the page
2. Set `applyLink` to `null` or empty
3. Fill out and submit the application form on the same page

**Example:** Many job boards embed the application form on the job description page.

### Scenario 2: Job Description and Application Form on Different Pages

When the apply button links to a different page, the agent will:

1. Crawl the job details from the job description page
2. Extract the apply link and store it in `applyLink`
3. Navigate to the apply link URL to fill out the application form
4. Fill out and submit the application on the separate page

**Example:** Stripe's careers page has job descriptions with "Apply Now" links that redirect to a dedicated application form.

## How It Works

### Job Crawling (crawlJobDescription)

The crawler now:

- Extracts all job information (title, company, description, etc.)
- **Automatically detects apply buttons** using multiple heuristics:
  - Button text containing "apply now" or "apply"
  - Links with `/apply` in the URL
  - Aria labels containing "apply"
  - Data-testid attributes containing "apply"
  - Class names containing "apply"
- Returns `applyLink` if a button linking to a different page is found
- Returns empty/null if the apply button is on the same page

### Application Filling (fillApplication)

The filler now:

- Accepts an optional `applyLink` parameter
- If `applyLink` is provided and different from `jobUrl`:
  - Navigates to the `applyLink` instead of `jobUrl`
  - Fills out the application form on that page
- If `applyLink` is not provided or same as `jobUrl`:
  - Stays on the job page and fills out the form there
- Uses enhanced form field detection with 50+ selectors
- Finds submit buttons using robust text-based matching

### Enhanced Form Detection

The application filler now recognizes:

- **Name fields:** firstName, first_name, fname (and variations)
- **Email fields:** email, emailAddress, and type="email"
- **Phone fields:** phone, phoneNumber, tel (and variations)
- **LinkedIn fields:** linkedin, with multiple selector variations
- **GitHub fields:** github (and variations)
- **Location fields:** location, location, city
- **Cover Letter fields:**
  - cover letter, letter, motivation, why
  - Multiple placeholder variations
- **Resume fields:** file inputs with common patterns

### Submit Button Detection

The form now finds submit buttons with multiple strategies:

1. **Text-based matching:** "Submit Application", "Apply Now", etc.
2. **Priority order:** More specific matches first (e.g., "Submit Application" before just "Submit")
3. **Fallback:** CSS selectors like `button[type="submit"]`
4. **Attribute checking:** data-testid, aria-label attributes

## API Response

When applying to a job, the API now returns:

```json
{
  "jobTitle": "Software Engineer, Operations Platform",
  "company": "Stripe",
  "applicationId": 123,
  "success": true,
  "applyLink": "https://stripe.com/jobs/apply/..." // If on different page
}
```

## Examples

### Same-Page Application

```bash
curl -X POST http://localhost:3000/api/apply/job \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "https://example.com/jobs/123",
    "resumeId": 1
  }'
```

The agent will find the application form on the same page and fill it out.

### Different-Page Application

```bash
curl -X POST http://localhost:3000/api/apply/job \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "https://stripe.com/jobs/listing/...",
    "resumeId": 1
  }'
```

The agent will:

1. Crawl the job page
2. Find the "Apply Now" link pointing to `https://stripe.com/jobs/apply/...`
3. Navigate to the apply page
4. Fill out the application form there

## How It Works

### 1. Job Crawling

- Uses Playwright to navigate job posting pages
- Extracts job title, company, description, location, salary
- Identifies key requirements and benefits
- Handles various job board formats (LinkedIn, Indeed, company sites)

### 2. Cover Letter Generation

- Analyzes job requirements and candidate profile
- Generates personalized, tailored cover letters
- Uses AI to match skills and experience to job needs
- Creates unique content for each application

### 3. Application Filling

- Automatically fills common form fields:
  - Personal information (name, email, phone)
  - Professional links (LinkedIn, GitHub)
  - Cover letter text
  - Resume upload
- Handles various form layouts and field names
- Takes screenshots for verification

### 4. Application Tracking

- Stores all applications in SQLite database
- Tracks success/failure status
- Saves cover letters and error messages
- Provides application history

## Supported Job Sites

The crawler works with most job posting sites including:

- LinkedIn Jobs
- Indeed
- Glassdoor
- Company career pages
- AngelList
- Remote job boards

## Configuration

### Browser Settings

- Set `headless: false` in `application-filler.ts` to see browser automation
- Adjust delays and timeouts based on site performance
- Add site-specific selectors for better form filling

### AI Settings

- Configure model and parameters in `ai.config.ts`
- Adjust prompt templates in `cover-letter-generator.ts`
- Set rate limits to avoid API throttling

## Error Handling

- Failed job crawls are logged but don't stop batch processing
- Form filling errors are captured with screenshots
- All errors are stored in the database for review
- Retry logic can be added for transient failures

## Security Notes

- Resume files are stored locally
- No sensitive data is sent to external services (except AI provider)
- Browser automation runs in isolated environment
- Consider using headless mode in production

## Troubleshooting

### Common Issues

1. **Job crawling fails**: Check if the site blocks automated access
2. **Form filling fails**: Site may have changed selectors or added CAPTCHA
3. **AI generation fails**: Check API key and rate limits
4. **Resume not found**: Ensure resumeId exists in database

### Debug Mode

Set browser to non-headless mode to see automation in action:

```typescript
// In application-filler.ts
headless: false;
```

## Next Steps

- Add support for more job sites
- Implement CAPTCHA solving
- Add email notifications for application status
- Create web dashboard for monitoring
- Add resume optimization suggestions
