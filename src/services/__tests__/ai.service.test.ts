import axios from 'axios';
import { extractJDRequirements, generateStructuredFields, FieldSpec } from '../ai.service';
import { StructuredResume } from '../resume';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

beforeEach(() => {
  jest.clearAllMocks();
});

const mockResume: StructuredResume = {
  profileDetails: { name: 'Jane Doe', email: 'jane@example.com' },
  experience: [
    { company: 'Acme', role: 'Engineer', startDate: '01/2020', endDate: 'Present', description: 'Built things' },
  ],
  education: [{ institution: 'MIT', degree: 'B.Tech', startDate: '2016', endDate: '2020' }],
  skills: ['Node.js', 'TypeScript'],
};

describe('extractJDRequirements', () => {
  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '- 5+ years Node.js\n- TypeScript required' } }] },
    });
  });

  it('calls OpenAI with a recruiter system prompt', async () => {
    await extractJDRequirements('We need a senior Node.js engineer');

    const [, body] = mockedAxios.post.mock.calls[0];
    const systemMsg = (body as any).messages[0];
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toMatch(/recruiter/i);
  });

  it('sends the job text as the user message', async () => {
    await extractJDRequirements('We need a senior Node.js engineer');

    const [, body] = mockedAxios.post.mock.calls[0];
    const userMsg = (body as any).messages[1];
    expect(userMsg.content).toBe('We need a senior Node.js engineer');
  });

  it('returns the model response text', async () => {
    const result = await extractJDRequirements('job text');
    expect(result).toBe('- 5+ years Node.js\n- TypeScript required');
  });
});

describe('generateStructuredFields', () => {
  const fields: FieldSpec[] = [
    { id: 'f0', label: 'Years of experience', formatHint: 'number only, e.g. 8' },
    { id: 'f1', label: 'Why do you want this role?', formatHint: '1-3 sentences, first person' },
  ];

  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      data: { choices: [{ message: { content: JSON.stringify({ f0: '8', f1: 'I love distributed systems' }) } }] },
    });
  });

  it('uses JSON mode response_format for OpenAI', async () => {
    await generateStructuredFields(fields, mockResume, '- Node.js required');

    const [, body] = mockedAxios.post.mock.calls[0];
    expect((body as any).response_format).toEqual({ type: 'json_object' });
  });

  it('includes the structured resume in the system prompt', async () => {
    await generateStructuredFields(fields, mockResume, '- Node.js required');

    const [, body] = mockedAxios.post.mock.calls[0];
    const systemContent = (body as any).messages[0].content as string;
    expect(systemContent).toContain('Jane Doe');
  });

  it('returns parsed JSON mapping field ids to answer strings', async () => {
    const result = await generateStructuredFields(fields, mockResume, '- Node.js required');
    expect(result).toEqual({ f0: '8', f1: 'I love distributed systems' });
  });

  it('returns empty object for empty fields array', async () => {
    const result = await generateStructuredFields([], mockResume, '');
    expect(result).toEqual({});
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('batches into multiple calls when fields exceed 25', async () => {
    const manyFields: FieldSpec[] = Array.from({ length: 30 }, (_, i) => ({
      id: `f${i}`,
      label: `Field ${i}`,
      formatHint: 'value only',
    }));

    mockedAxios.post
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: JSON.stringify(Object.fromEntries(manyFields.slice(0, 25).map(f => [f.id, 'answer']))) } }] } })
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: JSON.stringify(Object.fromEntries(manyFields.slice(25).map(f => [f.id, 'answer']))) } }] } });

    const result = await generateStructuredFields(manyFields, mockResume, '');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(Object.keys(result)).toHaveLength(30);
  });
});
