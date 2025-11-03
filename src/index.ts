import express from 'express';
import dotenv from 'dotenv';
import uploadRouter from './api/upload';
import genRouter from './api/generate';
import applyRouter from './api/apply';
import { initDb } from './services/db';
import fs from 'fs';

// Load .env.dev if it exists and NODE_ENV is development, otherwise .env
// Note: ai.config.ts also loads env vars, but we load here too for other parts of the app
const envFile =
  process.env.NODE_ENV === 'development' && fs.existsSync('.env.dev') ? '.env.dev' : '.env';
dotenv.config({ path: envFile });
const app = express();
app.use(express.json());

app.use('/upload', uploadRouter);
app.use('/generate', genRouter);
app.use('/apply', applyRouter);

const PORT = process.env.PORT || 3000;

initDb();

app.listen(PORT, () => {
  console.log(`Job Agent running on http://localhost:${PORT}`);
});
