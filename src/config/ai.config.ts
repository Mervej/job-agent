// Load environment variables before reading them
import dotenv from 'dotenv';
import fs from 'fs';

const envFile =
  process.env.NODE_ENV === 'development' && fs.existsSync('.env.dev') ? '.env.dev' : '.env';
dotenv.config({ path: envFile });

const provider = process.env.AI_PROVIDER || 'openai';

export default {
  provider,
  model: process.env.AI_MODEL || 'gpt-4o-mini',
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.AI_MODEL || 'llama2',
  },
};
