/**
 * 任务状态存储（localStorage 持久化）
 * 客户端专用 — 页面刷新不丢任务列表
 * 注意：服务端 API（/api/generate/*）使用 SQLite（task-store.ts）
 */

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
  videoStyle?: string;
  videoPath?: string;
  // 创建参数
  inputType?: "url" | "text";
  inputContent?: string; // URL 或文本内容，文本过长时只存前200字
  aspectRatio?: "16:9" | "9:16";
  styleName?: string;
}

const STORAGE_KEY = "slides-tasks";

export function getTasks(): TaskRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const tasks: TaskRecord[] = raw ? JSON.parse(raw) : [];
    // 始终按创建时间倒序（最新在前）
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveTasks(tasks: TaskRecord[], trim = true) {
  if (typeof window === "undefined") return;
  const toSave = trim ? tasks.slice(-20) : tasks;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

export function addTask(task: TaskRecord) {
  const tasks = getTasks();
  const exists = tasks.find((t) => t.id === task.id);
  if (!exists) {
    tasks.push(task);
    saveTasks(tasks);
  }
}

export function updateTask(id: string, updates: Partial<TaskRecord>) {
  const tasks = getTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx !== -1) {
    tasks[idx] = { ...tasks[idx], ...updates };
    saveTasks(tasks);
  }
}

export function getTask(id: string): TaskRecord | undefined {
  return getTasks().find((t) => t.id === id);
}
