import config from '../config/ai.config';
import axios from 'axios';

export async function generateText(systemPrompt: string, userPrompt: string, maxTokens = 600) {
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
        max_tokens: maxTokens,
      },
      { headers: { Authorization: `Bearer ${config.openai.apiKey}` } }
    );
    return res.data.choices[0].message.content as string;
  } else if (config.provider === 'groq') {
    if (!config.groq.apiKey) throw new Error('GROQ_API_KEY not set');
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: config.groq.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      },
      { headers: { Authorization: `Bearer ${config.groq.apiKey}` } }
    );
    return res.data.choices[0].message.content as string;
  } else if (config.provider === 'ollama') {
    const url = `${config.ollama.url}/api/generate`;

    const isJsonRequest = systemPrompt.includes('JSON') || userPrompt.includes('Return ONLY the JSON');
    const requestBody = {
      model: config.ollama.model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature: 0.3,
        top_k: 40,
        top_p: 0.9,
        repeat_penalty: 1.1,
        stop: isJsonRequest ? ['\n\n\n', '```'] : ['<|end|>', '<|user|>'],
      },
    };

    console.log(`[Ollama] Calling ${url} with model: ${config.ollama.model}`);

    try {
      const response = await axios.post(url, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000, // phi33 takes ~2min per call
      });

      const data = response.data;

      if (data.response) return data.response;
      if (data.text) return data.text;
      if (typeof data === 'string') return data;

      throw new Error('Unexpected response format from Ollama');
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
        throw new Error(
          `Could not connect to Ollama at ${url}. Make sure Ollama is running (ollama serve).`
        );
      }
      throw error;
    }
  }

  throw new Error('Unsupported AI provider');
}

/**
 * Analyzes a page screenshot using the local vision model (moondream).
 * Used for detecting dynamic UI elements like + buttons, Add sections,
 * date pickers, and custom components that DOM parsing misses.
 */
export async function analyzeScreenshot(imageBuffer: Buffer, prompt: string): Promise<string> {
  const url = `${config.ollama.url}/api/generate`;
  const base64Image = imageBuffer.toString('base64');

  console.log(`[Vision] Calling ${url} with model: ${config.ollama.visionModel}`);

  try {
    const response = await axios.post(
      url,
      {
        model: config.ollama.visionModel,
        prompt,
        images: [base64Image],
        stream: false,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    const data = response.data;

    if (data.response) return data.response as string;
    throw new Error('Unexpected response format from vision model');
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      throw new Error(`Could not connect to Ollama at ${url}. Make sure Ollama is running.`);
    }
    throw error;
  }
}
