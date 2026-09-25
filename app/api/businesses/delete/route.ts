import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteBusinesses } from "@/lib/store";

const schema = z.object({ ids: z.array(z.string()).min(1).max(500) });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide ids: string[1..500]" }, { status: 400 });
  }
  const n = await deleteBusinesses(parsed.data.ids);
  return NextResponse.json({ deleted: n });
}
