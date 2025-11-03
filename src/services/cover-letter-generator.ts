import { generateText } from './ai.service';
import { JobDescription } from './job-crawler';

export interface UserProfile {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  experience: string;
  skills: string[];
  achievements: string[];
}

export class CoverLetterGenerator {
  async generateCoverLetter(
    jobDescription: JobDescription,
    userProfile: UserProfile,
    resumeText: string
  ): Promise<string> {
    const systemPrompt = `You are a professional career coach and cover letter expert. Generate a compelling, personalized cover letter that:
1. Is 3-4 paragraphs long
2. Directly addresses the job requirements
3. Highlights relevant experience and skills
4. Shows enthusiasm for the specific role and company
5. Uses a professional but engaging tone
6. Avoids generic phrases and clichés
7. Includes specific examples when possible`;

    const userPrompt = this.buildUserPrompt(jobDescription, userProfile, resumeText);

    return await generateText(systemPrompt, userPrompt);
  }

  private buildUserPrompt(
    jobDescription: JobDescription,
    userProfile: UserProfile,
    resumeText: string
  ): string {
    return `
Generate a cover letter for this position:

JOB DETAILS:
- Title: ${jobDescription.title}
- Company: ${jobDescription.company}
- Location: ${jobDescription.location || 'Not specified'}
- URL: ${jobDescription.url}

JOB DESCRIPTION:
${jobDescription.description}

KEY REQUIREMENTS:
${jobDescription.requirements?.join(', ') || 'Not specified'}

CANDIDATE PROFILE:
- Name: ${userProfile.name}
- Email: ${userProfile.email}
- Experience: ${userProfile.experience}
- Key Skills: ${userProfile.skills.join(', ')}
- Notable Achievements: ${userProfile.achievements.join(', ')}

RESUME SUMMARY:
${resumeText.slice(0, 2000)}

Please write a compelling cover letter that connects the candidate's experience and skills to the specific job requirements. Make it personal and specific to this role and company.
`;
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

        // Add delay between AI requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
}
