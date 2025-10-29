import express from 'express';
import dotenv from 'dotenv';
import uploadRouter from './api/upload';
import genRouter from './api/generate';
import { initDb } from './services/db';

dotenv.config();
const app = express();
app.use(express.json());

app.use('/upload', uploadRouter);
app.use('/generate', genRouter);

const PORT = process.env.PORT || 3000;

initDb();

app.listen(PORT, () => {
  console.log(`Job Agent running on http://localhost:${PORT}`);
});
