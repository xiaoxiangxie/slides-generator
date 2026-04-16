import { NextRequest, NextResponse } from "next/server";
import { getJobLogs } from "@/lib/task-store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const logs = getJobLogs(id);
  return NextResponse.json(logs);
}
