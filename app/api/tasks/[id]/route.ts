import { NextRequest, NextResponse } from "next/server";
import { deleteJob, getJob } from "@/lib/task-store";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  deleteJob(id);
  return NextResponse.json({ ok: true });
}
