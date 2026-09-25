import { captureFrame } from "@/lib/map-session/manager";

export const dynamic = "force-dynamic";

// Live view of the controlled browser session (fresh screenshot per request).
export async function GET() {
  try {
    const frame = await captureFrame();
    return new Response(new Uint8Array(frame.data), {
      headers: {
        "Content-Type": frame.contentType,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "no live session" }, { status: 410 });
  }
}
