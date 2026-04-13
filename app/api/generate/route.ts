import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createJob, updateJob, getHtmlPath } from "@/lib/generation-store";
import { fetchContent } from "@/lib/skills/fetcher";
import { STYLE_PRESETS } from "@/lib/style-presets";
import { mkdir } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { input, inputType, styleId, aspectRatio } = await req.json();

    if (!input?.trim()) {
      return NextResponse.json({ error: "content cannot be empty" }, { status: 400 });
    }

    const style = STYLE_PRESETS.find((s) => s.id === styleId);
    if (!style) {
      return NextResponse.json({ error: "style not found" }, { status: 400 });
    }

    const id = randomUUID().split("-")[0];
    createJob(id);
    updateJob(id, { status: "generating", step: "Starting...", progress: 5 });

    runGeneration(id, input, inputType, style, aspectRatio || "16:9").catch((e) => {
      updateJob(id, { status: "error", step: "Generation failed", error: e.message });
    });

    return NextResponse.json({ id, status: "generating" });
  } catch (e: any) {
    console.error("API error:", e);
    return NextResponse.json({ error: e.message || "generation failed" }, { status: 500 });
  }
}

async function runGeneration(
  id: string,
  input: string,
  inputType: string,
  style: (typeof STYLE_PRESETS)[0],
  aspectRatio: string
) {
  try {
    updateJob(id, { status: "generating", skill: "", step: "Preparing...", progress: 5 });

    let rawContent = input;
    if (inputType === "url") {
      rawContent = await fetchContent(input);
    }

    if (!rawContent || rawContent.trim().length < 50) {
      throw new Error("Content too short, check URL");
    }

    updateJob(id, { status: "generating", skill: "", step: "Preparing prompt...", progress: 30 });

    const dateStr = new Date().toISOString().slice(0, 10);
    const htmlPath = getHtmlPath(id, dateStr);
    const fullOutputPath = path.join(process.cwd(), "public", "output", dateStr, id + ".html");
    await mkdir(path.join(process.cwd(), "public", "output", dateStr), { recursive: true });

    const ratio = aspectRatio === "9:16" ? "9:16 vertical (Douyin/Xiaohongshu)" : "16:9 landscape (YouTube/Desktop)";
    const slideCount = Math.max(8, Math.min(Math.ceil(rawContent.length / 400), 25));

    // Write prompt to temp file to avoid command line length issues
    const prompt = buildPrompt({ rawContent, style, ratio, slideCount, fullOutputPath });
    const promptFile = "/tmp/claude-prompt-" + Date.now() + ".txt";
    writeFileSync(promptFile, prompt, "utf-8");

    updateJob(id, { status: "generating", skill: "frontend-slides", step: "[frontend-slides] Claude Code generating slides...", progress: 40 });

    await callClaudeCode(promptFile);

    updateJob(id, { status: "generating", skill: "frontend-slides", step: "[frontend-slides] Saving file...", progress: 85 });

    if (!existsSync(fullOutputPath)) {
      throw new Error("Claude Code did not generate file");
    }

    updateJob(id, { status: "done", skill: "", step: "Done!", progress: 100, htmlPath });
  } catch (e: any) {
    updateJob(id, { status: "error", skill: "", step: "Failed: " + e.message, error: e.message });
    throw e;
  }
}

function buildPrompt(opts: {
  rawContent: string;
  style: (typeof STYLE_PRESETS)[0];
  ratio: string;
  slideCount: number;
  fullOutputPath: string;
}): string {
  return (
    "You are a slide generation expert. Follow the frontend-slides skill strictly.\n\n" +
    "## TASK\n\n" +
    "Generate " + opts.slideCount + " HTML slides from the content below.\n\n" +
    "## CONTENT (first 8000 chars)\n" +
    opts.rawContent.slice(0, 8000) + "\n\n" +
    "## STYLE\n" +
    "- Name: " + opts.style.name + "\n" +
    "- Background: " + opts.style.bg + "\n" +
    "- Accent: " + opts.style.accent + "\n" +
    "- Text: " + opts.style.text + "\n" +
    "- Secondary: " + opts.style.secondary + "\n" +
    "- Display font: " + opts.style.displayFont + "\n" +
    "- Body font: " + opts.style.bodyFont + "\n" +
    "- Aspect ratio: " + opts.ratio + "\n\n" +
    "## OUTPUT FILE\n" +
    opts.fullOutputPath + "\n\n" +
    "## EXECUTION\n" +
    "1. Read ./claude/skills/frontend-slides/SKILL.md\n" +
    "2. Read ./claude/skills/frontend-slides/viewport-base.css (embed fully)\n" +
    "3. Read ./claude/skills/frontend-slides/STYLE_PRESETS.md\n" +
    "4. Generate " + opts.slideCount + " slides, each:\n" +
    "   - class=\"slide\" with height 100vh/100dvh, overflow hidden\n" +
    "   - class=\"slide-content\" for content\n" +
    "   - clamp() for all font sizes\n" +
    "   - .reveal elements, shown when .slide.visible\n" +
    "   - SlidePresentation JS class (keyboard nav, dots, progress bar)\n" +
    "   - Zero external deps (Google Fonts CDN ok)\n" +
    "5. Clean markdown: no ## or ** in body text\n" +
    "6. Content density: title (1 title+1 subtitle), concept (1 title+4-6 bullets), code (1 title+code block)\n" +
    "7. Never scroll within a slide\n\n" +
    "Output: " + opts.fullOutputPath + "\n"
  );
}

function callClaudeCode(promptFile: string): Promise<void> {
  return new Promise(function(resolve, reject) {
    // 用 bash 重定向文件到 stdin，避免 --input-format stream-json 的复杂性
    var proc = spawn("bash", ["-c", "claude --print --no-session-persistence --dangerously-skip-permissions --add-dir " + process.cwd() + " --model sonnet < " + promptFile], {
      cwd: process.cwd(),
      env: Object.assign({}, process.env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    var stderr = "";
    var elapsed = 0;

    var progressInterval = setInterval(function() {
      elapsed += 20;
      // 每 20 秒推进一点
    }, 20000);

    var timeout = setTimeout(function() {
      clearInterval(progressInterval);
      proc.kill();
      reject(new Error("Claude Code timeout (10min)"));
    }, 600000);

    proc.stdout.on("data", function(chunk: Buffer) {
      // 实时输出到 console，调试用
      process.stdout.write(chunk);
    });

    proc.stderr.on("data", function(chunk: Buffer) {
      stderr += chunk.toString();
    });

    proc.on("close", function(code: number) {
      clearInterval(progressInterval);
      clearTimeout(timeout);
      if (code === 0 || stderr.indexOf("Done:") !== -1 || stderr.indexOf("完成") !== -1) {
        resolve();
      } else {
        console.error("Claude Code exit code:", code);
        console.error("Claude Code stderr:", stderr.slice(-500));
        reject(new Error("Claude Code failed (exit " + code + "): " + stderr.slice(-200)));
      }
    });

    proc.on("error", function(err: Error) {
      clearInterval(progressInterval);
      clearTimeout(timeout);
      reject(err);
    });
  });
}
