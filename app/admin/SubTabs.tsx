"use client";

import React, { useState } from "react";

/**
 * Horizontal tab strip across the top of a dashboard section. Same contract
 * as Tabs, but rendered as a bar above the panel instead of a side menu —
 * used for the Content section's Projects / Knowledge / Photos split and the
 * Graph section's Graph / Test / Entities / Relationships / Overviews split.
 * Labels may be nodes so a tab can carry a count badge. `trailing` renders
 * inside the strip alongside the tabs (e.g. a "new source" link) so it sits
 * on the same wrapping row as the tabs — before the tabs when
 * `trailingFirst` is set, otherwise after the last tab.
 */
export function SubTabs({
  tabs,
  initial,
  ariaLabel = "Content sections",
  trailing,
  trailingFirst = false,
}: {
  tabs: { key: string; label: React.ReactNode; content: React.ReactNode }[];
  initial?: string;
  ariaLabel?: string;
  trailing?: React.ReactNode;
  trailingFirst?: boolean;
}) {
  const [active, setActive] = useState(
    tabs.some((t) => t.key === initial) ? initial : tabs[0]?.key,
  );
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div className="admin-subtabs" role="tablist" aria-label={ariaLabel}>
        {trailingFirst && trailing != null ? (
          <React.Fragment key="trailing">{trailing}</React.Fragment>
        ) : null}
        {tabs.map((t) => {
          const on = t.key === current?.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              className="admin-subtab"
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          );
        })}
        {!trailingFirst && trailing != null ? (
          <React.Fragment key="trailing">{trailing}</React.Fragment>
        ) : null}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
