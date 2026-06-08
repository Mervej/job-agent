import { FieldMapperService, ExtensionField } from '../field-mapper.service';

jest.mock('../ai.service', () => ({
  generateText: jest.fn().mockResolvedValue('AI generated answer'),
}));

jest.mock('../job-crawler', () => ({
  JobCrawler: jest.fn().mockImplementation(() => ({
    crawlJobDescription: jest.fn().mockResolvedValue({
      title: 'Software Engineer',
      company: 'Test Co',
      url: 'https://example.com/apply',
      description: 'test job description',
      applyLink: 'https://example.com/apply',
    }),
    close: jest.fn(),
  })),
}));

jest.mock('../cover-letter-generator', () => ({
  CoverLetterGenerator: jest.fn().mockImplementation(() => ({
    generateCoverLetter: jest.fn().mockResolvedValue('Dear Hiring Manager, test cover letter.'),
  })),
}));

jest.mock('../db', () => ({
  getResumeById: jest.fn().mockReturnValue({
    id: 1,
    filename: 'resume.pdf',
    text: 'Mervej Raj\nSoftware Engineer\nmervejraj@gmail.com\n+91 97645 77845',
  }),
  getUserProfileFromResume: jest.fn().mockReturnValue({
    name: 'Mervej Raj',
    email: 'mervejraj@gmail.com',
    phone: '+91 97645 77845',
    location: 'India',
    linkedin: 'https://linkedin.com/in/mervejraj',
    github: 'https://github.com/mervej',
    experience: '8 years backend',
    skills: ['Node.js', 'Go'],
    achievements: [],
    expectedCTC: '65,00,000',
    currentCTC: '50,00,000',
    noticePeriod: '2 months',
    workAuthorization: 'Yes',
  }),
  getStructuredResumeById: jest.fn().mockReturnValue(null),
}));

const service = new FieldMapperService();

const field = (overrides: Partial<ExtensionField> = {}): ExtensionField => ({
  selector: 'input[name="test"]',
  elementType: 'input',
  fieldName: 'test',
  required: false,
  ...overrides,
});

describe('FieldMapperService.getFieldSemanticType', () => {
  it('identifies email fields', () => {
    expect(service.getFieldSemanticType(field({ inputType: 'email', label: 'Email' }))).toBe('email');
  });

  it('identifies phone fields', () => {
    expect(service.getFieldSemanticType(field({ label: 'Phone Number' }))).toBe('phone');
  });

  it('identifies firstName fields', () => {
    expect(service.getFieldSemanticType(field({ label: 'First Name' }))).toBe('firstName');
  });

  it('identifies noticePeriod fields', () => {
    expect(service.getFieldSemanticType(field({ label: 'Notice Period' }))).toBe('noticePeriod');
  });

  it('returns other for unrecognised fields', () => {
    expect(service.getFieldSemanticType(field({ label: 'Favourite colour' }))).toBe('other');
  });
});

describe('FieldMapperService.mapFields', () => {
  it('maps direct fields with confidence 1.0', async () => {
    const fields: ExtensionField[] = [
      field({ selector: 'input[name="email"]', inputType: 'email', label: 'Email', fieldName: 'email' }),
      field({ selector: 'input[name="first_name"]', label: 'First Name', fieldName: 'first_name' }),
    ];

    const result = await service.mapFields(fields, 1, 'https://example.com/apply');

    const emailMapping = result.mappings.find(m => m.selector === 'input[name="email"]');
    expect(emailMapping?.value).toBe('mervejraj@gmail.com');
    expect(emailMapping?.confidence).toBe(1.0);

    const nameMapping = result.mappings.find(m => m.selector === 'input[name="first_name"]');
    expect(nameMapping?.value).toBe('Mervej');
    expect(nameMapping?.confidence).toBe(1.0);
  });

  it('returns confidence 0.5 for AI-answered fields', async () => {
    const fields: ExtensionField[] = [
      field({
        selector: 'textarea[name="why_role"]',
        elementType: 'textarea',
        fieldName: 'why_role',
        questionText: 'Why do you want this role?',
      }),
    ];

    const result = await service.mapFields(fields, 1, 'https://example.com/apply');

    const mapping = result.mappings.find(m => m.selector === 'textarea[name="why_role"]');
    expect(mapping?.confidence).toBe(0.5);
    expect(mapping?.value).toBe('AI generated answer');
  });

  it('includes coverLetter and resumeDownloadUrl in result', async () => {
    const result = await service.mapFields([], 1, 'https://example.com/apply');
    expect(result.coverLetter).toBe('Dear Hiring Manager, test cover letter.');
    expect(result.resumeDownloadUrl).toBe('/resumes/1/file');
  });

  it('throws when resume is not found', async () => {
    const { getResumeById } = require('../db');
    getResumeById.mockReturnValueOnce(null);

    await expect(service.mapFields([], 99, 'https://example.com/apply')).rejects.toThrow(
      'Resume not found'
    );
  });
});

describe('FieldMapperService - dropdown option enforcement', () => {
  let generateText: jest.Mock;

  beforeEach(() => {
    generateText = require('../ai.service').generateText;
    generateText.mockClear();
  });

  it('passes option texts to the AI prompt for dropdown fields', async () => {
    generateText.mockResolvedValueOnce('3-5 years');

    const fields: ExtensionField[] = [
      field({
        selector: 'select[name="exp_level"]',
        elementType: 'select',
        fieldName: 'exp_level',
        label: 'Experience Level',
        options: [
          { value: '1', text: '0-2 years' },
          { value: '2', text: '3-5 years' },
          { value: '3', text: '6-10 years' },
        ],
      }),
    ];

    await service.mapFields(fields, 1, 'https://example.com/apply');

    const allArgs = generateText.mock.calls.flat().join('\n');
    expect(allArgs).toContain('0-2 years');
    expect(allArgs).toContain('3-5 years');
    expect(allArgs).toContain('6-10 years');
  });

  it('uses exact AI answer when it matches an available option', async () => {
    generateText.mockResolvedValueOnce('3-5 years');

    const fields: ExtensionField[] = [
      field({
        selector: 'select[name="exp_level"]',
        elementType: 'select',
        fieldName: 'exp_level',
        label: 'Experience Level',
        options: [
          { value: '1', text: '0-2 years' },
          { value: '2', text: '3-5 years' },
          { value: '3', text: '6-10 years' },
        ],
      }),
    ];

    const result = await service.mapFields(fields, 1, 'https://example.com/apply');
    const mapping = result.mappings.find(m => m.selector === 'select[name="exp_level"]');
    expect(mapping?.value).toBe('3-5 years');
  });

  it('snaps AI answer to full option text when answer is a substring of an option', async () => {
    generateText.mockResolvedValueOnce('I am authorized');

    const fields: ExtensionField[] = [
      field({
        selector: 'select[name="work_auth"]',
        elementType: 'select',
        fieldName: 'work_auth',
        label: 'Preferred work arrangement',
        options: [
          { value: 'yes', text: 'I am authorized to work in the US' },
          { value: 'no', text: 'I will require sponsorship' },
        ],
      }),
    ];

    const result = await service.mapFields(fields, 1, 'https://example.com/apply');
    const mapping = result.mappings.find(m => m.selector === 'select[name="work_auth"]');
    expect(mapping?.value).toBe('I am authorized to work in the US');
  });

  it('leaves value empty and confidence 0 when AI answer matches no option', async () => {
    generateText.mockResolvedValueOnce('Something completely unrelated');

    const fields: ExtensionField[] = [
      field({
        selector: 'select[name="exp_level"]',
        elementType: 'select',
        fieldName: 'exp_level',
        label: 'Experience Level',
        options: [
          { value: '1', text: '0-2 years' },
          { value: '2', text: '3-5 years' },
          { value: '3', text: '6-10 years' },
        ],
      }),
    ];

    const result = await service.mapFields(fields, 1, 'https://example.com/apply');
    const mapping = result.mappings.find(m => m.selector === 'select[name="exp_level"]');
    expect(mapping?.value).toBe('');
    expect(mapping?.confidence).toBe(0);
  });
});
