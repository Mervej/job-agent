import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import uploadRouter from './api/upload';
import genRouter from './api/generate';
import applyRouter from './api/apply';
import resumesRouter from './api/resumes';
import { initDb } from './services/db';
import fs from 'fs';

// Load .env.dev if it exists and NODE_ENV is development, otherwise .env
// Note: ai.config.ts also loads env vars, but we load here too for other parts of the app
const envFile =
  process.env.NODE_ENV === 'development' && fs.existsSync('.env.dev') ? '.env.dev' : '.env';
dotenv.config({ path: envFile });
const app = express();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('chrome-extension://') || origin === 'http://localhost:3000') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

app.use(express.json());

// Lightweight health check for the host's uptime probe
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/upload', uploadRouter);
app.use('/generate', genRouter);
app.use('/apply', applyRouter);
app.use('/resumes', resumesRouter);

const PORT = process.env.PORT || 3000;

initDb();

app.listen(PORT, () => {
  console.log(`Job Agent running on http://localhost:${PORT}`);
});
