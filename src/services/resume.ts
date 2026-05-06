import fs from 'fs';
import pdf from 'pdf-parse';
import { generateText } from './ai.service';

export interface StructuredResume {
  profileDetails: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    website?: string;
    [key: string]: string | undefined;
  };
  summary?: string;
  experience: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string | 'Present';
    location?: string;
    description?: string;
    achievements?: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    fieldOfStudy?: string;
    startDate: string;
    endDate: string;
    description?: string;
  }>;
  projects?: Array<{
    name: string;
    description?: string;
    technologies?: string[];
    startDate?: string;
    endDate?: string;
  }>;
  skills: string[];
}

export async function parseResume(filePath: string) {
  const data = fs.readFileSync(filePath);
  const parsed = await pdf(data);
  return parsed.text;
}

export async function parseResumeToStructured(resumeText: string): Promise<StructuredResume> {
  // Concise prompt — the full JSON schema template was ~350 tokens, this is ~80
  const systemPrompt = `Extract resume data and return ONLY a JSON object with these keys: profileDetails (name,email,phone,location,linkedin,github), summary, experience (array of {company,role,startDate,endDate,description,achievements}), education (array of {institution,degree,startDate,endDate}), projects (array of {name,description,technologies}), skills (string array). No markdown, no explanation, just JSON.`;

  const userPrompt = `Resume:\n${resumeText}`;

  try {
    const rawResponse = await generateText(systemPrompt, userPrompt, 1800);

    // Extract the outermost {...} in case the model adds preamble or is cut off
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');

    const structured = JSON.parse(jsonMatch[0]) as StructuredResume;

    // Validate and ensure required fields exist
    if (!structured.profileDetails) structured.profileDetails = {};
    if (!structured.experience) structured.experience = [];
    if (!structured.education) structured.education = [];
    if (!structured.skills) structured.skills = [];
    if (!structured.projects) structured.projects = [];

    return structured;
  } catch (error: any) {
    console.error('[Resume] parseResumeToStructured failed:', error?.message || error);

    // Return a minimal structure if parsing fails
    return {
      profileDetails: {},
      experience: [],
      education: [],
      projects: [],
      skills: [],
    };
  }
}
