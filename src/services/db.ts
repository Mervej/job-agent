import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'job-history.db');
let db: Database.Database | null = null;

export function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);

  // Create tables
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

  // Migrate existing resumes table to add user profile columns
  try {
    db.exec(`
      ALTER TABLE resumes ADD COLUMN name TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`
      ALTER TABLE resumes ADD COLUMN email TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`
      ALTER TABLE resumes ADD COLUMN phone TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`
      ALTER TABLE resumes ADD COLUMN location TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`
      ALTER TABLE resumes ADD COLUMN linkedin TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`
      ALTER TABLE resumes ADD COLUMN github TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`
      ALTER TABLE resumes ADD COLUMN experience TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`
      ALTER TABLE resumes ADD COLUMN skills TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    db.exec(`
      ALTER TABLE resumes ADD COLUMN achievements TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }
}

export function insertResume(
  filename: string,
  text: string,
  userProfile?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    experience?: string;
    skills?: string[];
    achievements?: string[];
  }
) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare(`
    INSERT INTO resumes (
      filename, text, name, email, phone, location, 
      linkedin, github, experience, skills, achievements
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    filename,
    text,
    userProfile?.name || null,
    userProfile?.email || null,
    userProfile?.phone || null,
    userProfile?.location || null,
    userProfile?.linkedin || null,
    userProfile?.github || null,
    userProfile?.experience || null,
    userProfile?.skills ? JSON.stringify(userProfile.skills) : null,
    userProfile?.achievements ? JSON.stringify(userProfile.achievements) : null
  );
  return info.lastInsertRowid;
}

export function insertApplication(jobUrl: string, status: string, response: string) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare('INSERT INTO applications (job_url, status, response) VALUES (?, ?, ?)');
  const info = stmt.run(jobUrl, status, response);
  return info.lastInsertRowid;
}

export function getResumeById(id: number) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare('SELECT * FROM resumes WHERE id = ?');
  return stmt.get(id);
}

export function getAllResumes() {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare(
    'SELECT id, filename, name, email, uploaded_at FROM resumes ORDER BY uploaded_at DESC'
  );
  return stmt.all();
}

export function getUserProfileFromResume(resumeId: number) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare(`
    SELECT name, email, phone, location, linkedin, github, 
           experience, skills, achievements 
    FROM resumes WHERE id = ?
  `);
  const result = stmt.get(resumeId) as any;

  if (!result) return null;

  return {
    name: result.name,
    email: result.email,
    phone: result.phone,
    location: result.location,
    linkedin: result.linkedin,
    github: result.github,
    experience: result.experience,
    skills: result.skills ? JSON.parse(result.skills) : [],
    achievements: result.achievements ? JSON.parse(result.achievements) : [],
  };
}

export function updateUserProfile(
  resumeId: number,
  userProfile: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    experience?: string;
    skills?: string[];
    achievements?: string[];
  }
) {
  if (!db) throw new Error('DB not initialized');
  const stmt = db.prepare(`
    UPDATE resumes SET 
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      location = COALESCE(?, location),
      linkedin = COALESCE(?, linkedin),
      github = COALESCE(?, github),
      experience = COALESCE(?, experience),
      skills = COALESCE(?, skills),
      achievements = COALESCE(?, achievements)
    WHERE id = ?
  `);

  const result = stmt.run(
    userProfile.name || null,
    userProfile.email || null,
    userProfile.phone || null,
    userProfile.location || null,
    userProfile.linkedin || null,
    userProfile.github || null,
    userProfile.experience || null,
    userProfile.skills ? JSON.stringify(userProfile.skills) : null,
    userProfile.achievements ? JSON.stringify(userProfile.achievements) : null,
    resumeId
  );

  return result.changes > 0;
}
