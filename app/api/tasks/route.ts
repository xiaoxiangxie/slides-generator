import { NextResponse } from "next/server";
import { listJobs } from "@/lib/task-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit");
  const jobs = listJobs(limit ? parseInt(limit) : 1000);
  return NextResponse.json(jobs);
}
