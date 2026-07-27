/** Keys of the sub-tabs inside the combined Content section. */
export const CONTENT_TAB_KEYS = ["projects", "knowledge", "photos"] as const;
export type ContentTabKey = (typeof CONTENT_TAB_KEYS)[number];

/** Keys of the sub-tabs inside the combined Activity section. */
export const ACTIVITY_TAB_KEYS = ["activity", "answers", "contacts"] as const;
export type ActivityTabKey = (typeof ACTIVITY_TAB_KEYS)[number];

/** Keys of the sub-tabs inside the combined Me section. */
export const ME_TAB_KEYS = ["profile", "persona"] as const;
export type MeTabKey = (typeof ME_TAB_KEYS)[number];

/**
 * Deep-link resolution for the dashboard. `projects` and `knowledge` used to
 * be top-level nav keys and now live inside the Content section, `answers`
 * (shown as "Preset Answers") and `contacts` now live inside the Activity
 * section, and `persona` now lives inside the Me section — so an old `?tab=`
 * link resolves to the combined entry opened on that sub-tab; every other key
 * passes through untouched.
 */
export function resolveAdminTab(tab: string | undefined): {
  nav: string | undefined;
  sub: ContentTabKey | ActivityTabKey | MeTabKey | undefined;
} {
  if (tab && (CONTENT_TAB_KEYS as readonly string[]).includes(tab)) {
    return { nav: "content", sub: tab as ContentTabKey };
  }
  if (tab && (ACTIVITY_TAB_KEYS as readonly string[]).includes(tab)) {
    return { nav: "activity", sub: tab as ActivityTabKey };
  }
  if (tab && (ME_TAB_KEYS as readonly string[]).includes(tab)) {
    return { nav: "profile", sub: tab as MeTabKey };
  }
  return { nav: tab, sub: undefined };
}
