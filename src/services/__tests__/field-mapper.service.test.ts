import { FieldMapperService, ExtensionField } from '../field-mapper.service';

jest.mock('../ai.service', () => ({
  generateText: jest.fn().mockResolvedValue('AI generated answer'),
  generateStructuredFields: jest.fn().mockResolvedValue({ f0: 'AI generated answer' }),
  extractJDRequirements: jest.fn().mockResolvedValue('- Node.js required\n- TypeScript preferred'),
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

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 1,
          user_id: 'user-1',
          parsed_text: 'Mervej Raj\nSoftware Engineer\nmervejraj@gmail.com\n+91 97645 77845',
        },
        error: null,
      }),
    }),
  },
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
  beforeEach(() => {
    const { supabase } = require('../supabase');
    supabase.from.mockReset();
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 1,
          user_id: 'user-1',
          parsed_text: 'Mervej Raj\nSoftware Engineer\nmervejraj@gmail.com\n+91 97645 77845',
          full_name: 'Mervej Raj',
          email: 'mervejraj@gmail.com',
          phone: '+91 97645 77845',
          location: 'India',
          linkedin: 'https://linkedin.com/in/mervejraj',
          github: 'https://github.com/mervej',
          skills: ['Node.js', 'Go'],
          experience: [],
          education: [],
          expected_ctc: '65,00,000',
          current_ctc: '50,00,000',
          notice_period: '2 months',
          work_authorization: 'Yes',
        },
        error: null,
      }),
    });
  });

  it('maps direct fields with confidence 1.0', async () => {
    const { supabase } = require('../supabase');
    // First call: resume lookup; second call: profile lookup
    supabase.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 1, user_id: 'user-1', parsed_text: 'Mervej Raj\nSoftware Engineer\nmervejraj@gmail.com\n+91 97645 77845' },
          error: null,
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            full_name: 'Mervej Raj',
            email: 'mervejraj@gmail.com',
            phone: '+91 97645 77845',
            location: 'India',
            linkedin: 'https://linkedin.com/in/mervejraj',
            github: 'https://github.com/mervej',
            skills: ['Node.js', 'Go'],
            experience: [],
            education: [],
            expected_ctc: '65,00,000',
            current_ctc: '50,00,000',
            notice_period: '2 months',
            work_authorization: 'Yes',
          },
          error: null,
        }),
      });

    const fields: ExtensionField[] = [
      field({ selector: 'input[name="email"]', inputType: 'email', label: 'Email', fieldName: 'email' }),
      field({ selector: 'input[name="first_name"]', label: 'First Name', fieldName: 'first_name' }),
    ];

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');

    const emailMapping = result.mappings.find(m => m.selector === 'input[name="email"]');
    expect(emailMapping?.value).toBe('mervejraj@gmail.com');
    expect(emailMapping?.confidence).toBe(1.0);

    const nameMapping = result.mappings.find(m => m.selector === 'input[name="first_name"]');
    expect(nameMapping?.value).toBe('Mervej');
    expect(nameMapping?.confidence).toBe(1.0);
  });

  it('returns confidence 0.5 for AI-answered fields', async () => {
    const { supabase } = require('../supabase');
    const { generateStructuredFields } = require('../ai.service');
    generateStructuredFields.mockResolvedValueOnce({ f0: 'AI generated answer' });

    supabase.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 1, user_id: 'user-1', parsed_text: 'resume text' },
          error: null,
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { full_name: 'Mervej Raj', email: 'mervejraj@gmail.com', phone: '+91 97645 77845' },
          error: null,
        }),
      });

    const fields: ExtensionField[] = [
      field({
        selector: 'textarea[name="why_role"]',
        elementType: 'textarea',
        fieldName: 'why_role',
        questionText: 'Why do you want this role?',
      }),
    ];

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');

    const mapping = result.mappings.find(m => m.selector === 'textarea[name="why_role"]');
    expect(mapping?.confidence).toBe(0.5);
    expect(mapping?.value).toBe('AI generated answer');
  });

  it('includes coverLetter and resumeDownloadUrl in result', async () => {
    const { supabase } = require('../supabase');
    supabase.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 1, user_id: 'user-1', parsed_text: 'resume text' },
          error: null,
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { full_name: 'Mervej Raj', email: 'mervejraj@gmail.com' },
          error: null,
        }),
      });

    const result = await service.mapFields([], '1', 'https://example.com/apply');
    expect(result.coverLetter).toBe('Dear Hiring Manager, test cover letter.');
    expect(result.resumeDownloadUrl).toBe('/resumes/1/file');
  });

  it('throws when resume is not found', async () => {
    const { supabase } = require('../supabase');
    supabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: new Error('not found') }),
    });

    await expect(service.mapFields([], '99', 'https://example.com/apply')).rejects.toThrow(
      'Resume not found'
    );
  });
});

describe('FieldMapperService - dropdown option enforcement', () => {
  let generateStructuredFields: jest.Mock;

  beforeEach(() => {
    generateStructuredFields = require('../ai.service').generateStructuredFields;
    generateStructuredFields.mockClear();
  });

  const setupSupabaseMocks = () => {
    const { supabase } = require('../supabase');
    supabase.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: 1, user_id: 'user-1', parsed_text: 'resume text' },
          error: null,
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { full_name: 'Mervej Raj', email: 'mervejraj@gmail.com', phone: '+91 97645 77845' },
          error: null,
        }),
      });
  };

  it('passes option texts to generateStructuredFields for dropdown fields', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: '3-5 years' });
    setupSupabaseMocks();

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

    await service.mapFields(fields, '1', 'https://example.com/apply');

    const callArgs = JSON.stringify(generateStructuredFields.mock.calls[0]);
    expect(callArgs).toContain('0-2 years');
    expect(callArgs).toContain('3-5 years');
    expect(callArgs).toContain('6-10 years');
  });

  it('uses exact AI answer when it matches an available option', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: '3-5 years' });
    setupSupabaseMocks();

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

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');
    const mapping = result.mappings.find(m => m.selector === 'select[name="exp_level"]');
    expect(mapping?.value).toBe('3-5 years');
  });

  it('snaps AI answer to full option text when answer is a substring of an option', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: 'I am authorized' });
    setupSupabaseMocks();

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

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');
    const mapping = result.mappings.find(m => m.selector === 'select[name="work_auth"]');
    expect(mapping?.value).toBe('I am authorized to work in the US');
  });

  it('leaves value empty and confidence 0 when AI answer matches no option', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: 'Something completely unrelated' });
    setupSupabaseMocks();

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

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');
    const mapping = result.mappings.find(m => m.selector === 'select[name="exp_level"]');
    expect(mapping?.value).toBe('');
    expect(mapping?.confidence).toBe(0);
  });
});

describe('FieldMapperService - empty required field promotion', () => {
  let generateStructuredFields: jest.Mock;

  beforeEach(() => {
    generateStructuredFields = require('../ai.service').generateStructuredFields;
    generateStructuredFields.mockClear();
  });

  it('promotes empty required Tier-1 field to AI batch', async () => {
    generateStructuredFields.mockResolvedValueOnce({ f0: '+1 555 0100' });

    const fields: ExtensionField[] = [
      field({
        selector: 'input[name="phone"]',
        label: 'Phone Number',
        fieldName: 'phone',
        required: true,
        // phone maps to Tier 1 but profile has no phone value → should be promoted
      }),
    ];

    // Override supabase mock: profile returns no phone
    const { supabase } = require('../supabase');
    supabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 1, user_id: 'user-1', parsed_text: 'Jane Doe resume text' },
        error: null,
      }),
    }).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { full_name: 'Jane Doe', email: 'jane@example.com', phone: null },
        error: null,
      }),
    });

    const result = await service.mapFields(fields, '1', 'https://example.com/apply');
    expect(generateStructuredFields).toHaveBeenCalled();
    const mapping = result.mappings.find(m => m.selector === 'input[name="phone"]');
    expect(mapping?.value).toBe('+1 555 0100');
  });
});
