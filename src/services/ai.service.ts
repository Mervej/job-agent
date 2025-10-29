import config from '../config/ai.config';
import axios from 'axios';

export async function generateText(systemPrompt: string, userPrompt: string) {
  if (config.provider === 'openai') {
    if (!config.openai.apiKey) throw new Error('OPENAI_API_KEY not set');
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 600
      },
      { headers: { Authorization: `Bearer ${config.openai.apiKey}` } }
    );
    return res.data.choices[0].message.content as string;
  } else if (config.provider === 'ollama') {
    const url = `${config.ollama.url}/api/generate`;
    const res = await axios.post(url, {
      model: config.ollama.model,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      max_tokens: 600
    });
    return res.data.output?.[0]?.content ?? res.data.response ?? '';
  }
  throw new Error('Unsupported AI provider');
}
