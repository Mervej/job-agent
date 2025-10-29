const provider = process.env.AI_PROVIDER || 'openai';

export default {
  provider,
  model: process.env.AI_MODEL || 'gpt-4o-mini',
  openai: {
    apiKey: process.env.OPENAI_API_KEY || ''
  },
  ollama: {
    url: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.AI_MODEL || 'llama3'
  }
};
