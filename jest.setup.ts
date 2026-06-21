// Set AI provider env vars before any module loads.
// dotenv does not override pre-existing env vars, so these take priority over .env values.
process.env.AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = 'test-key';
process.env.AI_MODEL = 'gpt-4o-mini';
