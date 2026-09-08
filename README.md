# Job Agent — AI-Powered Job Application Assistant

> Auto-fills job application forms from your resume — using AI, running inside your real browser via a Chrome extension.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

**Live backend:** [`job-agent-backend-jg3v.onrender.com/health`](https://job-agent-backend-jg3v.onrender.com/health) (free tier — first request may take ~50s to wake)

Job Agent is a local-first assistant that takes the tedium out of job applications. Upload your resume once; then on any job application page, a Chrome extension detects the form, asks an AI backend to map your resume onto the fields, and fills them in — flagging anything it isn't confident about for you to review. It runs in your own browser session, so there's no headless automation and no anti-bot detection. **It never submits for you** — you always review and click submit yourself.

---

## Demo

![Job Agent filling an application form](docs/assets/demo.gif)

*The side panel detects the application page, maps the resume to the form, and fills each field — flagging low-confidence answers for review.*

---

## Highlights

- 🧩 **Real-browser form filling** — a Manifest V3 Chrome extension fills forms in your live session. No detection, no flaky headless browser.
- 🎯 **Smart ATS detection** — recognizes 14 ATS URL patterns (Workable, Greenhouse, Lever, Ashby, +more) plus a generic DOM heuristic for everything else.
- 🤖 **AI field mapping with confidence scores** — resume data is mapped to form fields by an LLM; low-confidence answers are flagged for manual review instead of guessed.
- 📝 **Tailored cover letters** — generates a per-job cover letter (and PDF) from the crawled job description.
- 🔁 **Multi-provider AI** — local Ollama (free), Groq (free cloud tier), or OpenAI, switchable via config.
- 🔒 **Local-first & private** — resumes and history live in local SQLite; the only outbound calls are to your chosen AI provider.

---

## How it works

```
┌─────────────────────┐         ┌──────────────────────────┐
│  Chrome Extension   │  HTTP   │   Express Backend (src/)  │
│  (runs in your tab) │ ──────▶ │                           │
│  • detect ATS page  │         │  • resume storage (SQLite)│
│  • extract fields   │ ◀────── │  • cover letter + PDF     │
│  • fill fields      │ mappings│  • AI field mapping       │
│  • flag low-conf.   │         │  • job crawler            │
└─────────────────────┘         └──────────────────────────┘
```

1. You open a job application page. The extension detects it (ATS URL pattern or DOM heuristic) and slides in a side panel.
2. The panel loads your resumes from the backend; you pick one.
3. The content script extracts the form's fields and sends them to `POST /apply/map-fields`.
4. The backend crawls the job description, generates a cover letter, and uses AI to map your resume onto each field with a confidence score.
5. The extension fills the fields. Anything below the confidence threshold is flagged ⚠ with an editable input for you to fix.
6. On multi-step forms it auto-advances, then **stops at the final review page** for you to submit manually.

Full design write-up: [`docs/superpowers/specs/2026-05-27-chrome-extension-design.md`](docs/superpowers/specs/2026-05-27-chrome-extension-design.md).

---

## Tech stack

**Backend:** Node.js · TypeScript · Express · SQLite (`better-sqlite3`) · pdfkit · pdf-parse
**AI:** Ollama (local) · Groq · OpenAI — batched field-mapping call
**Extension:** Chrome Manifest V3 (service worker, content script, side-panel UI)
**Tests:** Jest (`ts-jest`)

---

## Components

### Chrome Extension (`extension/`)

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest — `activeTab`, `storage`, `scripting` |
| `background.js` | Service worker; relays `FETCH_RESUMES` / `MAP_FIELDS` messages to the backend |
| `content-script.js` | Form detection, panel injection, fill cycle, confidence flagging, auto-advance, stop at review |
| `utils/ats-patterns.js` | 14 ATS URL patterns |
| `utils/field-extractor.js` | DOM field extraction with label/question resolution |
| `utils/field-filler.js` | Type-aware filling (text, select, radio, checkbox, combobox, contenteditable) with synthetic React/Vue events |
| `panel/` | Three-state side panel: **detecting → filling → review** |

### Backend (`src/`)

| Service | Role |
|---|---|
| `services/field-mapper.service.ts` | Maps extracted fields → resume values with confidence scores; enforces dropdown options via fuzzy matching |
| `services/ai.service.ts` | Multi-provider AI (OpenAI / Ollama); single batched mapping call |
| `services/cover-letter-generator.ts` | Cover letter + PDF generation |
| `services/job-crawler.ts` | Job detail extraction from any posting URL |
| `services/resume.ts`, `db.ts`, `encrypt.ts` | Resume parsing + SQLite storage |
| `agents/` | `form-analyzer`, `field-filler`, `verifier`, `html-form-extractor` |

---

## Run it locally

```bash
# 1. Install
npm install

# 2. Configure — set OPENAI_API_KEY (or AI_PROVIDER=ollama)
cp .env.example .env

# 3. Start the backend (nodemon + ts-node, debugger on :9229)
npm run dev

# 4. Upload a resume
curl -X POST -F "file=@your-resume.pdf" http://localhost:3000/upload
```

**Load the extension (two options):**

- **From release .zip** — go to [Releases](../../releases), download `job-agent-extension-v*.zip`, unzip it, then `chrome://extensions` → Developer mode → **Load unpacked** → select the unzipped folder.
- **From source** — clone the repo, then `chrome://extensions` → Developer mode → **Load unpacked** → select the `extension/` folder directly.

> No live form handy? Open one of the bundled sample forms in `demo-html/` (e.g. `demo-job-page.html`) and run the extension against it.

---

## Deploy (free)

The backend runs live on [Render](https://render.com)'s free tier at **[job-agent-backend-jg3v.onrender.com](https://job-agent-backend-jg3v.onrender.com/health)** — no credit card. The repo ships a [`render.yaml`](render.yaml) Blueprint, a `/health` probe, and a compiled-JS start command. To deploy your own: push to GitHub, create a Render Blueprint, paste a free [Groq](https://console.groq.com) API key, and you get a public URL.

Full walkthrough: **[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

---

## API

| Endpoint | Purpose |
|---|---|
| `POST /upload` | Upload a PDF resume; AI-parses it into structured profile fields (contact info, experience with dates, education, skills, summary) |
| `GET /resumes` | List resumes (powers the extension dropdown) |
| `GET /resumes/:id/file` | Download a resume PDF |
| `POST /generate/cover-letter` | Generate an AI cover letter |
| `POST /apply/map-fields` | `{fields[], resumeId, jobUrl}` → `{mappings:[{selector,value,confidence}], coverLetter}` |
| `GET /apply/status/:id` | Application status |

CORS allows `chrome-extension://` origins.

---

## Tests

```bash
npx jest   # 21 passing across 3 suites
```

---

## Configuration

```env
AI_PROVIDER=ollama|groq|openai   # ollama = fully local & free; groq = free cloud tier
AI_MODEL=qwen2.5:7b              # or openai/gpt-oss-120b (groq) / gpt-4o-mini (openai)
OLLAMA_URL=http://localhost:11434
GROQ_API_KEY=gsk_...            # only if AI_PROVIDER=groq
OPENAI_API_KEY=sk_...           # only if AI_PROVIDER=openai
PORT=3000
DATABASE_PATH=./src/data/job-history.db
```

See [`.env.example`](.env.example) for the full annotated list.

Local Ollama model: `ollama create jobagent-phi3 -f job-agent-model.Modelfile && ollama run jobagent-phi3`.

---

## Roadmap

- [ ] Demo/mock mode so the app runs with no API key (zero-cost public demo)
- [ ] Optional web dashboard (upload resume + view history in the browser, no extension needed)
- [ ] Postgres + object storage for multi-user / cloud deployment
- [ ] Publish the extension to the Chrome Web Store
- [ ] Broaden ATS coverage and harden multi-step navigation

---

## Security & Privacy

- **Local-first** — resumes, structured data, and history stay in local SQLite (`src/data/`); the only external calls are to your chosen AI provider.
- **Real-session filling** — the extension runs in your own browser; no headless automation or credential handling.
- **Hashed filenames** — stored resume PDFs use hashed names to prevent enumeration.
- **Manual submit** — the agent never submits an application for you.

## License

MIT — see [LICENSE](LICENSE).
