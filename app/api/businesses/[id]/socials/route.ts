import { NextResponse } from "next/server";
import { z } from "zod";
import { addSocial, deleteSocial } from "@/lib/store";

const addSchema = z.object({
  platform: z.string().min(1).max(40),
  url: z.string().min(1).max(500),
});

const refSchema = z.object({
  socialId: z.string().optional(),
  platform: z.string().max(40).optional(),
  url: z.string().max(500).optional(),
});

async function id(ctx: { params: Promise<{ id: string }> }) {
  return decodeURIComponent((await ctx.params).id);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const json = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide platform and url" }, { status: 400 });
  }
  try {
    const social = await addSocial(await id(ctx), parsed.data);
    return NextResponse.json({ social }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const json = await req.json().catch(() => null);
  const parsed = refSchema.safeParse(json ?? {});
  if (!parsed.success || (!parsed.data.socialId && !parsed.data.platform)) {
    return NextResponse.json({ error: "Provide socialId or platform (+url)" }, { status: 400 });
  }
  const ok = await deleteSocial(await id(ctx), parsed.data);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
