// input:  用户输入（URL/文本）、风格参数、回调
// output: HTML 幻灯片文件路径（+ 可选视频 + SRT）
// pos:    Pipeline 编排器，串联三步 Claude Code CLI 调用 + 可选 Remotion 渲染
// ⚠️ 一旦此文件被更新，务必更新头部注释及所属文件夹的 FOLDER.md

import path from "path";
import { mkdir, writeFile, readFile, copyFile } from "fs/promises";
import { existsSync } from "fs";
import MD5 from "crypto-js/md5";
import { callClaude } from "./claude-runner";
import { buildFetchPrompt, buildPlanPrompt, buildSlidePrompt } from "./prompts";
import { updateJob, getJob, getHtmlPath, getVideoPath } from "@/lib/task-store";
import type { StylePreset, VideoStyle } from "@/lib/style-presets";
import { runRemotionRender } from "./remotion-runner";

/** 获取输入的内容指纹（用于缓存） */
function getInputHash(input: string): string {
  return MD5(input).toString();
}

/** 从用户输入中提取任务名称 */
/** 从用户输入中提取任务名称 */
function extractName(input: string, inputType: "url" | "text"): string {
  if (inputType === "url") {
    try {
      const url = new URL(input);
      const domain = url.hostname.replace(/^www\./, "");
      const segments = url.pathname.replace(/^\//, "").split("/").filter(Boolean);
      if (segments.length > 0) {
        return `${domain}/${segments.slice(-2).join("/")}`;
      }
      return domain;
    } catch {
      return input.slice(0, 60);
    }
  }
  // Text: first non-empty line, truncated
  const firstLine = input.split("\n").find((l) => l.trim().length > 0) || input;
  return firstLine.trim().slice(0, 60);
}

/** 检查任务是否已被取消 */
function isCancelled(id: string): boolean {
  const job = getJob(id);
  return job?.status === "cancelled";
}

/** 若已取消则静默退出（不抛异常，不更新状态） */
function abortIfCancelled(id: string): void {
  if (isCancelled(id)) {
    throw new Error("TASK_CANCELLED");
  }
}

function cleanClaudeOutput(output: string, type: "html" | "markdown"): string {
  const codeBlockRegex = new RegExp(`\`\`\`${type}\\s*\\n([\\s\\S]*?)\`\`\``);
  const match = output.match(codeBlockRegex);
  if (match) return match[1].trim();

  // Fallback to any code block
  const matchAny = output.match(/```[\s\S]*?\n([\s\S]*?)```/);
  if (matchAny) return matchAny[1].trim();

  return output.trim();
}

export interface PipelineInput {
  id: string;
  input: string;
  inputType: "url" | "text";
  style: StylePreset;
  aspectRatio: string;
  taskName?: string;
  videoStyle?: VideoStyle;
}

export async function runPipeline(opts: PipelineInput): Promise<void> {
  const { id, input, inputType, style, aspectRatio, taskName, videoStyle = "normal" } = opts;
  const cwd = process.cwd();

  // Set task name: 前端传入优先，否则自动提取
  updateJob(id, { name: taskName || extractName(input, inputType) });

  const totalSteps = inputType === "url" ? 4 : 3;
  let currentStep = 0;

  // 创建 pipeline 工作目录
  const pipelineDir = path.join(cwd, ".claude-pipeline", id);
  const cacheBaseDir = path.join(cwd, ".claude-pipeline", "cache");
  await mkdir(pipelineDir, { recursive: true });
  await mkdir(cacheBaseDir, { recursive: true });

  const contentPath = path.join(pipelineDir, "01-content.md");
  const outlinePath = path.join(pipelineDir, "02-outline.md");
  
  // 缓存路径定义
  const inputHash = getInputHash(input);
  const cachePath = path.join(cacheBaseDir, `${inputHash}.md`);

  const dateStr = new Date().toISOString().slice(0, 10);
  const htmlPath = getHtmlPath(id, dateStr);
  const taskOutputDir = path.join(cwd, "public", "output", dateStr, id);
  const fullOutputPath = path.join(taskOutputDir, id + ".html");
  await mkdir(taskOutputDir, { recursive: true });

  try {
    // ============================================================
    // Step 1: 内容获取与缓存检测
    // ============================================================
    let contentCached = false;
    if (inputType === "url") {
      currentStep++;

      // 检查缓存
      if (existsSync(cachePath)) {
        updateJob(id, {
          status: "generating",
          skill: "system",
          step: `[${currentStep}/${totalSteps}] 命中缓存，正在加载内容...`,
          progress: 25,
        });
        await copyFile(cachePath, contentPath);
        contentCached = true;
      } else {
        updateJob(id, {
          status: "generating",
          skill: "agent-browser",
          step: `[${currentStep}/${totalSteps}] 正在抓取页面内容...`,
          progress: 10,
        });

        const fetchPrompt = buildFetchPrompt(input, contentPath);
        const fetchResult = await callClaude(fetchPrompt, {
          cwd,
          timeout: 180_000, // 3 分钟
          onStdout: (chunk) => {
            process.stdout.write(chunk);
          },
        });

        if (!fetchResult.success) {
          throw new Error(
            "Step 1 (内容抓取) 失败: " +
              (fetchResult.stderr.slice(-300) || "执行错误")
          );
        }

        const cleanMD = cleanClaudeOutput(fetchResult.stdout, "markdown");
        if (cleanMD.length < 50) {
          throw new Error("Step 1 抓取的内容太短（< 50 字），请检查 URL 是否正确。Claude:" + fetchResult.stdout.slice(0, 100));
        }
        await writeFile(contentPath, cleanMD, "utf-8");
        // 写入全局缓存
        await writeFile(cachePath, cleanMD, "utf-8");

        updateJob(id, {
          step: `[${currentStep}/${totalSteps}] 内容抓取完成`,
          progress: 25,
        });
      }
    } else {
      // 文本输入：直接写入 content 文件
      await writeFile(contentPath, input, "utf-8");
    }

    abortIfCancelled(id);

    // ============================================================
    // Step 1.5: 分析篇幅
    // ============================================================
    currentStep++;
    updateJob(id, {
      status: "generating",
      skill: "system",
      step: `[${currentStep}/${totalSteps}] 正在智能分析内容规模...`,
      progress: inputType === "url" ? 30 : 10,
    });

    const rawContent = await readFile(contentPath, "utf-8");
    let targetSlideCount = 8;
    let rangeType = "适中";

    if (rawContent.length < 800) {
      rangeType = "简洁";
      targetSlideCount = Math.max(1, Math.min(3, Math.ceil(rawContent.length / 200)));
    } else if (rawContent.length < 3000) {
      rangeType = "适中";
      targetSlideCount = Math.max(4, Math.min(10, Math.ceil(rawContent.length / 300)));
    } else {
      rangeType = "详细";
      targetSlideCount = Math.max(11, Math.min(20, Math.ceil(rawContent.length / 400)));
    }
    
    // 稍微停顿让前端有动画效果
    await new Promise(resolve => setTimeout(resolve, 800));
    abortIfCancelled(id);

    // ============================================================
    // Step 2: 内容规划
    // ============================================================
    currentStep++;
    updateJob(id, {
      status: "generating",
      skill: "ljg-writes",
      step: `[${currentStep}/${totalSteps}] 正在规划结构（${rangeType}规模, 预计${targetSlideCount}页）...`,
      progress: inputType === "url" ? 35 : 15,
    });

    const planPrompt = buildPlanPrompt(contentPath, outlinePath, targetSlideCount, rangeType);
    const planResult = await callClaude(planPrompt, {
      cwd,
      timeout: 180_000, // 3 分钟
      extraArgs: ["--tools", '""'], // 禁用工具
      onStdout: (chunk) => {
        process.stdout.write(chunk);
      },
    });

    if (!planResult.success) {
      throw new Error(
        "Step 2 (内容规划) 失败: " +
          (planResult.stderr.slice(-300) || "执行错误")
      );
    }
    
    const cleanOutline = cleanClaudeOutput(planResult.stdout, "markdown");
    await writeFile(outlinePath, cleanOutline, "utf-8");

    updateJob(id, {
      step: `[${currentStep}/${totalSteps}] 内容规划完成`,
      progress: inputType === "url" ? 55 : 40,
    });

    abortIfCancelled(id);

    // ============================================================
    // Step 3: 幻灯片生成
    // ============================================================
    currentStep++;
    updateJob(id, {
      status: "generating",
      skill: "frontend-slides",
      step: `[${currentStep}/${totalSteps}] 正在生成 HTML 幻灯片...`,
      progress: inputType === "url" ? 60 : 45,
    });

    // 根据预估页数动态调整超时
    // 基准：8页=180s，每多1页+30s，上限540s（9分钟）
    const slideTimeout = Math.min(180_000 + (targetSlideCount - 8) * 30_000, 540_000);

    const slidePrompt = buildSlidePrompt(outlinePath, fullOutputPath, style, aspectRatio);
    const slideResult = await callClaude(slidePrompt, {
      cwd,
      timeout: slideTimeout,
      extraArgs: ["--tools", '""'], // 禁用工具
      onStdout: (chunk) => {
        process.stdout.write(chunk);
      },
    });

    if (!slideResult.success) {
      throw new Error(
        "Step 3 (幻灯片生成) 失败: " +
          (slideResult.stderr.slice(-300) || "执行错误")
      );
    }

    const cleanHTML = cleanClaudeOutput(slideResult.stdout, "html");
    await writeFile(fullOutputPath, cleanHTML, "utf-8");

    // ============================================================
    // Step 4: 渲染 Remotion 视频
    // ============================================================
    currentStep++;
    let mp4Path = "";
    
    // 如果启用了视频渲染（视频风格有效），则执行渲染过程
    if (videoStyle) {
      updateJob(id, {
        status: "generating",
        skill: "remotion",
        step: `[${currentStep}/${totalSteps + 1}] 正在渲染视频 (${videoStyle}风格)...`,
        progress: inputType === "url" ? 75 : 60,
      });

      try {
        const renderResult = await runRemotionRender({
          taskId: id,
          htmlPath: fullOutputPath,
          outlinePath: outlinePath,
          outputDir: taskOutputDir,
          dimensions: {
            width: aspectRatio === "16:9" ? 1920 : 1080,
            height: aspectRatio === "16:9" ? 1080 : 1920,
          },
          videoStyle: videoStyle,
          onProgress: (msg) => {
            updateJob(id, { step: `[${currentStep}/${totalSteps + 1}] 渲染中: ${msg}` });
          },
        });
        
        mp4Path = getVideoPath(id, dateStr);
        
        updateJob(id, {
          progress: inputType === "url" ? 95 : 90,
          step: `[${currentStep}/${totalSteps + 1}] 视频渲染完成`,
        });
      } catch (err: any) {
         // 注意：我们让视频渲染失败不阻塞整体 pipeline 成功，但会记录日志
         console.error("[Remotion Render Error]", err);
         updateJob(id, {
          step: `[${currentStep}/${totalSteps + 1}] 视频渲染失败，跳过...`,
         });
      }
    }

    // ============================================================
    // 完成
    // ============================================================
    updateJob(id, {
      status: "done",
      skill: "",
      step: "Done!",
      progress: 100,
      htmlPath,
      videoPath: mp4Path, // 记录 mp4 地址（如果有）
      endedAt: Math.floor(Date.now() / 1000),
    });
  } catch (e: any) {
    // 若已由 cancelJob 设置为 cancelled，不覆盖为 error
    if (e.message === "TASK_CANCELLED") return;
    updateJob(id, {
      status: "error",
      skill: "",
      step: "Failed: " + e.message,
      error: e.message,
      endedAt: Math.floor(Date.now() / 1000),
    });
    throw e;
  }
}
