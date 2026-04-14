// 统一的任务存储 — SQLite (better-sqlite3)
// 替代原有的 global.__genJobs 内存方案，进程重启不丢失

export {
  createJob,
  getJob,
  updateJob,
  listJobs,
  deleteJob,
  cancelJob,
  getHtmlPath,
  getTasks,
  addTask,
  updateTask,
  getTask,
} from "./db";

export type { JobRecord, TaskRecord } from "./db";
