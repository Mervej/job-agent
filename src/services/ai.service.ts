import config from '../config/ai.config';
import axios from 'axios';

export async function generateText(systemPrompt: string, userPrompt: string) {
  if (config.provider === 'openai') {
    console.log('config ', config.openai);
    if (!config.openai.apiKey) throw new Error('OPENAI_API_KEY not set');
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 600,
      },
      { headers: { Authorization: `Bearer ${config.openai.apiKey}` } }
    );
    return res.data.choices[0].message.content as string;
  } else if (config.provider === 'ollama') {
    const url = `${config.ollama.url}/api/generate`;
    const requestBody = {
      model: config.ollama.model,
      prompt: `${userPrompt}`,
      stream: false, // Request non-streaming response
    };

    console.log(`[Ollama] Calling ${url} with model: ${config.ollama.model}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Ollama] API error (${response.status}):`, errorText);
        console.error(`[Ollama] Request URL: ${url}`);
        console.error(`[Ollama] Request body:`, JSON.stringify(requestBody, null, 2));

        // Provide helpful error messages
        if (response.status === 500) {
          throw new Error(
            `Ollama 500 error. Common causes:\n` +
              `1. Model "${config.ollama.model}" not available. Run: ollama pull ${config.ollama.model}\n` +
              `2. Ollama server issue. Check: ollama list\n` +
              `3. Error details: ${errorText}`
          );
        }

        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}. ${errorText}`
        );
      }

      const data = await response.json();

      // Ollama /api/generate returns response in 'response' field
      if (data.response) {
        return data.response;
      }

      // Some versions might return differently
      if (data.text) {
        return data.text;
      }

      // Fallback: check for alternative response formats
      if (typeof data === 'string') {
        return data;
      }

      console.error('[Ollama] Unexpected response format:', JSON.stringify(data, null, 2));
      throw new Error('Unexpected response format from Ollama API');
    } catch (error: any) {
      if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
        throw new Error(
          `Failed to connect to Ollama at ${url}.\n` +
            `Make sure Ollama is running: ollama serve\n` +
            `Or check if OLLAMA_URL is set correctly in your .env file.`
        );
      }
      throw error;
    }
  }
  throw new Error('Unsupported AI provider');
}
