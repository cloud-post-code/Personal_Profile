import {
  Space_Grotesk,
  Inter,
  Poppins,
  Sora,
  DM_Sans,
  Playfair_Display,
} from "next/font/google";

/**
 * Curated heading fonts the admin can choose from. Each is loaded via
 * next/font (self-hosted, commercial-safe). The chosen key is stored on
 * Profile.themeFont and applied as the --font-heading CSS variable.
 *
 * Body stays Inter for readability; only the display/heading font swaps.
 */

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const poppins = Poppins({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const sora = Sora({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const interDisplay = Inter({ subsets: ["latin"], display: "swap", weight: ["600", "800"] });

export type FontKey =
  | "space-grotesk"
  | "poppins"
  | "sora"
  | "dm-sans"
  | "playfair"
  | "inter";

export const HEADING_FONTS: Record<FontKey, { label: string; family: string }> = {
  "space-grotesk": { label: "Space Grotesk (default)", family: spaceGrotesk.style.fontFamily },
  poppins: { label: "Poppins", family: poppins.style.fontFamily },
  sora: { label: "Sora", family: sora.style.fontFamily },
  "dm-sans": { label: "DM Sans", family: dmSans.style.fontFamily },
  playfair: { label: "Playfair Display", family: playfair.style.fontFamily },
  inter: { label: "Inter", family: interDisplay.style.fontFamily },
};

export function headingFamily(key: string): string {
  return (HEADING_FONTS[key as FontKey] ?? HEADING_FONTS["space-grotesk"]).family;
}

/** Body font uses the same curated families; default is Inter. */
export function bodyFamily(key: string): string {
  return (HEADING_FONTS[key as FontKey] ?? HEADING_FONTS["inter"]).family;
}

export const FONT_OPTIONS = Object.entries(HEADING_FONTS).map(([key, v]) => ({
  key,
  label: v.label,
}));

// Body font list with Inter as the labeled default.
export const BODY_FONT_OPTIONS = FONT_OPTIONS.map((f) =>
  f.key === "inter" ? { ...f, label: "Inter (default)" } : f,
);
