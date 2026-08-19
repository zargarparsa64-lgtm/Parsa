import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_PATH || './data/kourosh.sqlite';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen TEXT
);
CREATE TABLE IF NOT EXISTS conversations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 title TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 conversation_id INTEGER NOT NULL,
 role TEXT NOT NULL,
 content TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS knowledge (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const exists = db.prepare('SELECT id FROM users WHERE username=?').get(adminUsername);
if (!exists) {
  db.prepare('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)')
    .run(adminUsername, bcrypt.hashSync(adminPassword, 12), 'admin');
}

const defaults = {
  system_prompt: `You are Kourosh AI, a professional bilingual AI assistant.\nPrimary language: Persian (Farsi). If the user writes in English, answer in English unless they request otherwise.\nBe accurate, concise, helpful, and transparent about uncertainty. Do not invent facts.\nUse clean Markdown when useful.`,
  model: process.env.OPENAI_MODEL || 'gpt-5',
  personality: 'Professional, friendly, precise, fast, and respectful.',
  brand_name: 'Kourosh AI'
};
const upsert = db.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING`);
for (const [k,v] of Object.entries(defaults)) upsert.run(k,v);

export { db };
