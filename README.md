# Job Agent — Starter Scaffold

This is a local-first Node + TypeScript starter scaffold for your AI Job Application Agent.

## Quick start

1. Install dependencies
```bash
npm install
```

2. Copy `.env.example` to `.env` and edit values
```bash
cp .env.example .env
# set OPENAI_API_KEY or configure OLLAMA_URL and set AI_PROVIDER=ollama
```

3. Start in dev mode
```bash
npm run dev
```

4. Upload resume
POST a multipart/form-data request to `http://localhost:3000/upload` with field `file`.

5. Generate a cover letter
POST JSON to `http://localhost:3000/generate/cover-letter`:
```json
{
  "jobTitle": "Backend Engineer",
  "company": "Example Corp",
  "jobDescription": "Build scalable microservices...",
  "resumeSnippet": "Your resume text or the stored resume text"
}
```

## Notes
- AI provider is configurable via `AI_PROVIDER` env var: `openai` or `ollama`.
- This scaffold stores data locally in SQLite and files under `src/data`.
- Playwright automation is a stub — per-site selectors to be added later.
