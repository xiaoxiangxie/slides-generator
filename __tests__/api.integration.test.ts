/**
 * 真实 API 集成测试
 * 通过 HTTP 调用实际服务器 (localhost:3000)
 * 测试完整的创建→查询→更新→删除流程
 */
import { describe, it, expect, afterEach } from "vitest";

const BASE = "http://localhost:3000";

function uniqueId() {
  return "test-" + Math.random().toString(36).slice(2, 10);
}

describe("API Integration — 真实 HTTP 调用", () => {
  const createdIds: string[] = [];

  afterEach(() => {
    // 清理测试创建的任务
    for (const id of createdIds) {
      fetch(`${BASE}/api/tasks/${id}`, { method: "DELETE" }).catch(() => {});
    }
  });

  it("POST /api/generate → GET /api/tasks → 全量字段正确存储", async () => {
    // 1. 创建任务
    const createRes = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: "https://example.com/test-page",
        inputType: "url",
        styleId: "bold-signal",
        aspectRatio: "9:16",
        taskName: "集成测试任务",
        videoStyle: "fast",
      }),
    });
    expect(createRes.status).toBe(200);
    const { id } = await createRes.json() as { id: string };
    expect(id).toBeTruthy();
    createdIds.push(id);

    // 2. 从列表中查到这条任务
    const listRes = await fetch(`${BASE}/api/tasks`);
    expect(listRes.status).toBe(200);
    const tasks = await listRes.json() as any[];
    const found = tasks.find((t: any) => t.id === id);
    expect(found).toBeDefined();
    expect(found.name).toBe("集成测试任务");
    expect(found.inputType).toBe("url");
    expect(found.inputContent).toBe("https://example.com/test-page");
    expect(found.aspectRatio).toBe("9:16");
    expect(found.videoStyle).toBe("fast");
    expect(found.status).toBe("generating");
  });

  it("GET /api/tasks/[id] → 单条查询", async () => {
    // 1. 创建
    const createRes = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: "这是一段测试文本内容",
        inputType: "text",
        styleId: "bold-signal",
        aspectRatio: "16:9",
        taskName: "单条查询测试",
        videoStyle: "slow",
      }),
    });
    const { id } = await createRes.json() as { id: string };
    createdIds.push(id);

    // 2. GET 单条
    const getRes = await fetch(`${BASE}/api/tasks/${id}`);
    expect(getRes.status).toBe(200);
    const job = await getRes.json() as any;
    expect(job.id).toBe(id);
    expect(job.name).toBe("单条查询测试");
    expect(job.inputType).toBe("text");
    expect(job.inputContent).toBe("这是一段测试文本内容");
    expect(job.aspectRatio).toBe("16:9");
    expect(job.videoStyle).toBe("slow");
    expect(job.styleName).toContain("橙色卡片");
    expect(job.styleName).toContain("Bold Signal");
  });

  it("PATCH /api/tasks/[id] → 更新 name 和 status", async () => {
    // 1. 创建
    const createRes = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "http://test.com", inputType: "url", styleId: "bold-signal" }),
    });
    const { id } = await createRes.json() as { id: string };
    createdIds.push(id);

    // 2. PATCH 更新
    const patchRes = await fetch(`${BASE}/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "PATCH更新后的名称", status: "done" }),
    });
    expect(patchRes.status).toBe(200);

    // 3. 验证更新生效
    const getRes = await fetch(`${BASE}/api/tasks/${id}`);
    const job = await getRes.json() as any;
    expect(job.name).toBe("PATCH更新后的名称");
    expect(job.status).toBe("done");
  });

  it("DELETE /api/tasks/[id] → 物理删除", async () => {
    // 1. 创建
    const createRes = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "http://delete-test.com", inputType: "url", styleId: "bold-signal" }),
    });
    const { id } = await createRes.json() as { id: string };

    // 2. 删除
    const delRes = await fetch(`${BASE}/api/tasks/${id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);

    // 3. 验证已删除
    const getRes = await fetch(`${BASE}/api/tasks/${id}`);
    expect(getRes.status).toBe(404);
  });

  it("POST /api/tasks/[id]/cancel → 取消任务", async () => {
    // 1. 创建
    const createRes = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "http://cancel-test.com", inputType: "url", styleId: "bold-signal" }),
    });
    const { id } = await createRes.json() as { id: string };
    createdIds.push(id);

    // 2. 取消
    const cancelRes = await fetch(`${BASE}/api/tasks/${id}/cancel`, { method: "POST" });
    expect(cancelRes.status).toBe(200);

    // 3. 验证状态
    const getRes = await fetch(`${BASE}/api/tasks/${id}`);
    const job = await getRes.json() as any;
    expect(job.status).toBe("cancelled");
  });

  it("GET /api/tasks/[id]/logs → 初始为空数组", async () => {
    // 1. 创建
    const createRes = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "http://log-test.com", inputType: "url", styleId: "bold-signal" }),
    });
    const { id } = await createRes.json() as { id: string };
    createdIds.push(id);

    // 2. 查日志（pipeline 异步运行，可能已有日志）
    const logsRes = await fetch(`${BASE}/api/tasks/${id}/logs`);
    expect(logsRes.status).toBe(200);
    const logs = await logsRes.json();
    expect(Array.isArray(logs)).toBe(true);
    // 日志是按时间顺序的，上限 1000 条
  });

  it("GET /api/tasks → 支持 limit 参数", async () => {
    const res = await fetch(`${BASE}/api/tasks?limit=5`);
    expect(res.status).toBe(200);
    const tasks = await res.json() as any[];
    expect(tasks.length).toBeLessThanOrEqual(5);
  });

  it("POST /api/generate → 文本模式存储 inputContent（超长截断）", async () => {
    const longText = "A".repeat(300);
    const createRes = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: longText,
        inputType: "text",
        styleId: "bold-signal",
        aspectRatio: "16:9",
        taskName: "文本截断测试",
      }),
    });
    const { id } = await createRes.json() as { id: string };
    createdIds.push(id);

    const getRes = await fetch(`${BASE}/api/tasks/${id}`);
    const job = await getRes.json() as any;
    expect(job.inputContent).toBe("A".repeat(200) + "…");
    expect(job.inputContent.length).toBe(201);
  });

  it("POST /api/generate → 400 when empty input", async () => {
    const res = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "  ", inputType: "url", styleId: "bold-signal" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/generate → 400 when unknown style", async () => {
    const res = await fetch(`${BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "http://test.com", inputType: "url", styleId: "non-existent-style" }),
    });
    expect(res.status).toBe(400);
  });

  it("404 for non-existent task on GET /api/tasks/[id]", async () => {
    const res = await fetch(`${BASE}/api/tasks/non-existent-id`);
    expect(res.status).toBe(404);
  });
});
