import { NextResponse } from "next/server";
import { getJobPackage, deleteJob, audit } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pkg = await getJobPackage(id);
  if (!pkg.job) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  return NextResponse.json({ job: pkg.job, total: pkg.businesses.length, businesses: pkg.businesses });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { deleted, leadsDeleted } = await deleteJob(id);
  if (!deleted) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  await audit("SEARCH_DELETED", { entity: "search_job", entityId: id, result: `${leadsDeleted} exclusive leads deleted` });
  return NextResponse.json({ deleted: true, leadsDeleted });
}
