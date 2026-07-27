/** Keys of the sub-tabs inside the combined Content section. */
export const CONTENT_TAB_KEYS = ["projects", "knowledge", "photos"] as const;
export type ContentTabKey = (typeof CONTENT_TAB_KEYS)[number];

/** Keys of the sub-tabs inside the combined Activity section. */
export const ACTIVITY_TAB_KEYS = ["activity", "contacts"] as const;
export type ActivityTabKey = (typeof ACTIVITY_TAB_KEYS)[number];

/** Keys of the sub-tabs inside the Agent Behavior section. */
export const AGENT_TAB_KEYS = ["answers", "goals", "rules", "a2ui"] as const;
export type AgentTabKey = (typeof AGENT_TAB_KEYS)[number];

/** Keys of the sub-tabs inside the combined Me section. */
export const ME_TAB_KEYS = ["profile", "persona", "theme"] as const;
export type MeTabKey = (typeof ME_TAB_KEYS)[number];

/**
 * Deep-link resolution for the dashboard. `projects` and `knowledge` used to
 * be top-level nav keys and now live inside the Content section, `contacts`
 * now lives inside the Activity section, `answers` (shown as "Presets") now
 * lives inside the Agent Behavior section, and `persona` and `theme` now live
 * inside the Me section — so an old `?tab=` link resolves to the combined
 * entry opened on that sub-tab; every other key passes through untouched.
 */
export function resolveAdminTab(tab: string | undefined): {
  nav: string | undefined;
  sub: ContentTabKey | ActivityTabKey | AgentTabKey | MeTabKey | undefined;
} {
  if (tab && (CONTENT_TAB_KEYS as readonly string[]).includes(tab)) {
    return { nav: "content", sub: tab as ContentTabKey };
  }
  if (tab && (ACTIVITY_TAB_KEYS as readonly string[]).includes(tab)) {
    return { nav: "activity", sub: tab as ActivityTabKey };
  }
  if (tab && (AGENT_TAB_KEYS as readonly string[]).includes(tab)) {
    return { nav: "agent", sub: tab as AgentTabKey };
  }
  if (tab && (ME_TAB_KEYS as readonly string[]).includes(tab)) {
    return { nav: "profile", sub: tab as MeTabKey };
  }
  return { nav: tab, sub: undefined };
}
