/**
 * TDD Tests for PPTX Export Route
 */
import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000";
const TEST_TASK_ID = "1886ce62";

describe("GET /api/tasks/[id]/pptx — PPTX Export Route", () => {
  it("returns { url: ... } JSON for valid task with outline", async () => {
    const res = await fetch(`${BASE}/api/tasks/${TEST_TASK_ID}/pptx`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.url).toBe("string");
    expect(json.url.length).toBeGreaterThan(0);
    expect(json.url.endsWith(".pptx")).toBe(true);
    expect(json.url.includes("/output/")).toBe(true);
  });

  it("returns 404 for non-existent task", async () => {
    const res = await fetch(`${BASE}/api/tasks/non-existent-id-xyz/pptx`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("pptx file actually exists at the returned path", async () => {
    const res = await fetch(`${BASE}/api/tasks/${TEST_TASK_ID}/pptx`);
    const json = await res.json();
    const fileRes = await fetch(BASE + json.url);
    expect(fileRes.ok).toBe(true);
    const ct = fileRes.headers.get("content-type") || "";
    expect(ct).toMatch(/officedocument|presentationml|zip|octet-stream/);
  });

  it("pptx contains slide notes (narration as notes)", async () => {
    const res = await fetch(`${BASE}/api/tasks/${TEST_TASK_ID}/pptx`);
    const json = await res.json();
    const fileRes = await fetch(BASE + json.url);
    const buffer = await fileRes.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    // PPTX is a ZIP file - check for notesSlide entries
    const str = new TextDecoder("utf-8", { fatal: false }).decode(uint8);
    expect(str).toContain("notesSlide");
  });
});
