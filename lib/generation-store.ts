// 简单的内存存储，存 Next.js 全局变量里（进程重启会丢，生产环境换 DB）
declare global {
  // eslint-disable-next-line no-var
  var __genJobs: Map<string, {
    status: "pending" | "generating" | "done" | "error";
    skill: string;   // 当前调用的 skill 名
    step: string;     // 具体步骤描述
    progress: number; // 0-100
    htmlPath: string;
    error?: string;
  }>;
}

if (!global.__genJobs) {
  global.__genJobs = new Map();
}

export function createJob(id: string) {
  global.__genJobs.set(id, {
    status: "pending",
    skill: "",
    step: "Waiting...",
    progress: 0,
    htmlPath: "",
  });
  return id;
}

export function updateJob(id: string, updates: Partial<ReturnType<typeof getJob>>) {
  const job = global.__genJobs.get(id);
  if (job) {
    Object.assign(job, updates);
  }
}

export function getJob(id: string) {
  return global.__genJobs.get(id);
}

export function getHtmlPath(id: string, dateStr: string): string {
  return `/output/${dateStr}/${id}.html`;
}
