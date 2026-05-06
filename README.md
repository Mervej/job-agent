# Job Agent — AI-Powered Job Application Assistant

An intelligent, local-first job application automation system that helps streamline the job search process. Built with Node.js, TypeScript, and modern web technologies, this agent can automatically fill out job applications, generate tailored cover letters, and manage your job search workflow.

## Features

- **Resume Management**: Upload and parse PDF resumes with structured data extraction
- **AI Cover Letter Generation**: Generate personalized cover letters using OpenAI GPT or local Ollama models
- **Job Description Crawling**: Automatically extract job details from any job posting URL
- **Automated Form Filling**: Intelligent form detection and completion using Playwright browser automation
- **Local Data Storage**: SQLite database for persistent storage with no external dependencies
- **Multi-Provider AI Support**: Switch between OpenAI and Ollama for AI generation
- **RESTful API**: Clean HTTP API for integration with other tools

## Technical Architecture

### Core Technologies

- **Backend**: Node.js with Express.js server
- **Language**: TypeScript for type safety and better developer experience
- **Database**: SQLite with better-sqlite3 for local data persistence
- **Browser Automation**: Playwright for headless browser control and form interaction
- **AI Integration**: OpenAI GPT API or Ollama for local AI model inference
- **PDF Processing**: pdf-parse for resume text extraction
- **File Uploads**: Formidable for multipart file handling

### Key Services

#### Application Filler (`application-filler.ts`)

- **Playwright Integration**: Launches Chromium browser for form interaction
- **Smart Field Detection**: Analyzes HTML forms to identify input types, labels, and requirements
- **AI-Powered Mapping**: Uses AI to intelligently map resume data to form fields
- **Form Validation**: Handles required fields, dropdown selections, and complex form structures
- **Screenshot Capture**: Takes screenshots for debugging and verification

#### Job Crawler (`job-crawler.ts`)

- **Content Analysis**: Uses heuristics and semantic HTML parsing to extract job details
- **Generic Extraction**: Works with any job posting website without site-specific selectors
- **Structured Data**: Extracts title, company, description, location, salary, and requirements
- **Link Discovery**: Finds application URLs from job description pages

#### AI Service (`ai.service.ts`)

- **Multi-Provider Support**: Configurable between OpenAI and Ollama
- **Prompt Engineering**: Specialized prompts for cover letter generation and form mapping
- **Error Handling**: Robust error handling with helpful debugging messages
- **Token Management**: Efficient token usage with configurable limits

#### Resume Parser (`resume.ts`)

- **PDF Text Extraction**: Converts PDF resumes to structured text
- **Data Normalization**: Standardizes resume data into consistent formats
- **Profile Extraction**: Pulls contact information, experience, and skills
- **Structured Storage**: Maintains both raw text and parsed structured data

### Database Schema

- **Resumes Table**: Stores uploaded resume files and extracted text
- **Applications Table**: Tracks application submissions with metadata
- **User Profiles**: Cached profile information for quick access

## Quick Start

1. **Install Dependencies**

```bash
npm install
```

2. **Configure Environment**

```bash
cp .env.example .env
# Edit .env to set:
# - OPENAI_API_KEY (for OpenAI) or OLLAMA_URL/AI_PROVIDER=ollama (for local models)
# - PORT (optional, defaults to 3000)
```

3. **Start Development Server**

```bash
npm run dev
```

4. **Upload Resume**

```bash
curl -X POST -F "file=@your-resume.pdf" http://localhost:3000/upload
```

5. **Generate Cover Letter**

```bash
curl -X POST http://localhost:3000/generate/cover-letter \
  -H "Content-Type: application/json" \
  -d '{
    "jobTitle": "Backend Engineer",
    "company": "Example Corp",
    "jobDescription": "Build scalable microservices...",
    "resumeSnippet": "Your resume text"
  }'
```

6. **Apply to Multiple Jobs**

```bash
curl -X POST http://localhost:3000/apply/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrls": ["https://example.com/job1", "https://example.com/job2"],
    "resumeId": "your-resume-id"
  }'
```

## Claude Code Skill

### `/apply-jobs`

Autonomously applies to jobs, verifies all form fields are filled, and fixes issues in the source code if needed.

**Usage:**
```
/apply-jobs <url1> [url2 ...] [--resume-id <id>]
```

**Example:**
```
/apply-jobs https://apply.workable.com/innovaccer-analytics/j/71B3042036/ --resume-id 11
```

**What it does:**
1. Starts the backend on port 3001 if not already running
2. Calls `POST /apply/jobs` to trigger the full apply flow
3. Opens the Workable apply form in Chrome and verifies each critical field
4. If any field is empty, debugs the TypeScript source and fixes it
5. Iterates up to 3 times, then escalates with a report
6. Leaves the browser tab open for you to review and submit manually

**Prerequisites:** Claude Code with claude-in-chrome extension installed and Node.js debugger MCP configured.

## API Endpoints

### Resume Management

- `POST /upload` - Upload PDF resume for processing
- `GET /upload/:id` - Retrieve stored resume information

### Content Generation

- `POST /generate/cover-letter` - Generate AI-powered cover letter

### Job Applications

- `POST /apply/jobs` - Process multiple job applications automatically
- `GET /apply/status/:id` - Check application submission status

## Configuration

### Environment Variables

```env
# AI Provider Configuration
AI_PROVIDER=openai|ollama
OPENAI_API_KEY=your-openai-key
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_PATH=./src/data/job-history.db
```

### AI Model Configuration

- **OpenAI**: Supports GPT-3.5-turbo and GPT-4 models
- **Ollama**: Compatible with any Ollama-hosted model (Llama 2, Code Llama, etc.)

ollama create jobagent-phi3 -f Modelfile
ollama run jobagent-phi3

## Data Storage

- **SQLite Database**: `src/data/job-history.db`
  - Resume metadata and extracted text
  - Application history and status
  - User profile information

- **File Storage**: `src/data/resumes/`
  - Original PDF files with hashed filenames
  - Secure local storage with no external uploads

## Development

### Building

```bash
npm run build  # Compile TypeScript to JavaScript
npm start      # Run production build
```

### Project Structure

```
src/
├── api/           # HTTP route handlers
├── services/      # Core business logic
│   ├── ai.service.ts         # AI integration
│   ├── application-filler.ts # Form automation
│   ├── job-crawler.ts        # Job data extraction
│   └── resume.ts             # Resume processing
├── config/        # Configuration management
└── data/          # Local data storage
```

## Security & Privacy

- **Local-First Design**: All data stored locally, no external data transmission
- **No Data Collection**: Operates entirely offline except for AI API calls
- **Secure File Handling**: Hashed filenames prevent enumeration attacks
- **Browser Automation**: Uses headless Chrome with anti-detection measures

## Limitations & Future Enhancements

- **Form Compatibility**: Currently optimized for common form patterns; may need updates for highly customized forms
- **Site-Specific Logic**: Generic extraction works for most sites but could be enhanced with site-specific parsers
- **Multi-Page Forms**: Handles single-page applications but may need extensions for complex multi-step forms
- **Resume Formats**: Currently supports PDF; could be extended to DOCX and other formats

## Contributing

This is an open-source project focused on improving the job search experience. Contributions for:

- Additional job board integrations
- Enhanced form detection algorithms
- New AI model support
- Improved error handling and edge cases

## License

MIT License - See LICENSE file for details.
