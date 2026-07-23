"use client";

import { useState } from "react";
import { field, Label } from "./ui";
import { COLOR_ROLES, HEADING_WEIGHTS, themeVarLines, type ThemeColors } from "@/lib/theme";

type FontOption = { key: string; label: string; family: string };
type RadiusOption = { key: string; label: string; preview: string };

/**
 * Full design-template panel for the Persona & Theme form. Everything the site
 * uses — all 7 color roles, both fonts, base size, heading weight, and corner
 * roundness — is controlled here and written to hidden inputs the savePersona
 * action stores. A live preview box mirrors the current values.
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
    themeFontSize: string;
    themeHeadingWeight: string;
    colors: ThemeColors;
  };
}) {
  const [themeFont, setThemeFont] = useState(initial.themeFont || fontOptions[0]?.key);
  const [themeBodyFont, setThemeBodyFont] = useState(initial.themeBodyFont || "inter");
  const [themeRadius, setThemeRadius] = useState(initial.themeRadius || radiusOptions[0]?.key);
  const [fontSize, setFontSize] = useState(initial.themeFontSize || "16");
  const [headingWeight, setHeadingWeight] = useState(initial.themeHeadingWeight || "700");
  const [colors, setColors] = useState<ThemeColors>(initial.colors ?? {});

  const setColor = (key: keyof ThemeColors, v: string) =>
    setColors((c) => ({ ...c, [key]: v }));

  const headingFamily = fontOptions.find((f) => f.key === themeFont)?.family;
  const bodyFamily = bodyFontOptions.find((f) => f.key === themeBodyFont)?.family;

  // CSS the live-preview box scopes to itself, mirroring the real site pipeline.
  const previewCss = themeVarLines({
    headingFamily: headingFamily ?? "inherit",
    bodyFamily: bodyFamily ?? "inherit",
    radius: themeRadius,
    fontSize,
    headingWeight,
    colors,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Hidden inputs the server action reads. */}
      <input type="hidden" name="themeFont" value={themeFont} />
      <input type="hidden" name="themeBodyFont" value={themeBodyFont} />
      <input type="hidden" name="themeRadius" value={themeRadius} />
      <input type="hidden" name="themeFontSize" value={fontSize} />
      <input type="hidden" name="themeHeadingWeight" value={headingWeight} />
      {COLOR_ROLES.map((r) => (
        <input key={r.key} type="hidden" name={`color_${r.key}`} value={colors[r.key] ?? ""} />
      ))}

      {/* ── Typography ── */}
      <div>
        <strong style={{ fontSize: 13, color: "#fff", display: "block", marginBottom: 10 }}>Typography</strong>
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
        <div style={{ ...grid2, marginTop: 10 }}>
          <div>
            <Label>Base text size — {fontSize}px</Label>
            <input
              type="range"
              min={13}
              max={20}
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <Label>Heading weight</Label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {HEADING_WEIGHTS.map((w) => {
                const on = w.key === headingWeight;
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => setHeadingWeight(w.key)}
                    style={{
                      ...field,
                      marginBottom: 0,
                      width: "auto",
                      padding: "8px 12px",
                      color: "#fff",
                      fontWeight: Number(w.key),
                      cursor: "pointer",
                      border: on ? "1px solid var(--primary)" : "1px solid var(--border)",
                      background: on ? "var(--bg-soft)" : "transparent",
                    }}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Colors (all 7 roles) ── */}
      <div>
        <strong style={{ fontSize: 13, color: "#fff", display: "block", marginBottom: 10 }}>Colors</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {COLOR_ROLES.map((r) => (
            <ColorSwatch
              key={r.key}
              label={r.label}
              value={colors[r.key] ?? ""}
              fallback={r.fallback}
              onChange={(v) => setColor(r.key, v)}
            />
          ))}
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 10 }}>
          These control every color on the site. Leave one blank to keep its default.
        </p>
      </div>

      {/* ── Corners ── */}
      <div>
        <strong style={{ fontSize: 13, color: "#fff", display: "block", marginBottom: 10 }}>Corners</strong>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {radiusOptions.map((r, i) => {
            const on = r.key === themeRadius;
            const tint = CORNER_TINTS[i % CORNER_TINTS.length];
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setThemeRadius(r.key)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer" }}
                title={r.label}
              >
                <span
                  style={{
                    width: 64,
                    height: 64,
                    background: tint,
                    borderRadius: r.preview,
                    border: on ? "3px solid var(--text)" : "3px solid transparent",
                    transition: "border-color 0.15s ease",
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

      {/* ── Live preview ── */}
      <div>
        <strong style={{ fontSize: 13, color: "#fff", display: "block", marginBottom: 10 }}>Live preview</strong>
        <div className="theme-preview" style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
          {/* Scoped CSS vars so the preview renders exactly like the live site. */}
          <style>{`.theme-preview{${previewCss}}`}</style>
          <PreviewCard />
        </div>
      </div>
    </div>
  );
}

/** A miniature of the real site, styled entirely by the scoped preview vars. */
function PreviewCard() {
  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", padding: 18, fontFamily: "var(--font-body)" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: "var(--heading-weight)" as unknown as number, fontSize: 26, letterSpacing: "-0.02em" }}>
        Hey, I&apos;m Blake. <span style={{ color: "var(--accent)" }}>Talk to me.</span>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "6px 0 14px" }}>
        Curious builder. I make things and talk about them.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: 13 }}>
          A card / bubble
        </span>
        <span style={{ background: "var(--primary)", color: "#fff", borderRadius: "var(--radius-md)", padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
          Primary button
        </span>
      </div>
      <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "var(--primary)", fontSize: 13 }}>
        A link in primary
      </a>
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
        style={{ ...field, marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left", color: "#fff" }}
      >
        <span style={{ fontFamily: current?.family, fontSize: 16, color: "#fff" }}>{current?.label}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 280, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}>
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: o.key === value ? "var(--bg-soft)" : "transparent", border: "none", color: "#fff", cursor: "pointer", fontFamily: o.family, fontSize: 17 }}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 10, width: 150 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: shown, border: "2px solid var(--border)", flexShrink: 0 }} title={`${label}: ${value || "default"}`} />
        <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, lineHeight: 1.15 }}>{label}</span>
      </div>
      <input type="color" value={shown} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", height: 34, border: "none", background: "transparent", cursor: "pointer", padding: 0 }} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={fallback} style={{ ...field, marginBottom: 0, color: "#fff", fontFamily: "var(--font-mono)", fontSize: 12, padding: "6px 8px" }} />
      <button type="button" onClick={() => onChange("")} style={{ fontSize: 11, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "5px 0", cursor: "pointer" }}>
        Reset
      </button>
    </div>
  );
}

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const CORNER_TINTS = ["var(--primary)", "var(--accent)", "var(--primary-soft)"];
