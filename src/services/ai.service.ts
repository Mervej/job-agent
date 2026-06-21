import config from '../config/ai.config';
import axios from 'axios';
import { StructuredResume } from './resume';

export interface FieldSpec {
  id: string;
  label: string;
  formatHint: string;
}

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

export async function extractJDRequirements(jobText: string): Promise<string> {
  const systemPrompt =
    'You are a technical recruiter. Extract the key hiring requirements from the job description below. ' +
    'Return ONLY a bullet list of 5-7 items covering required skills, experience level, domain, and nice-to-haves. ' +
    'Format each item as "- <requirement>". No preamble, no headers, just the bullet list.';
  return generateText(systemPrompt, jobText, 300);
}

export async function generateStructuredFields(
  fields: FieldSpec[],
  structuredResume: StructuredResume,
  jdSummary: string
): Promise<Record<string, string>> {
  if (fields.length === 0) return {};

  const BATCH_SIZE = 25;
  const results: Record<string, string> = {};

  for (let i = 0; i < fields.length; i += BATCH_SIZE) {
    const slice = fields.slice(i, i + BATCH_SIZE);
    const batch = await _generateFieldBatch(slice, structuredResume, jdSummary);
    Object.assign(results, batch);
  }

  return results;
}

async function _generateFieldBatch(
  fields: FieldSpec[],
  structuredResume: StructuredResume,
  jdSummary: string
): Promise<Record<string, string>> {
  const name = structuredResume.profileDetails?.name || 'the candidate';

  const systemPrompt = `You are filling a job application for ${name}.
Rules:
- Use ONLY data from the resume below. Do not invent facts not present in the resume.
- Follow each field's formatHint exactly — output only the value, nothing else.
- If information is not in the resume, output an empty string "" for that field.
- Return ONLY a valid JSON object mapping each field id to its answer string.

Resume:
${JSON.stringify(structuredResume, null, 2)}

Job requirements:
${jdSummary || 'Not provided'}`;

  const userPrompt =
    'Fill these application fields. Return a JSON object { id: answer }:\n' +
    JSON.stringify(fields.map(f => ({ id: f.id, label: f.label, formatHint: f.formatHint })));

  if (config.provider === 'openai') {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      },
      { headers: { Authorization: `Bearer ${config.openai.apiKey}` } }
    );
    try {
      return JSON.parse(res.data.choices[0].message.content) as Record<string, string>;
    } catch {
      return {};
    }
  }

  if (config.provider === 'groq') {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: config.groq.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
        temperature: 0.3,
      },
      { headers: { Authorization: `Bearer ${config.groq.apiKey}` } }
    );
    try {
      return JSON.parse(res.data.choices[0].message.content) as Record<string, string>;
    } catch {
      return {};
    }
  }

  // Ollama fallback — no JSON mode, parse JSON from text response
  const raw = await generateText(systemPrompt, userPrompt, 2000);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    return JSON.parse(jsonMatch[0]) as Record<string, string>;
  } catch {
    return {};
  }
}
