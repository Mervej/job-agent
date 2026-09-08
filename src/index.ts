import './loadEnv'; // must be first — loads .env.dev or .env before any service module runs
import express from 'express';
import cors from 'cors';
import uploadRouter from './api/upload';
import genRouter from './api/generate';
import applyRouter from './api/apply';
import resumesRouter from './api/resumes';
import profileRouter from './api/profile';
import { requireAuth } from './middleware/auth';
import { generateText } from './services/ai.service';
import aiConfig from './config/ai.config';

const app = express();

const rawFrontendUrl = process.env.FRONTEND_URL;
const frontendUrl = rawFrontendUrl
  ? rawFrontendUrl.startsWith('http') ? rawFrontendUrl : `https://${rawFrontendUrl}`
  : undefined;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  frontendUrl,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('chrome-extension://') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

// Default 100kb is too small: real ATS pages (e.g. Phenom-based career sites like
// Marsh's) embed full <select> option lists (countries, phone codes, referral
// sources) that field-extractor.js sends verbatim in the /apply/map-fields payload.
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Makes a real call to the configured AI provider — catches config drift (bad API key,
// decommissioned model, unreachable Ollama) that generateText() callers silently swallow.
app.get('/health/ai', async (_req, res) => {
  const model =
    aiConfig.provider === 'groq' ? aiConfig.groq.model :
    aiConfig.provider === 'ollama' ? aiConfig.ollama.model :
    aiConfig.model;
  const started = Date.now();
  try {
    const reply = await generateText('Reply with exactly one word.', 'Say "ok".', 5);
    res.json({ status: 'ok', provider: aiConfig.provider, model, latencyMs: Date.now() - started, reply: reply.trim().slice(0, 50) });
  } catch (error: any) {
    res.status(503).json({ status: 'error', provider: aiConfig.provider, model, error: error.message });
  }
});

app.use('/upload', requireAuth, uploadRouter);
app.use('/generate', requireAuth, genRouter);
app.use('/apply', requireAuth, applyRouter);
app.use('/resumes', requireAuth, resumesRouter);
app.use('/profile', requireAuth, profileRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Job Agent running on http://localhost:${PORT}`);
});
