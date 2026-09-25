import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusiness, deleteBusinesses, updateBusiness } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await getBusiness(decodeURIComponent(id));
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ business: b });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = await deleteBusinesses([decodeURIComponent(id)]);
  if (!n) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}

const patchSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  primaryCategory: z.string().max(200).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  formattedAddress: z.string().max(500).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  district: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(40).optional().nullable(),
}).refine((o) => Object.keys(o).length > 0, { message: "Nothing to update" });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const business = await updateBusiness(decodeURIComponent(id), parsed.data);
    return NextResponse.json({ business });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: msg === "Business not found" ? 404 : 400 });
  }
}
