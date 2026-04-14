import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/task-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    status: job.status === "pending" || job.status === "generating" ? "generating" : job.status,
    skill: job.skill,
    step: job.step,
    progress: job.progress,
    htmlPath: job.htmlPath,
    error: job.error,
  });
}
