import { NextRequest, NextResponse } from "next/server";
import { cancelJob, getJob } from "@/lib/task-store";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  if (job.status !== "generating") {
    return NextResponse.json({ error: "只能取消进行中的任务" }, { status: 400 });
  }
  cancelJob(id);
  return NextResponse.json({ ok: true });
}
