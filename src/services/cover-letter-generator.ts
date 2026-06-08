import { generateText } from './ai.service';
import { JobDescription } from './job-crawler';
import PDFDocument = require('pdfkit');
import fs from 'fs';

export interface UserProfile {
  currentRole?: string | undefined;
  currentCompany?: string | undefined;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  experience: string;
  skills: string[];
  achievements: string[];
  expectedCTC?: string;
  currentCTC?: string;
  noticePeriod?: string;
  workAuthorization?: string;
  willingToRelocate?: string; // 'Yes' | 'No' — defaults to 'Yes' if not set
}

export class CoverLetterGenerator {
  async generateCoverLetter(
    jobDescription: JobDescription,
    userProfile: UserProfile,
    resumeText: string
  ): Promise<string> {
    //
    // SYSTEM PROMPT (goes to {{ .System }} in your Modelfile)
    //
    const systemPrompt = `
You are a professional career coach and expert cover-letter writer.

Your responsibilities:
- Write a compelling, authentic, human-sounding cover letter.
- Make it personalized to the role and company.
- Keep it professional, warm, and confident.
- Avoid clichés, generic phrases, and AI-like wording.
- Never mention that you are generating text or referencing prompts.

Structure the output:
- 3–4 natural paragraphs
- Opening: why the candidate is a strong fit
- Middle: relevant experience, skills, achievements tied to job requirements
- Ending: enthusiasm + call to continue the conversation

Do NOT include explanations — output only the final cover letter.
    `.trim();

    //
    // USER PROMPT (goes to {{ .Prompt }} in your Modelfile)
    //
    const userPrompt = this.buildUserPrompt(jobDescription, userProfile, resumeText);

    console.log('\n─── COVER LETTER PROMPT ────────────────────────\nSYSTEM:\n' + systemPrompt + '\n\nUSER:\n' + userPrompt + '\n────────────────────────────────────────────────\n');
    const result = await generateText(systemPrompt, userPrompt);
    console.log('\n─── COVER LETTER OUTPUT ────────────────────────\n' + result + '\n────────────────────────────────────────────────\n');
    return result;
  }

  private buildUserPrompt(job: JobDescription, user: UserProfile, resumeText: string): string {
    return `
Write a tailored cover letter based on the following structured data.

### JOB DETAILS
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location || 'Not specified'}
- URL: ${job.url}

### JOB DESCRIPTION
${job.description || 'Not provided'}

### KEY REQUIREMENTS
${job.requirements?.join(', ') || 'Not specified'}

### CANDIDATE PROFILE
- Name: ${user.name}
- Email: ${user.email}
- Experience summary: ${user.experience}
- Skills: ${user.skills.join(', ')}
- Key achievements: ${user.achievements.join(', ')}
${user.linkedin ? `- LinkedIn: ${user.linkedin}` : ''}
${user.github ? `- GitHub: ${user.github}` : ''}
${user.location ? `- Location: ${user.location}` : ''}

### RESUME
${resumeText}

### GUIDANCE
Generate a polished, personal, job-specific cover letter that clearly connects the candidate’s background to the requirements. Use warm professional language, first-person perspective, and avoid clichés.
    `.trim();
  }

  async generateMultipleCoverLetters(
    jobDescriptions: JobDescription[],
    userProfile: UserProfile,
    resumeText: string
  ): Promise<{ jobUrl: string; coverLetter: string }[]> {
    const results = [];

    for (const job of jobDescriptions) {
      try {
        const coverLetter = await this.generateCoverLetter(job, userProfile, resumeText);

        results.push({
          jobUrl: job.url,
          coverLetter,
        });

        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (error) {
        console.error(`Failed to generate cover letter for ${job.url}:`, error);
        results.push({
          jobUrl: job.url,
          coverLetter: `Error generating cover letter: ${error}`,
        });
      }
    }

    return results;
  }

  async generateCoverLetterPDF(text: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 72, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);
      doc.on('error', reject);
      doc.fontSize(11).font('Helvetica').text(text, { lineGap: 4 });
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }
}
