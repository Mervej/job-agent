-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Profiles table (one per user, keyed to Supabase Auth user)
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT,
  email               TEXT,
  phone               TEXT,
  location            TEXT,
  linkedin            TEXT,
  github              TEXT,
  website             TEXT,
  summary             TEXT,
  skills              JSONB    DEFAULT '[]',
  experience          JSONB    DEFAULT '[]',
  education           JSONB    DEFAULT '[]',
  expected_ctc        TEXT,
  current_ctc         TEXT,
  notice_period       TEXT,
  work_authorization  TEXT,
  api_key             TEXT     UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Resumes table (single resume per user)
CREATE TABLE IF NOT EXISTS resumes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  parsed_text TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Applications history
CREATE TABLE IF NOT EXISTS applications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_url    TEXT,
  status     TEXT,
  response   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row-level security (each user sees only their own rows)
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile"      ON profiles     FOR ALL USING (auth.uid() = id);
CREATE POLICY "own resumes"      ON resumes      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own applications" ON applications FOR ALL USING (auth.uid() = user_id);

-- Auto-create an empty profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
