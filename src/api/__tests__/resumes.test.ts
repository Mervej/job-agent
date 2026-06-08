import request from 'supertest';
import express from 'express';
import path from 'path';
import fs from 'fs';
import resumesRouter from '../resumes';
import { initDb, insertResume } from '../../services/db';

// Use an in-memory-style temp DB for tests
const TEST_DB = path.join(__dirname, 'test-job-history.db');
const TEST_RESUMES_DIR = path.join(__dirname, 'test-resumes');

beforeAll(() => {
  process.env.DB_PATH = TEST_DB;
  fs.mkdirSync(TEST_RESUMES_DIR, { recursive: true });
  initDb();
});

afterAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (fs.existsSync(TEST_RESUMES_DIR)) fs.rmSync(TEST_RESUMES_DIR, { recursive: true });
});

const app = express();
app.use(express.json());
app.use('/resumes', resumesRouter);

describe('GET /resumes', () => {
  it('returns an array of resumes with id, filename, name', async () => {
    insertResume('test-resume.pdf', 'sample text', { name: 'Test User', email: 'test@example.com' });
    const res = await request(app).get('/resumes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({ id: expect.any(Number), filename: expect.any(String) });
  });
});

describe('GET /resumes/:id/file', () => {
  it('returns 404 for a non-existent resume id', async () => {
    const res = await request(app).get('/resumes/99999/file');
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid resume id', async () => {
    const res = await request(app).get('/resumes/abc/file');
    expect(res.status).toBe(400);
  });

  it('returns a PDF for a valid resume', async () => {
    // Create a dummy PDF file in the test dir
    const pdfPath = path.join(TEST_RESUMES_DIR, 'dummy.pdf');
    fs.writeFileSync(pdfPath, '%PDF-1.4 dummy content');

    // Override RESUMES_DIR so the router finds the file
    process.env.RESUMES_DIR = TEST_RESUMES_DIR;

    const id = insertResume('dummy.pdf', 'dummy text', { name: 'PDF User' });
    const res = await request(app).get(`/resumes/${id}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
  });
});
