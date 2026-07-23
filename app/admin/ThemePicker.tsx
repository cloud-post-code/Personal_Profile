"use client";

import { useState } from "react";
import { field, Label } from "./ui";

type FontOption = { key: string; label: string; family: string };
type RadiusOption = { key: string; label: string; preview: string };

/**
 * Visual theme controls for the Persona & Theme form. Everything writes into
 * hidden inputs (themeFont, themeBodyFont, themeRadius, color_bg/primary/accent)
 * so the existing savePersona server action stays unchanged.
 *
 *  - Fonts: a custom dropdown where each option renders in its own typeface.
 *  - Colors: 3 swatch boxes; clicking one opens a color picker + hex entry.
 *  - Corners: 3 preview boxes (each a different accent) showing the roundness.
 */
export function ThemePicker({
  fontOptions,
  bodyFontOptions,
  radiusOptions,
  initial,
}: {
  fontOptions: FontOption[];
  bodyFontOptions: FontOption[];
  radiusOptions: RadiusOption[];
  initial: {
    themeFont: string;
    themeBodyFont: string;
    themeRadius: string;
    bg: string;
    primary: string;
    accent: string;
  };
}) {
  const [themeFont, setThemeFont] = useState(initial.themeFont || fontOptions[0]?.key);
  const [themeBodyFont, setThemeBodyFont] = useState(initial.themeBodyFont || "inter");
  const [themeRadius, setThemeRadius] = useState(initial.themeRadius || radiusOptions[0]?.key);
  const [bg, setBg] = useState(initial.bg);
  const [primary, setPrimary] = useState(initial.primary);
  const [accent, setAccent] = useState(initial.accent);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Hidden inputs the server action reads. */}
      <input type="hidden" name="themeFont" value={themeFont} />
      <input type="hidden" name="themeBodyFont" value={themeBodyFont} />
      <input type="hidden" name="themeRadius" value={themeRadius} />
      <input type="hidden" name="color_bg" value={bg} />
      <input type="hidden" name="color_primary" value={primary} />
      <input type="hidden" name="color_accent" value={accent} />

      <div style={grid2}>
        <div>
          <Label>Headline font</Label>
          <FontDropdown options={fontOptions} value={themeFont} onChange={setThemeFont} />
        </div>
        <div>
          <Label>Text font</Label>
          <FontDropdown options={bodyFontOptions} value={themeBodyFont} onChange={setThemeBodyFont} />
        </div>
      </div>

      <div>
        <Label>Colors</Label>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <ColorSwatch label="Background" value={bg} fallback="#0B1020" onChange={setBg} />
          <ColorSwatch label="Primary" value={primary} fallback="#7C5CFF" onChange={setPrimary} />
          <ColorSwatch label="Accent" value={accent} fallback="#FFB84D" onChange={setAccent} />
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
          Adjust each color or type a hex. Leave blank to keep the default.
        </p>
      </div>

      <div>
        <Label>Corners</Label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {radiusOptions.map((r, i) => {
            const on = r.key === themeRadius;
            const tint = CORNER_TINTS[i % CORNER_TINTS.length];
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setThemeRadius(r.key)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                title={r.label}
              >
                <span
                  style={{
                    width: 64,
                    height: 64,
                    background: tint,
                    borderRadius: r.preview,
                    border: on ? "3px solid var(--text)" : "3px solid transparent",
                    boxShadow: on ? "var(--glow-primary)" : "none",
                    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                  }}
                />
                <span style={{ fontSize: 12, color: on ? "var(--text)" : "var(--text-muted)" }}>
                  {r.label.replace(/\s*\(.*\)$/, "")}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A dropdown whose closed value and each option render in that option's font. */
function FontDropdown({
  options,
  value,
  onChange,
}: {
  options: FontOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value) ?? options[0];

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          ...field,
          marginBottom: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          textAlign: "left",
          color: "#fff",
        }}
      >
        <span style={{ fontFamily: current?.family, fontSize: 16, color: "#fff" }}>{current?.label}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 280,
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          }}
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                background: o.key === value ? "var(--bg-soft)" : "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontFamily: o.family,
                fontSize: 17,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A color control shown open by default: swatch + native picker + hex entry. */
function ColorSwatch({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
}) {
  const shown = /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: 12,
        width: 168,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{ width: 40, height: 40, borderRadius: 10, background: shown, border: "2px solid var(--border)", flexShrink: 0 }}
          title={`${label}: ${value || "default"}`}
        />
        <span style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{label}</span>
      </div>
      <input
        type="color"
        value={shown}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", height: 40, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fallback}
        style={{ ...field, marginBottom: 0, color: "#fff", fontFamily: "var(--font-mono)", fontSize: 13 }}
      />
      <button
        type="button"
        onClick={() => onChange("")}
        style={{ fontSize: 12, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "6px 0", cursor: "pointer" }}
      >
        Reset to default
      </button>
    </div>
  );
}

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const CORNER_TINTS = ["var(--primary)", "var(--accent)", "var(--primary-soft)"];
