// Client-side reader for our SSE streams (works with GET EventSource-style
// endpoints and POST streams alike).

export type StreamTone = "ok" | "warn" | "error" | "dim" | "info" | "stage";

export interface StreamLine {
  id: number;
  text: string;
  tone: StreamTone;
  at: number;
}

export async function readSSEStream(
  res: Response,
  onEvent: (e: Record<string, unknown>) => void,
  onLine?: (line: Omit<StreamLine, "id" | "at">) => void
): Promise<void> {
  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) message = String(j.error);
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      const line = p.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        const e = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
        onEvent(e);
        const mapped = eventToLine(e);
        if (mapped && onLine) onLine(mapped);
      } catch {
        /* partial JSON — ignore */
      }
    }
  }
}

function eventToLine(e: Record<string, unknown>): Omit<StreamLine, "id" | "at"> | null {
  const t = String(e.t ?? "");
  if (t === "stage") return { text: String(e.message ?? ""), tone: "stage" };
  if (t === "log") {
    const tone = String(e.tone ?? "info");
    return {
      text: String(e.message ?? ""),
      tone: tone === "ok" ? "ok" : tone === "warn" ? "warn" : tone === "dim" ? "dim" : "info",
    };
  }
  if (t === "found") {
    const has = (e as { hasWebsite?: boolean }).hasWebsite;
    return { text: `Found: ${String(e.name ?? "")}${has ? "  [website ✓]" : "  [no website]"}`, tone: has ? "ok" : "dim" };
  }
  if (t === "start") return { text: `Crawling ${(e as { name?: string }).name ?? ""}…`, tone: "info" };
  if (t === "item") {
    const r = e as { name?: string; status?: string; reason?: string; emails?: number; phones?: number; socials?: number; pagesCrawled?: number; done?: number; total?: number };
    const prefix = r.total ? `[${r.done}/${r.total}] ` : "";
    if (r.status === "completed") {
      return { text: `${prefix}✓ ${r.name} — ${r.emails} emails · ${r.phones} phones · ${r.socials} socials (${r.pagesCrawled}p)`, tone: "ok" };
    }
    if (r.status === "skipped") return { text: `${prefix}– ${r.name} — ${r.reason ?? "skipped"}`, tone: "dim" };
    return { text: `${prefix}✕ ${r.name} — ${r.reason ?? "failed"}`, tone: "error" };
  }
  if (t === "error") return { text: `✕ ${String(e.message ?? "failed")}`, tone: "error" };
  return null;
}
