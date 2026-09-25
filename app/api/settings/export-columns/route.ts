import { NextResponse } from "next/server";
import { z } from "zod";
import { getExportColumnsSetting, saveExportColumnsSetting } from "@/lib/store";

// Export column customization, stored in the database (system_settings)
// so all devices and browsers share the same columns.
export async function GET() {
  const columns = await getExportColumnsSetting();
  return NextResponse.json({ columns, customized: columns !== null });
}

const schema = z.object({ columns: z.array(z.string().min(1).max(64)).min(1).max(50) });

export async function PUT(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide columns: string[1..50]" }, { status: 400 });
  }
  try {
    const columns = await saveExportColumnsSetting(parsed.data.columns);
    return NextResponse.json({ columns, customized: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 400 });
  }
}
