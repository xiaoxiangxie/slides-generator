import { NextResponse } from "next/server";
import { listJobs } from "@/lib/task-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = listJobs(30);
  return NextResponse.json(jobs);
}
