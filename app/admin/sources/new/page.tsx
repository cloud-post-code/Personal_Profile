import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { UPLOAD_METHODS, STORAGE_KINDS } from "@/lib/ingestionSources";
import { createIngestionSourceAction } from "../../actions";
import { SourceBuilder } from "../../SourceBuilder";
import { PendingButton } from "../../PendingButton";
import { ClassificationSelect } from "../../ClassificationSelect";
import { panel, field, btn, btnGhost, Label } from "../../ui";

export const dynamic = "force-dynamic";

/**
 * Create a new ingestion source by conversation: the builder chat on the
 * left, the draft's sample page — test mode only — on the right. The manual
 * form survives below, collapsed, for when the fields are already known.
 */
export default async function NewIngestionSourcePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAuthed())) redirect("/admin");
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24 }}>New ingestion source</h1>
        <Link href="/admin/dashboard?tab=content" style={btnGhost as React.CSSProperties}>
          Back to Content
        </Link>
      </header>
      {error ? (
        <p role="alert" style={{ color: "var(--danger, #b00020)", marginBottom: 14 }}>
          {error}
        </p>
      ) : null}

      <SourceBuilder />

      <details style={{ marginTop: 24 }}>
        <summary style={{ cursor: "pointer", fontSize: 14, marginBottom: 10 }}>
          Manual setup (skip the chat)
        </summary>
        <section data-fill="surface" style={panel}>
          <form action={createIngestionSourceAction} style={{ display: "grid", gap: 10 }}>
            <Label>Name</Label>
            <input name="label" required placeholder="e.g. Press mentions" style={field as React.CSSProperties} />
            <Label>Code (optional — derived from the name when blank)</Label>
            <input name="key" placeholder="press-mentions" style={field as React.CSSProperties} />
            <Label>Description</Label>
            <input
              name="description"
              placeholder="One line on what this source ingests"
              style={field as React.CSSProperties}
            />
            <Label>System prompt</Label>
            <textarea
              name="systemPrompt"
              rows={4}
              placeholder="How ingested content should be read, extracted, and summarized…"
              style={field as React.CSSProperties}
            />
            <Label>Upload method</Label>
            <select name="uploadMethod" defaultValue="generic" style={field as React.CSSProperties}>
              {UPLOAD_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <Label>Stores</Label>
            {/* Text-only by default; pick image or text+image when needed. */}
            <select name="storageKinds" defaultValue="text" style={field as React.CSSProperties}>
              {STORAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <Label>Output (where ingested data lands)</Label>
            <input
              name="outputMethod"
              placeholder="Source/Photo rows, read back as unified text/image items"
              style={field as React.CSSProperties}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <ClassificationSelect />
              <PendingButton pendingLabel="Creating…" style={btn as React.CSSProperties}>
                Create ingestion source
              </PendingButton>
            </div>
          </form>
        </section>
      </details>
    </main>
  );
}
