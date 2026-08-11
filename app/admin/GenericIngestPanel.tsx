import React from "react";
import { panel, field, btn, SectionTitle, Label, Stamp } from "./ui";
import { PendingButton } from "./PendingButton";
import { ingestFormsFor, type IngestionSourceRow } from "@/lib/ingestionSources";
import type { IngestedItem } from "@/lib/ingestedItems";

/**
 * The Content tab for a custom ingestion source. Built-in sources have
 * bespoke panels; every source created from the admin renders this one:
 * the source's own system prompt, an ingest form per allowed storage kind
 * (text and/or image — the uniform rule, mirrored server-side by
 * lib/customIngest), and everything already ingested through the uniform
 * IngestedItem shape.
 *
 * The actions arrive as props so the panel stays renderable offline in the
 * feature proof.
 */
export function GenericIngestPanel({
  row,
  items,
  textAction,
  imageAction,
  urlAction,
  fileAction,
  deleteItemAction,
  editHref,
}: {
  row: IngestionSourceRow;
  items: IngestedItem[];
  textAction?: (formData: FormData) => Promise<void>;
  imageAction?: (formData: FormData) => Promise<void>;
  urlAction?: (formData: FormData) => Promise<void>;
  fileAction?: (formData: FormData) => Promise<void>;
  deleteItemAction?: (formData: FormData) => Promise<void>;
  editHref?: string;
}) {
  // The upload method decides which controls appear; storage kinds gate them.
  const forms = ingestFormsFor(row.uploadMethod, row.storageKinds);
  const noForms = !forms.url && !forms.docFile && !forms.textarea && !forms.image;
  return (
    <section data-fill="surface" style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <SectionTitle>{row.label}</SectionTitle>
        {editHref ? (
          <a href={editHref} style={{ fontSize: 13, textDecoration: "underline" }}>
            Edit ingestion
          </a>
        ) : null}
      </div>
      {row.description ? (
        <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 10 }}>
          {row.description}
        </p>
      ) : null}
      {row.systemPrompt ? (
        <p
          style={{
            fontSize: 12,
            color: "var(--on-surface)",
            opacity: 0.8,
            border: "1px solid var(--line, #ccc)",
            borderRadius: 6,
            padding: "8px 10px",
            marginBottom: 14,
            whiteSpace: "pre-wrap",
          }}
        >
          {row.systemPrompt}
        </p>
      ) : null}

      {noForms ? (
        <p style={{ fontSize: 13, fontStyle: "italic", marginBottom: 14 }}>
          This source&apos;s upload method ({row.uploadMethod}) needs {row.storageKinds}-compatible
          storage — edit the ingestion source to line them up.
        </p>
      ) : null}

      {forms.url ? (
        <form action={urlAction} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <input type="hidden" name="sourceKey" value={row.key} />
          <Label>Scan a web page</Label>
          <input
            name="url"
            type="url"
            placeholder="https://…"
            style={field as React.CSSProperties}
          />
          <PendingButton pendingLabel="Scanning…" style={btn as React.CSSProperties}>
            Scan URL
          </PendingButton>
        </form>
      ) : null}

      {forms.docFile ? (
        <form action={fileAction} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <input type="hidden" name="sourceKey" value={row.key} />
          <Label>Upload a document</Label>
          <input
            type="file"
            name="file"
            accept=".pdf,.docx,.txt,.md"
            style={field as React.CSSProperties}
          />
          <PendingButton pendingLabel="Extracting…" style={btn as React.CSSProperties}>
            Ingest document
          </PendingButton>
        </form>
      ) : null}

      {forms.textarea ? (
        <form action={textAction} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <input type="hidden" name="sourceKey" value={row.key} />
          <Label>Add text</Label>
          <input name="title" placeholder="Title (optional)" style={field as React.CSSProperties} />
          <textarea
            name="text"
            rows={4}
            placeholder="Paste or write the text to ingest…"
            style={field as React.CSSProperties}
          />
          <PendingButton pendingLabel="Ingesting…" style={btn as React.CSSProperties}>
            Ingest text
          </PendingButton>
        </form>
      ) : null}

      {forms.image ? (
        <form action={imageAction} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <input type="hidden" name="sourceKey" value={row.key} />
          <Label>Add image</Label>
          <input type="file" name="file" accept="image/*" style={field as React.CSSProperties} />
          <input name="caption" placeholder="Caption (optional)" style={field as React.CSSProperties} />
          <PendingButton pendingLabel="Uploading…" style={btn as React.CSSProperties}>
            Ingest image
          </PendingButton>
        </form>
      ) : null}

      {items.length === 0 ? (
        <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--on-surface)" }}>
          Nothing ingested yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", display: "grid", gap: 10, padding: 0 }}>
          {items.map((it) => (
            <li
              key={it.id}
              style={{ border: "1px solid var(--line, #ccc)", borderRadius: 8, padding: 10 }}
            >
              {it.kind === "image" && it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.imageUrl}
                  alt={it.title}
                  style={{ maxWidth: 180, maxHeight: 120, borderRadius: 6, display: "block", marginBottom: 6 }}
                />
              ) : null}
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{it.title}</strong>
                <Stamp date={it.createdAt} prefix="ingested" />
                <form action={deleteItemAction} style={{ marginLeft: "auto" }}>
                  <input type="hidden" name="sourceKey" value={row.key} />
                  <input type="hidden" name="itemId" value={it.id} />
                  <PendingButton
                    pendingLabel="Deleting…"
                    style={{
                      fontSize: 12,
                      textDecoration: "underline",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--danger, #b00020)",
                    }}
                  >
                    Delete
                  </PendingButton>
                </form>
              </div>
              {it.text ? (
                <p style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 4 }}>{it.text}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
