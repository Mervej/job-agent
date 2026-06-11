import './loadEnv'; // must be first — loads .env.dev or .env before any service module runs
import express from 'express';
import cors from 'cors';
import uploadRouter from './api/upload';
import genRouter from './api/generate';
import applyRouter from './api/apply';
import resumesRouter from './api/resumes';
import profileRouter from './api/profile';
import { requireAuth } from './middleware/auth';

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

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
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
