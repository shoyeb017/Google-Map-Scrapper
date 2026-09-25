import { NextResponse } from "next/server";
import { listAuditLogs, clearAuditLogs } from "@/lib/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);
  const logs = await listAuditLogs(limit);
  return NextResponse.json({ total: logs.length, logs });
}

export async function DELETE() {
  const n = await clearAuditLogs();
  return NextResponse.json({ cleared: n });
}
