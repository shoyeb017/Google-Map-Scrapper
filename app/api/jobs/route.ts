import { NextResponse } from "next/server";
import { listJobs } from "@/lib/store";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({ total: jobs.length, jobs });
}
