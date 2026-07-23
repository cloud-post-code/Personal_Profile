"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { field } from "./ui";

/**
 * A file input that submits its parent <form action={...}> the instant a file
 * is chosen — no separate "Upload" button. Must live inside a form whose
 * action is a server action. Shows a lit "Uploading…" hint while in flight.
 */
export function AutoUploadFile({
  name = "file",
  accept = "image/*",
  hint = "Choose an image — it uploads automatically.",
}: {
  name?: string;
  accept?: string;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { pending } = useFormStatus();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        ref={ref}
        type="file"
        name={name}
        accept={accept}
        disabled={pending}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            e.target.form?.requestSubmit();
          }
        }}
        style={{ ...field, marginBottom: 0, maxWidth: 240 }}
      />
      <span
        style={{
          fontSize: 12,
          color: pending ? "var(--primary-soft)" : "var(--text-muted)",
          transition: "color 0.2s ease",
        }}
      >
        {pending ? "Uploading…" : hint}
      </span>
    </div>
  );
}
