import { NextResponse } from "next/server";
import { z } from "zod";
import { listContacts, addContact, deleteContact, setPrimaryContact } from "@/lib/store";

const addSchema = z.object({
  type: z.enum(["phone", "email"]),
  value: z.string().min(1).max(254),
  category: z.string().max(40).optional(),
});

const refSchema = z.object({
  contactId: z.string().optional(),
  type: z.enum(["phone", "email"]).optional(),
  value: z.string().max(254).optional(),
});

async function id(ctx: { params: Promise<{ id: string }> }) {
  return decodeURIComponent((await ctx.params).id);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ contacts: await listContacts(await id(ctx)) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const json = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide type (phone|email) and value" }, { status: 400 });
  }
  try {
    const contact = await addContact(await id(ctx), parsed.data);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const json = await req.json().catch(() => null);
  const parsed = refSchema.safeParse(json ?? {});
  if (!parsed.success || (!parsed.data.contactId && !(parsed.data.type && parsed.data.value))) {
    return NextResponse.json({ error: "Provide contactId or type+value" }, { status: 400 });
  }
  const ok = await deleteContact(await id(ctx), parsed.data);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const json = await req.json().catch(() => null);
  const parsed = refSchema.safeParse(json ?? {});
  if (!parsed.success || (!parsed.data.contactId && !(parsed.data.type && parsed.data.value))) {
    return NextResponse.json({ error: "Provide contactId or type+value to mark primary" }, { status: 400 });
  }
  const ok = await setPrimaryContact(await id(ctx), parsed.data);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ primary: true });
}
