import { NextResponse } from "next/server";
import { z } from "zod";
import { hoverAt, interact, type InteractOp } from "@/lib/map-session/manager";

const schema = z.object({
  kind: z.enum(["click", "dblclick", "drag", "wheel", "hover", "type", "press", "scrollFeed", "goto"]),
  x: z.number().min(0).max(2000).optional(),
  y: z.number().min(0).max(2000).optional(),
  x1: z.number().min(0).max(2000).optional(),
  y1: z.number().min(0).max(2000).optional(),
  x2: z.number().min(0).max(2000).optional(),
  y2: z.number().min(0).max(2000).optional(),
  deltaY: z.number().min(-2000).max(2000).optional(),
  text: z.string().max(500).optional(),
  key: z.string().max(20).optional(),
  direction: z.enum(["down", "up"]).optional(),
  px: z.number().min(50).max(4000).optional(),
  url: z.string().max(500).optional(),
});

// Remote interaction with the visible session: clicks map from the live-view
// image back to browser coordinates; typing/keys/scroll work on the page.
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid interaction" }, { status: 400 });
  }
  const b = parsed.data;
  let op: InteractOp;
  if (b.kind === "hover") {
    if (b.x === undefined || b.y === undefined) {
      return NextResponse.json({ error: "hover needs x and y" }, { status: 400 });
    }
    try {
      return NextResponse.json(await hoverAt(b.x, b.y));
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "hover failed" }, { status: 502 });
    }
  }
  if (b.kind === "click") {
    if (b.x === undefined || b.y === undefined) {
      return NextResponse.json({ error: "click needs x and y" }, { status: 400 });
    }
    op = { kind: "click", x: b.x, y: b.y };
  } else if (b.kind === "dblclick") {
    if (b.x === undefined || b.y === undefined) {
      return NextResponse.json({ error: "dblclick needs x and y" }, { status: 400 });
    }
    op = { kind: "dblclick", x: b.x, y: b.y };
  } else if (b.kind === "drag") {
    if (b.x1 === undefined || b.y1 === undefined || b.x2 === undefined || b.y2 === undefined) {
      return NextResponse.json({ error: "drag needs x1, y1, x2, y2" }, { status: 400 });
    }
    op = { kind: "drag", x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
  } else if (b.kind === "wheel") {
    if (b.x === undefined || b.y === undefined || b.deltaY === undefined) {
      return NextResponse.json({ error: "wheel needs x, y and deltaY" }, { status: 400 });
    }
    op = { kind: "wheel", x: b.x, y: b.y, deltaY: b.deltaY };
  } else if (b.kind === "type") {
    if (!b.text) return NextResponse.json({ error: "type needs text" }, { status: 400 });
    op = { kind: "type", text: b.text };
  } else if (b.kind === "press") {
    if (!b.key) return NextResponse.json({ error: "press needs key" }, { status: 400 });
    op = { kind: "press", key: b.key };
  } else if (b.kind === "scrollFeed") {
    op = { kind: "scrollFeed", direction: b.direction ?? "down", px: b.px };
  } else {
    if (!b.url) return NextResponse.json({ error: "goto needs url" }, { status: 400 });
    op = { kind: "goto", url: b.url };
  }
  try {
    await interact(op);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "interaction failed" }, { status: 502 });
  }
}
