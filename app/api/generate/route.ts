// input:  POST body { input, inputType, styleId, aspectRatio, taskName? }
// output: JSON { id, status: "generating" }
// pos:    API 入口，创建任务并启动 Pipeline
// ⚠️ 一旦此文件被更新，务必更新头部注释及所属文件夹的 FOLDER.md

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createJob, updateJob } from "@/lib/task-store";
import { STYLE_PRESETS } from "@/lib/style-presets";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { input, inputType, styleId, aspectRatio, taskName, videoStyle } = await req.json();

    if (!input?.trim()) {
      return NextResponse.json({ error: "content cannot be empty" }, { status: 400 });
    }

    const style = STYLE_PRESETS.find((s) => s.id === styleId);
    if (!style) {
      return NextResponse.json({ error: "style not found" }, { status: 400 });
    }

    const id = randomUUID().split("-")[0];
    // taskName 由前端传入，不填则由 Pipeline 内部自动提取
    createJob(id, taskName || "");
    updateJob(id, { status: "generating", step: "Starting pipeline...", progress: 5, name: taskName || "" });

    // 异步启动 Pipeline（不阻塞响应）
    runPipeline({
      id,
      input: input.trim(),
      inputType: inputType || "url",
      style,
      aspectRatio: aspectRatio || "16:9",
      taskName: taskName || "",
      videoStyle: videoStyle || "normal",
    }).catch((e) => {
      console.error("[Pipeline error]", e);
      updateJob(id, { status: "error", step: "Pipeline failed", error: e.message });
    });

    return NextResponse.json({ id, status: "generating" });
  } catch (e: any) {
    console.error("API error:", e);
    return NextResponse.json({ error: e.message || "generation failed" }, { status: 500 });
  }
}
