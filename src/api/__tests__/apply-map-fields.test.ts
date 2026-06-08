import request from 'supertest';
import express from 'express';
import applyRouter from '../apply';

jest.mock('../../services/field-mapper.service', () => ({
  FieldMapperService: jest.fn().mockImplementation(() => ({
    mapFields: jest.fn().mockResolvedValue({
      mappings: [{ selector: 'input[name="email"]', value: 'test@example.com', confidence: 1.0 }],
      coverLetter: 'Dear Hiring Manager...',
      resumeDownloadUrl: '/resumes/1/file',
    }),
  })),
}));

// Stub heavy imports that aren't needed for these tests
jest.mock('../../services/application-filler', () => ({ ApplicationFiller: jest.fn() }));
jest.mock('../../services/stagehand-filler', () => ({ StagehandFiller: jest.fn() }));
jest.mock('../../services/job-crawler', () => ({ JobCrawler: jest.fn() }));
jest.mock('../../services/cover-letter-generator', () => ({ CoverLetterGenerator: jest.fn() }));
jest.mock('../../services/db', () => ({
  insertApplication: jest.fn(),
  getResumeById: jest.fn(),
  getUserProfileFromResume: jest.fn(),
  getStructuredResumeById: jest.fn(),
  checkIfAlreadyApplied: jest.fn().mockReturnValue(false),
}));

const app = express();
app.use(express.json());
app.use('/apply', applyRouter);

describe('POST /apply/map-fields', () => {
  it('returns mappings, coverLetter, resumeDownloadUrl', async () => {
    const res = await request(app)
      .post('/apply/map-fields')
      .send({ fields: [], resumeId: 1, jobUrl: 'https://example.com/apply' });

    expect(res.status).toBe(200);
    expect(res.body.mappings).toBeInstanceOf(Array);
    expect(res.body.coverLetter).toBe('Dear Hiring Manager...');
    expect(res.body.resumeDownloadUrl).toBe('/resumes/1/file');
  });

  it('returns 400 when resumeId is missing', async () => {
    const res = await request(app)
      .post('/apply/map-fields')
      .send({ fields: [], jobUrl: 'https://example.com/apply' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/resumeId/);
  });

  it('returns 400 when jobUrl is missing', async () => {
    const res = await request(app)
      .post('/apply/map-fields')
      .send({ fields: [], resumeId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/jobUrl/);
  });

  it('returns 400 when fields is not an array', async () => {
    const res = await request(app)
      .post('/apply/map-fields')
      .send({ fields: 'bad', resumeId: 1, jobUrl: 'https://example.com/apply' });
    expect(res.status).toBe(400);
  });
});
