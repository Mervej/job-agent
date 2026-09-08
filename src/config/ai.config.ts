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
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.AI_MODEL || 'openai/gpt-oss-120b',
  },
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.AI_MODEL || 'qwen2.5:7b',
    visionModel: process.env.OLLAMA_VISION_MODEL || 'llava-phi3',
  },
};
