import dotenv from 'dotenv';
import fs from 'fs';

const envFile = fs.existsSync('.env.dev') ? '.env.dev' : '.env';
dotenv.config({ path: envFile });
