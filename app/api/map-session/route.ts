import { NextResponse } from "next/server";
import { startSession, closeSession, getSessionState } from "@/lib/map-session/manager";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getSessionState();
  return NextResponse.json(state);
}

export async function POST() {
  try {
    const s = await startSession();
    return NextResponse.json({ launched: true, ...s });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "launch failed" }, { status: 502 });
  }
}

export async function DELETE() {
  await closeSession();
  return NextResponse.json({ closed: true });
}
