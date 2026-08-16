import React from "react";
import { panel, field, btn, SectionTitle, Label, Stamp } from "./ui";
import { PendingButton } from "./PendingButton";
import { ingestFormsFor, type IngestionSourceRow } from "@/lib/ingestionSources";
import { Paginated } from "./Paginated";
import { PanelHtml } from "./PanelHtml";
import { IngestClassificationSelect } from "./IngestClassificationSelect";
import { CLASSIFICATION_LABELS } from "@/lib/ingestionSources";
import type { ClassifiedItem, IngestedItem } from "@/lib/ingestedItems";

/**
 * The Content tab for a custom ingestion source. Built-in sources have
 * bespoke panels; every source created from the admin renders this one:
 * the source's own system prompt, an ingest form per allowed storage kind
 * (text and/or image — the uniform rule, mirrored server-side by
 * lib/customIngest), and everything already ingested through the uniform
 * IngestedItem shape.
 *
 * Every ingest form carries a classification picker defaulting to the
 * source's own classification, so one document can be filed differently from
 * the rest of its source. Each listed item shows what it resolved to.
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
  /**
   * Classified items in the live admin. Plain IngestedItems are accepted too
   * — the badge is display-only, and an item without a resolved
   * classification simply falls back to the source's.
   */
  items: Array<IngestedItem | ClassifiedItem>;
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

  // Custom page code: substitute {{items}} server-side. Item text is
  // HTML-escaped (the code is trusted-validated; the CONTENT never is), and
  // images render only from our own uploads route.
  const esc = (v: string) =>
    v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const itemsHtml = items
    .map((it) => {
      const img =
        it.kind === "image" && it.imageUrl && it.imageUrl.startsWith("/api/uploads/")
          ? `<img src="${esc(it.imageUrl)}" alt="${esc(it.title)}" style="max-width:180px;border-radius:6px;display:block;margin-bottom:6px;">`
          : "";
      const text = it.text ? `<p style="margin:4px 0 0;">${esc(it.text)}</p>` : "";
      return `<div class="ingested-item" style="margin-bottom:10px;">${img}<strong>${esc(it.title)}</strong>${text}</div>`;
    })
    .join("");
  const customPage = row.panelHtml.trim()
    ? row.panelHtml.replaceAll("{{items}}", () => itemsHtml)
    : "";
  const itemList =
    items.length === 0 ? (
          <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--on-surface)" }}>
            Nothing ingested yet.
          </p>
        ) : (
          // Split ingests make long lists routine; Paginated shows 10 at a
          // time and disappears entirely for short lists.
          <Paginated>
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
                  {(() => {
                    const c = "classification" in it ? it.classification : row.classification;
                    const own = "classificationOverridden" in it && it.classificationOverridden;
                    const label =
                      (CLASSIFICATION_LABELS as Record<string, string>)[c] ??
                      CLASSIFICATION_LABELS.public;
                    return (
                      <span
                        title={
                          own
                            ? "Set on this item when it was ingested"
                            : "Inherited from this source's classification"
                        }
                        style={{
                          fontSize: 11,
                          borderRadius: 999,
                          padding: "1px 8px",
                          border: "1px solid var(--line, #ccc)",
                          // An override is the exception worth spotting in a
                          // long list; inherited is the quiet default.
                          opacity: own ? 1 : 0.6,
                          fontWeight: own ? 600 : 400,
                        }}
                      >
                        {label}
                      </span>
                    );
                  })()}
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
          </Paginated>
        );

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
      {customPage ? (
        // The source's own page code, sealed in the coded-card sandbox.
        <PanelHtml html={customPage} />
      ) : (
        <>
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
        </>
      )}

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
          <IngestClassificationSelect sourceDefault={row.classification} />
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
          <IngestClassificationSelect sourceDefault={row.classification} />
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
          <IngestClassificationSelect sourceDefault={row.classification} />
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
          <IngestClassificationSelect sourceDefault={row.classification} />
          <PendingButton pendingLabel="Uploading…" style={btn as React.CSSProperties}>
            Ingest image
          </PendingButton>
        </form>
      ) : null}

      {customPage ? (
        // With a custom page showing the items, the native list (with its
        // working Delete buttons) folds into a management drawer.
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, marginBottom: 8 }}>
            Manage items ({items.length})
          </summary>
          {itemList}
        </details>
      ) : (
        itemList
      )}
    </section>
  );
}
