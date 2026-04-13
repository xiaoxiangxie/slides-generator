/**
 * 任务状态存储（localStorage 持久化）
 * 页面刷新不丢任务记录
 */

export interface TaskRecord {
  id: string;
  status: "generating" | "done" | "error";
  skill: string;
  step: string;
  progress: number;
  htmlPath: string;
  error?: string;
  createdAt: number;
}

const STORAGE_KEY = "slides-tasks";

export function getTasks(): TaskRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: TaskRecord[]) {
  if (typeof window === "undefined") return;
  // 只保留最近 20 条
  const trimmed = tasks.slice(-20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function addTask(task: TaskRecord) {
  const tasks = getTasks();
  // 避免重复
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
