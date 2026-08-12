"use client";

import React, { useEffect, useState } from "react";

/**
 * Sealed renderer for a source's custom page code — the admin-panel sibling
 * of the coded-card iframe (app/cards/Cards.tsx). The markup was validated
 * by safeCardHtml at save, and this sandbox is the second wall: a CSP of
 * default-src 'none' (inline styles and same-origin/data images only) and a
 * sandbox with no scripts, so stored page code can never execute or phone
 * out even if a validator regression let something through.
 *
 * Theme variables are resolved from the live document and injected, because
 * a sandboxed iframe inherits nothing — custom pages stay on-palette when
 * the site theme changes.
 */
export function PanelHtml({ html, height = 520 }: { html: string; height?: number }) {
  const [themeCss, setThemeCss] = useState("");
  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    const names = [
      "--bg", "--bg-soft", "--surface", "--border", "--text",
      "--primary", "--accent", "--on-primary", "--on-accent",
      "--on-surface", "--on-bg-soft",
      "--accent-on-bg", "--accent-on-bg-soft", "--accent-on-surface",
      "--font-heading", "--heading-weight",
      "--radius-sm", "--radius-md", "--radius-lg", "--radius-pill",
    ];
    const vars = names.map((n) => `${n}:${root.getPropertyValue(n)};`).join("");
    const font = getComputedStyle(document.body).fontFamily;
    setThemeCss(
      `:root{${vars}}` +
        `body{margin:0;background:transparent;color:var(--on-surface);font-family:${font};font-size:14px;line-height:1.55;}` +
        `h1,h2,h3,h4{font-family:var(--font-heading),${font};font-weight:var(--heading-weight,700);margin:0 0 8px;}` +
        `a{color:var(--accent-on-surface);}` +
        `img{max-width:100%;}`,
    );
  }, []);

  const doc =
    `<!doctype html><html><head>` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: 'self';">` +
    `<style>${themeCss}</style></head><body>${html}</body></html>`;

  return (
    <iframe
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      title="Custom ingestion page"
      style={{
        width: "100%",
        height,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "transparent",
        display: "block",
        marginBottom: 14,
      }}
    />
  );
}
