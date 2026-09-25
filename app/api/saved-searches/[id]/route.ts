import { NextResponse } from "next/server";
import { deleteSavedScraping } from "@/lib/store";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = await deleteSavedScraping(decodeURIComponent(id));
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
