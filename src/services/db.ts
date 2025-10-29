import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'job-history.db');
let db: Database.Database | null = null;

export function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY,
      filename TEXT,
      text TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY,
      job_url TEXT,
      status TEXT,
      response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function insertResume(filename: string, text: string) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare('INSERT INTO resumes (filename, text) VALUES (?, ?)');
  const info = stmt.run(filename, text);
  return info.lastInsertRowid;
}

export function insertApplication(jobUrl: string, status: string, response: string) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare('INSERT INTO applications (job_url, status, response) VALUES (?, ?, ?)');
  const info = stmt.run(jobUrl, status, response);
  return info.lastInsertRowid;
}
