import { CoverLetterGenerator } from '../cover-letter-generator';
import { StructuredResume } from '../resume';

jest.mock('../ai.service', () => ({
  generateText: jest.fn().mockResolvedValue('Dear Hiring Manager, this is a great cover letter.'),
}));


const jobDescription = {
  title: 'Senior Engineer',
  company: 'Acme Corp',
  url: 'https://acme.com/apply',
  description: 'We need a senior Node.js engineer with 5+ years experience.',
  location: 'Remote',
};

const userProfile = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  experience: '',
  skills: ['Node.js', 'TypeScript'],
  achievements: [],
};

const mockStructuredResume: StructuredResume = {
  profileDetails: { name: 'Jane Doe' },
  experience: [
    { company: 'Acme', role: 'Senior Engineer', startDate: '01/2020', endDate: 'Present', description: 'Led backend team' },
    { company: 'StartupXYZ', role: 'Engineer', startDate: '06/2018', endDate: '12/2019', description: 'Built APIs' },
  ],
  education: [
    { institution: 'MIT', degree: 'B.Tech', fieldOfStudy: 'Computer Science', startDate: '2014', endDate: '2018' },
  ],
  skills: ['Node.js', 'TypeScript'],
};

describe('CoverLetterGenerator.generateCoverLetter', () => {
  let generateText: jest.Mock;

  beforeEach(() => {
    generateText = require('../ai.service').generateText;
    generateText.mockClear();
  });

  it('includes jdSummary in the prompt under KEY REQUIREMENTS', async () => {
    const generator = new CoverLetterGenerator();
    await generator.generateCoverLetter(
      jobDescription,
      userProfile,
      'resume text',
      '- 5+ years Node.js\n- TypeScript required',
    );

    const promptArg = generateText.mock.calls[0].flat().join('\n');
    expect(promptArg).toContain('5+ years Node.js');
    expect(promptArg).toContain('TypeScript required');
  });

  it('does NOT contain "Not specified" when jdSummary is provided', async () => {
    const generator = new CoverLetterGenerator();
    await generator.generateCoverLetter(
      jobDescription,
      userProfile,
      'resume text',
      '- 5+ years Node.js',
    );

    const promptArg = generateText.mock.calls[0].flat().join('\n');
    expect(promptArg).not.toContain('Not specified');
  });

  it('includes structured experience entries in the prompt', async () => {
    const generator = new CoverLetterGenerator();
    await generator.generateCoverLetter(
      jobDescription,
      userProfile,
      'resume text',
      '- Node.js required',
      mockStructuredResume
    );

    const promptArg = generateText.mock.calls[0].flat().join('\n');
    expect(promptArg).toContain('Senior Engineer at Acme');
    expect(promptArg).toContain('Engineer at StartupXYZ');
  });

  it('includes education in the prompt when structuredResume is provided', async () => {
    const generator = new CoverLetterGenerator();
    await generator.generateCoverLetter(
      jobDescription,
      userProfile,
      'resume text',
      '',
      mockStructuredResume
    );

    const promptArg = generateText.mock.calls[0].flat().join('\n');
    expect(promptArg).toContain('B.Tech');
    expect(promptArg).toContain('MIT');
  });

  it('still works when called without jdSummary and structuredResume (backwards compat)', async () => {
    const generator = new CoverLetterGenerator();
    const result = await generator.generateCoverLetter(jobDescription, userProfile, 'resume text');
    expect(result).toBe('Dear Hiring Manager, this is a great cover letter.');
  });
});
