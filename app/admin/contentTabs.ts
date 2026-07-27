/** Keys of the sub-tabs inside the combined Content section. */
export const CONTENT_TAB_KEYS = ["projects", "knowledge", "photos"] as const;
export type ContentTabKey = (typeof CONTENT_TAB_KEYS)[number];

/**
 * Deep-link resolution for the dashboard. `projects` and `knowledge` used to
 * be top-level nav keys and now live inside the Content section, so an old
 * `?tab=` link resolves to the Content entry opened on that sub-tab; every
 * other key passes through untouched.
 */
export function resolveAdminTab(tab: string | undefined): {
  nav: string | undefined;
  sub: ContentTabKey | undefined;
} {
  if (tab && (CONTENT_TAB_KEYS as readonly string[]).includes(tab)) {
    return { nav: "content", sub: tab as ContentTabKey };
  }
  return { nav: tab, sub: undefined };
}
