/**
 * 统一的任务持久化层 — SQLite (better-sqlite3)
 * 替代 generation-store (localStorage) + task-store (内存 Map)
 *
 * 表结构:
 *   jobs: { id, status, skill, step, progress, htmlPath, error, name, endedAt, createdAt, videoStyle, videoPath }
 */

import Database from "better-sqlite3";
import path from "path";
import { mkdirSync } from "fs";

const DATA_DIR = path.join(process.cwd(), ".data");
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "jobs.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  // 基础表（原有字段）
  _db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'pending',
      skill       TEXT NOT NULL DEFAULT '',
      step        TEXT NOT NULL DEFAULT '',
      progress    INTEGER NOT NULL DEFAULT 0,
      htmlPath    TEXT NOT NULL DEFAULT '',
      error       TEXT NOT NULL DEFAULT '',
      createdAt   INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // 增量迁移：新增字段（ALTER TABLE ADD COLUMN 对已存在的列是 no-op）
  const migrations = [
    "ALTER TABLE jobs ADD COLUMN name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE jobs ADD COLUMN endedAt INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN videoStyle TEXT NOT NULL DEFAULT 'normal'",
    "ALTER TABLE jobs ADD COLUMN videoPath TEXT NOT NULL DEFAULT ''",
  ];

  for (const sql of migrations) {
    try { _db.exec(sql); } catch { /* 列已存在，忽略 */ }
  }

  return _db;
}

// ── Job CRUD ──────────────────────────────────────────────

export interface JobRecord {
  id: string;
  status: "pending" | "generating" | "done" | "error" | "cancelled";
  skill: string;
  step: string;
  progress: number;
  htmlPath: string;
  error: string;
  name: string;
  endedAt: number;
  createdAt: number;
  videoStyle: "normal" | "fast" | "slow";
  videoPath: string;
}

export function createJob(id: string, name: string = "", videoStyle: "normal" | "fast" | "slow" = "normal"): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO jobs (id, status, skill, step, progress, htmlPath, error, name, endedAt, createdAt, videoStyle, videoPath)
    VALUES (?, 'pending', '', '', 0, '', '', ?, 0, unixepoch(), ?, '')
  `).run(id, name, videoStyle);
}

export function getJob(id: string): JobRecord | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRecord | undefined;
  return row;
}

export function updateJob(id: string, updates: Partial<JobRecord>): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) { sets.push("status = ?"); values.push(updates.status); }
  if (updates.skill !== undefined) { sets.push("skill = ?"); values.push(updates.skill); }
  if (updates.step !== undefined) { sets.push("step = ?"); values.push(updates.step); }
  if (updates.progress !== undefined) { sets.push("progress = ?"); values.push(updates.progress); }
  if (updates.htmlPath !== undefined) { sets.push("htmlPath = ?"); values.push(updates.htmlPath); }
  if (updates.error !== undefined) { sets.push("error = ?"); values.push(updates.error); }
  if (updates.name !== undefined) { sets.push("name = ?"); values.push(updates.name); }
  if (updates.endedAt !== undefined) { sets.push("endedAt = ?"); values.push(updates.endedAt); }
  if (updates.videoStyle !== undefined) { sets.push("videoStyle = ?"); values.push(updates.videoStyle); }
  if (updates.videoPath !== undefined) { sets.push("videoPath = ?"); values.push(updates.videoPath); }

  if (sets.length === 0) return;
  values.push(id);

  db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function listJobs(limit = 50): JobRecord[] {
  const db = getDb();
  return db.prepare("SELECT * FROM jobs ORDER BY createdAt DESC LIMIT ?").all(limit) as JobRecord[];
}

export function deleteJob(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
}

export function cancelJob(id: string): void {
  const db = getDb();
  db.prepare("UPDATE jobs SET status = 'cancelled', endedAt = unixepoch() WHERE id = ?").run(id);
}

export function getHtmlPath(id: string, dateStr: string): string {
  return `/output/${dateStr}/${id}/${id}.html`;
}

export function getVideoPath(id: string, dateStr: string): string {
  return `/output/${dateStr}/${id}/${id}.mp4`;
}

// ── Task list helpers (used by home page) ─────────────────

export interface TaskRecord {
  id: string;
  status: "pending" | "generating" | "done" | "error" | "cancelled";
  skill: string;
  step: string;
  progress: number;
  htmlPath: string;
  error: string;
  name: string;
  endedAt: number;
  createdAt: number;
  videoStyle: "normal" | "fast" | "slow";
  videoPath: string;
}

/** Get recent tasks for the home page list (most recent first) */
export function getTasks(): TaskRecord[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM jobs ORDER BY createdAt DESC LIMIT 30"
  ).all() as TaskRecord[];
  return rows;
}

/** Add a new task record */
export function addTask(task: TaskRecord): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO jobs (id, status, skill, step, progress, htmlPath, error, name, endedAt, createdAt, videoStyle, videoPath)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(task.id, task.status, task.skill, task.step, task.progress, task.htmlPath, task.error ?? "", task.name, task.endedAt ?? 0, task.createdAt, task.videoStyle ?? "normal", task.videoPath ?? "");
}

/** Update a task by id */
export function updateTask(id: string, updates: Partial<TaskRecord>): void {
  updateJob(id, updates as Partial<JobRecord>);
}

/** Get a single task by id */
export function getTask(id: string): TaskRecord | undefined {
  return getJob(id);
}
