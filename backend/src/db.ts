import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

interface SessionRow { id: string; container_id: string | null }
interface MessageRow { role: string; content: string }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '../../data/vibe.db')

const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    container_id TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`)

export function createSession(id: string): void {
  db.prepare('INSERT INTO sessions (id, created_at) VALUES (?, ?)').run(id, Date.now())
}

export function getSession(id: string): SessionRow | undefined {
  return db.prepare('SELECT id, container_id FROM sessions WHERE id = ?').get(id) as SessionRow | undefined
}

export function setContainerId(sessionId: string, containerId: string): void {
  db.prepare('UPDATE sessions SET container_id = ? WHERE id = ?').run(containerId, sessionId)
}

export function saveMessage(sessionId: string, role: 'user' | 'agent', content: string): void {
  db.prepare('INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)').run(
    sessionId, role, content, Date.now()
  )
}

export function getMessages(sessionId: string): MessageRow[] {
  return db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as MessageRow[]
}
