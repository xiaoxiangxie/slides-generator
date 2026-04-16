/**
 * TDD Tests for CaptionOverlay Removal
 * Verifies that CaptionOverlay is NOT used in video rendering pipeline
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const REMOTION_RUNNER = "lib/pipeline/remotion-runner.ts";

describe("CaptionOverlay — should NOT be in video rendering pipeline", () => {
  it("CaptionOverlay component is not referenced in remotion-runner", async () => {
    const content = readFileSync(REMOTION_RUNNER, "utf-8");
    expect(content).not.toMatch(/CaptionOverlay/);
  });

  it("buildCaptionOverlayTsx function does not exist", async () => {
    const content = readFileSync(REMOTION_RUNNER, "utf-8");
    expect(content).not.toMatch(/buildCaptionOverlayTsx/);
  });

  it("CaptionOverlay.tsx is not written to disk during render", async () => {
    const content = readFileSync(REMOTION_RUNNER, "utf-8");
    expect(content).not.toMatch(/CaptionOverlay\.tsx/);
  });

  it("generateSrtFile still exists and is independent of video rendering", async () => {
    const content = readFileSync(REMOTION_RUNNER, "utf-8");
    expect(content).toMatch(/generateSrtFile/);
    expect(content).toMatch(/buildSrt/);
  });
});
