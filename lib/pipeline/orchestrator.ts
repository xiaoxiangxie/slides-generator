/**
 * Agency Orchestrator 封装层
 * 替代原来的 pipeline/index.ts
 */
import path from "path";
import { mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { runSlidesWorkflow, type WorkflowInputs } from "./run-workflow";
import { updateJob, getJob, addJobLog } from "@/lib/db";
import { runRemotionRender } from "./remotion-runner";
import type { VideoStyle } from "@/lib/style-presets";
import type { StylePreset } from "@/lib/style-presets";

const WORKFLOW_YAML = path.join(process.cwd(), "workflows", "slides-generator.yaml");

export interface OrchestratorInput {
  id: string;
  input: string;
  inputType: "url" | "text";
  style: StylePreset;
  aspectRatio: string;
  taskName?: string;
  videoStyle?: "normal" | "fast" | "slow";
}

function isCancelled(id: string): boolean {
  const job = getJob(id);
  return job?.status === "cancelled";
}

function abortIfCancelled(id: string): void {
  if (isCancelled(id)) {
    throw new Error("TASK_CANCELLED");
  }
}

/** 从 markdown 代码块中提取 HTML 内容 */
function extractHtmlFromMarkdown(markdown: string): string {
  const match = markdown.match(/```html\n?([\s\S]*?)```/);
  return match ? match[1].trim() : markdown.trim();
}

export async function runPipeline(opts: OrchestratorInput): Promise<void> {
  const { id, input, inputType, style, aspectRatio, taskName, videoStyle = "normal" } = opts;
  const cwd = process.cwd();

  const dateStr = new Date().toISOString().slice(0, 10);
  const outputDir = path.join(cwd, "public", "output", dateStr, id);
  const htmlFilePath = path.join(outputDir, `${id}.html`);
  const htmlUrlPath = `/output/${dateStr}/${id}/${id}.html`;
  const dimensions = {
    width: aspectRatio === "16:9" ? 1920 : 1080,
    height: aspectRatio === "16:9" ? 1080 : 1920,
  };

  const styleJson = JSON.stringify({
    style_name: style.name,
    style_name_cn: style.nameCn,
    style_bg: style.bg,
    style_text: style.text,
    style_accent: style.accent,
    style_secondary: style.secondary,
    style_display_font: style.displayFont,
    style_body_font: style.bodyFont,
    style_vibe: style.vibe,
    layout_instruction: `风格调性：${style.vibe}。背景色：${style.bg}，主文字色：${style.text}，强调色：${style.accent}，次要色：${style.secondary}。`,
  });

  const workflowInputs: WorkflowInputs = {
    source: input,
    input_type: inputType,
    style_id: style.id,
    style_json: styleJson,
    aspect_ratio: aspectRatio as "16:9" | "9:16",
    video_style: videoStyle,
    output_dir: outputDir,
    width: dimensions.width,
    height: dimensions.height,
  };

  try {
    updateJob(id, {
      status: "generating",
      skill: "agent-browser",
      step: "正在启动工作流...",
      progress: 5,
    });
    addJobLog(id, "启动", "progress", "开始执行幻灯片生成工作流");

    abortIfCancelled(id);

    // 用于收集步骤输出
    let planSlidesOutput = "";
    let generateSlidesOutput = "";

    // 提前准备 raw_content（extract_content / use_text_directly 的输出）
    const skipSteps = new Map<string, string>();

    // 预填充 raw_content 到 inputsMap（下游步骤的 {{raw_content}} 模板变量需要）
    if (inputType === "text") {
      skipSteps.set("use_text_directly", input);
      workflowInputs.raw_content = input;
      addJobLog(id, "use_text_directly", "done", "直接使用文本内容");
    } else {
      // URL 类型：直接执行 baoyu-url-to-markdown 脚本
      try {
        addJobLog(id, "extract_content", "progress", `正在提取 URL 内容: ${input}`);
        const scriptDir = path.join(process.env.HOME || "", ".agents/skills/baoyu-url-to-markdown/scripts");
        const cmd = `cd "${scriptDir}" && npx --yes tsx main.ts "${input}"`;
        const result = execSync(cmd, { timeout: 120_000, encoding: "utf-8" });
        skipSteps.set("extract_content", result.trim());
        workflowInputs.raw_content = result.trim();
        addJobLog(id, "extract_content", "done", `URL 内容提取成功 (${result.trim().length} 字)`);
      } catch (err: any) {
        const errMsg = `extract_content 失败: ${err.message}`;
        addJobLog(id, "extract_content", "error", errMsg);
        updateJob(id, { status: "error", step: errMsg, error: errMsg });
        throw new Error(errMsg);
      }
    }

    await runSlidesWorkflow(WORKFLOW_YAML, workflowInputs, {
      onStepStart: (stepId) => {
        updateJob(id, {
          status: "generating",
          skill: stepId,
          step: `正在执行: ${stepId}...`,
          progress: 30,
        });
        addJobLog(id, stepId, "progress", `开始执行步骤: ${stepId}`);
      },
      onStepComplete: (stepId, output, failed) => {
        if (failed) {
          const errMsg = `步骤 [${stepId}] 执行失败: ${output}`;
          addJobLog(id, stepId, "error", errMsg);
          throw new Error(errMsg);
        }
        const progressMap: Record<string, number> = {
          extract_content: 20,
          use_text_directly: 20,
          analyze_length: 35,
          plan_slides: 50,
          generate_slides: 70,
        };
        if (stepId === "plan_slides") {
          planSlidesOutput = output;
        }
        if (stepId === "generate_slides") {
          generateSlidesOutput = output;
        }
        updateJob(id, {
          skill: stepId,
          step: `完成: ${stepId}`,
          progress: progressMap[stepId] ?? 50,
        });
        // 记录步骤输出摘要（截断避免过长）
        const summary = output.length > 200 ? output.slice(0, 200) + "..." : output;
        addJobLog(id, stepId, "done", `输出: ${summary}`);
      },
      onBatchComplete: (stepIds) => {
        abortIfCancelled(id);
      },
    }, { skipSteps });

    // 确保输出目录存在
    mkdirSync(outputDir, { recursive: true });

    // 从 plan_slides 的 markdown 输出中提取 JSON outline 并保存
    const outlinePath = path.join(outputDir, `${id}-outline.md`);
    if (planSlidesOutput) {
      // 支持 ```json 或 ```markdown 代码块
      const outlineMatch = planSlidesOutput.match(/```(?:json|markdown)\n?([\s\S]*?)```/);
      const outlineContent = outlineMatch ? outlineMatch[1].trim() : planSlidesOutput.trim();
      writeFileSync(outlinePath, outlineContent, "utf-8");
    }

    // 从 generate_slides 的 markdown 输出中提取 HTML 并保存到文件
    if (generateSlidesOutput) {
      let htmlContent = extractHtmlFromMarkdown(generateSlidesOutput);
      
      const bridgeScript = `
<script>
(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const slideParam = urlParams.get('slide');
  if (slideParam !== null) {
    const slideIdx = parseInt(slideParam);
    function sync() {
      const slides = document.querySelectorAll('.slide');
      if (slides.length > 0) {
        slides.forEach((s, i) => {
          s.style.display = i === slideIdx ? 'flex' : 'none';
          if (i === slideIdx) {
            s.style.visibility = 'visible';
            s.style.opacity = '1';
          }
        });
      }
    }

    window.addEventListener('message', (e) => {
      if (e.data.type === 'SEEK') {
        const frame = e.data.frame;
        const time = frame / 30;
        document.querySelectorAll('.slide').forEach((s, i) => {
          if (i === slideIdx) {
            s.querySelectorAll('*').forEach(el => {
              const style = window.getComputedStyle(el);
              if (style.animationName !== 'none') {
                el.style.animationPlayState = 'paused';
                el.style.animationDelay = \`-\${time}s\`;
                el.style.transition = 'none';
              }
            });
          }
        });
      }
    });

    document.addEventListener('DOMContentLoaded', sync);
    window.addEventListener('load', sync);
  }
})();
</script>
`;
      if (htmlContent.includes('</body>')) {
        htmlContent = htmlContent.replace('</body>', `${bridgeScript}</body>`);
      } else {
        htmlContent += bridgeScript;
      }

      writeFileSync(htmlFilePath, htmlContent, "utf-8");
    }


    // 调用 Remotion 渲染视频
    if (planSlidesOutput && generateSlidesOutput) {
      updateJob(id, {
        status: "generating",
        skill: "remotion",
        step: "正在渲染视频...",
        progress: 80,
      });
      addJobLog(id, "视频渲染", "progress", "开始渲染视频");
      abortIfCancelled(id);

      const { mp4Path, srtPath } = await runRemotionRender({
        taskId: id,
        htmlPath: htmlFilePath,
        outlinePath,
        outputDir,
        dimensions,
        videoStyle: videoStyle as VideoStyle,
        onProgress: (msg) => {
          updateJob(id, { step: msg, progress: 85 });
        },
      });

      const videoUrlPath = `/output/${dateStr}/${id}/${id}.mp4`;

      updateJob(id, {
        status: "done",
        skill: "",
        step: "Done!",
        progress: 100,
        htmlPath: htmlUrlPath,
        videoPath: videoUrlPath,
        endedAt: Math.floor(Date.now() / 1000),
      });
      addJobLog(id, "完成", "done", `HTML: ${htmlUrlPath}, 视频: ${videoUrlPath}`);
    } else {
      updateJob(id, {
        status: "done",
        skill: "",
        step: "Done!",
        progress: 100,
        htmlPath: htmlUrlPath,
        endedAt: Math.floor(Date.now() / 1000),
      });
      addJobLog(id, "完成", "done", `HTML: ${htmlUrlPath}`);
    }
  } catch (e: any) {
    if (e.message === "TASK_CANCELLED") {
      addJobLog(id, "取消", "error", "任务被取消");
      return;
    }

    addJobLog(id, "错误", "error", e.message);
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
