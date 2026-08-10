import React from "react";
import {
  CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  ENABLED_CLASSIFICATIONS,
} from "@/lib/ingestionSources";
import { field, Label } from "./ui";

/**
 * The classification picker that sits next to Save on every ingestion
 * source form. All four statuses are listed so the coming tiers are
 * discoverable, but only the ENABLED_CLASSIFICATIONS set is choosable —
 * the server enforces the same rule in saveIngestionSource.
 *
 * Server forms use `defaultValue` (posts as name="classification"); the
 * client-side builder passes `value` + `onChange` instead.
 */
export function ClassificationSelect({
  defaultValue = "public",
  value,
  onChange,
}: {
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6, flex: "1 1 200px" }}>
      <Label>Classification</Label>
      <select
        name="classification"
        {...(onChange
          ? { value, onChange: (e) => onChange(e.target.value) }
          : { defaultValue })}
        style={field as React.CSSProperties}
      >
        {CLASSIFICATIONS.map((c) => {
          const enabled = (ENABLED_CLASSIFICATIONS as readonly string[]).includes(c);
          return (
            <option key={c} value={c} disabled={!enabled}>
              {CLASSIFICATION_LABELS[c]}
              {enabled ? "" : " (coming soon)"}
            </option>
          );
        })}
      </select>
    </div>
  );
}
