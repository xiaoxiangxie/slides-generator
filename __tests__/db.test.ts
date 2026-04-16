/**
 * TDD tests for db layer
 * 测试: createJob → getJob → updateJob → deleteJob → addJobLog → getJobLogs
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { rmSync, mkdirSync } from "fs";

const TEST_DIR = path.join(__dirname, ".test-db-dir");
const TEST_DB_PATH = path.join(TEST_DIR, "jobs.db");

describe("db CRUD", () => {
  beforeEach(() => {
    // 设测试目录，重置模块缓存
    process.env.DB_DATA_DIR = TEST_DIR;
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // 清理
    try { rmSync(TEST_DIR, { recursive: true }); } catch {}
    delete process.env.DB_DATA_DIR;
  });

  it("createJob + getJob: stores and retrieves all fields", async () => {
    const { _resetDb, createJob, getJob } = await import("../lib/db");
    _resetDb();

    const id = "test-001";
    createJob(id, "测试任务", "fast", "url", "https://example.com", "9:16", "简约·Minimal");
    const job = getJob(id);

    expect(job).not.toBeNull();
    expect(job!.id).toBe(id);
    expect(job!.name).toBe("测试任务");
    expect(job!.videoStyle).toBe("fast");
    expect(job!.inputType).toBe("url");
    expect(job!.inputContent).toBe("https://example.com");
    expect(job!.aspectRatio).toBe("9:16");
    expect(job!.styleName).toBe("简约·Minimal");
    expect(job!.status).toBe("pending");
  });

  it("updateJob: updates all fields correctly", async () => {
    const { _resetDb, createJob, getJob, updateJob } = await import("../lib/db");
    _resetDb();

    const id = "test-002";
    createJob(id);
    updateJob(id, {
      status: "generating",
      step: "分析中",
      progress: 50,
      name: "更新后任务",
      inputType: "text",
      inputContent: "这是一段测试文本",
      aspectRatio: "9:16",
      styleName: "商务·Business",
    });

    const job = getJob(id)!;
    expect(job.status).toBe("generating");
    expect(job.step).toBe("分析中");
    expect(job.progress).toBe(50);
    expect(job.name).toBe("更新后任务");
    expect(job.inputType).toBe("text");
    expect(job.inputContent).toBe("这是一段测试文本");
    expect(job.aspectRatio).toBe("9:16");
    expect(job.styleName).toBe("商务·Business");
  });

  it("deleteJob: removes job from database", async () => {
    const { _resetDb, createJob, getJob, deleteJob } = await import("../lib/db");
    _resetDb();

    const id = "test-003";
    createJob(id);
    deleteJob(id);
    expect(getJob(id)).toBeUndefined();
  });

  it("addJobLog + getJobLogs: records and retrieves logs in order", async () => {
    const { _resetDb, createJob, addJobLog, getJobLogs } = await import("../lib/db");
    _resetDb();

    const id = "test-004";
    createJob(id);
    addJobLog(id, "extract_content", "progress", "开始提取内容");
    addJobLog(id, "extract_content", "done", "提取完成，输出 1234 字");
    addJobLog(id, "plan_slides", "error", "步骤执行失败: network error");

    const logs = getJobLogs(id);
    expect(logs).toHaveLength(3);
    expect(logs[0].step).toBe("extract_content");
    expect(logs[0].status).toBe("progress");
    expect(logs[0].message).toBe("开始提取内容");
    expect(logs[1].status).toBe("done");
    expect(logs[2].step).toBe("plan_slides");
    expect(logs[2].status).toBe("error");
    expect(logs[2].message).toBe("步骤执行失败: network error");
  });

  it("getJobLogs: returns logs in chronological order", async () => {
    const { _resetDb, createJob, addJobLog, getJobLogs } = await import("../lib/db");
    _resetDb();

    const id = "test-005";
    createJob(id);
    addJobLog(id, "step1", "info", "first");
    addJobLog(id, "step2", "info", "second");
    addJobLog(id, "step3", "info", "third");

    const logs = getJobLogs(id);
    expect(logs[0].message).toBe("first");
    expect(logs[1].message).toBe("second");
    expect(logs[2].message).toBe("third");
  });

  it("getJobLogs: returns empty array for non-existent job", async () => {
    const { _resetDb, getJobLogs } = await import("../lib/db");
    _resetDb();

    const logs = getJobLogs("non-existent-id");
    expect(logs).toHaveLength(0);
  });

  it("createJob with default values", async () => {
    const { _resetDb, createJob, getJob } = await import("../lib/db");
    _resetDb();

    const id = "test-006";
    createJob(id);
    const job = getJob(id)!;
    expect(job.status).toBe("pending");
    expect(job.videoStyle).toBe("normal");
    expect(job.inputType).toBe("url");
    expect(job.aspectRatio).toBe("16:9");
    expect(job.name).toBe("");
    expect(job.inputContent).toBe("");
    expect(job.styleName).toBe("");
  });
});
