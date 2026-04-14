import { NextRequest } from "next/server";
import { getJob } from "@/lib/task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout;

  const stream = new ReadableStream({
    start(controller) {
      // 轮询 job 状态，SSE 每秒推送一次
      intervalId = setInterval(() => {
        const job = getJob(id);
        if (!job) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "任务不存在" })}\n\n`));
          controller.close();
          clearInterval(intervalId);
          return;
        }

        const msg = {
          type: job.status === "done" ? "done" : job.status === "error" ? "error" : "progress",
          skill: job.skill,
          step: job.step,
          progress: job.progress,
          htmlPath: job.htmlPath,
          message: job.error,
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));

        if (job.status === "done" || job.status === "error") {
          controller.close();
          clearInterval(intervalId);
        }
      }, 800);
    },
    cancel() {
      clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
