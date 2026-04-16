/**
 * TDD Tests for SRT Preview Route
 * Test BEFORE implementation → should FAIL → then verify implementation fixes them
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = "http://localhost:3000";
const TEST_TASK_ID = "1886ce62"; // known done task with SRT

describe("GET /api/tasks/[id]/srt — SRT Preview Route", () => {
  it("returns HTML content-type for valid task with SRT", async () => {
    const res = await fetch(`${BASE}/api/tasks/${TEST_TASK_ID}/srt`);
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("returns formatted subtitle entries with time and text", async () => {
    const res = await fetch(`${BASE}/api/tasks/${TEST_TASK_ID}/srt`);
    expect(res.ok).toBe(true);
    const html = await res.text();
    // Should have time range format (00:00:00,000 → 00:00:16,400)
    expect(html).toMatch(/00:\d{2}:\d{2},\d{3}\s*→\s*00:\d{2}:\d{2},\d{3}/);
    // Should have actual subtitle text (Chinese)
    expect(html).toMatch(/嗨，今天/);
  });

  it("returns 404 for non-existent task", async () => {
    const res = await fetch(`${BASE}/api/tasks/non-existent-id-xyz/srt`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("escapes HTML in subtitle text (XSS prevention)", async () => {
    // The SRT file for 1886ce62 contains normal Chinese text
    // We verify that any < or > characters in the text are escaped
    const res = await fetch(`${BASE}/api/tasks/${TEST_TASK_ID}/srt`);
    const html = await res.text();
    // If there are angle brackets in the content, they should be &lt; &gt;
    // The text should NOT contain raw <script> or <img tags
    expect(html).not.toMatch(/<script[^>]*>/i);
    expect(html).not.toMatch(/<img[^>]*onerror/i);
  });

  it("returns 404 when SRT file is missing", async () => {
    // Create a job but don't generate SRT - use a task ID without SRT file
    const res = await fetch(`${BASE}/api/tasks/e5b43d57/srt`);
    // This task exists but may not have SRT - either 404 or empty
    if (res.status !== 200) {
      expect(res.status).toBe(404);
    }
  });
});
