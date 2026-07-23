import {
  Space_Grotesk,
  Inter,
  Poppins,
  Sora,
  DM_Sans,
  Playfair_Display,
  Montserrat,
  Raleway,
  Nunito,
  Work_Sans,
  Rubik,
  Manrope,
  Josefin_Sans,
  Bebas_Neue,
  Oswald,
  Lora,
  Merriweather,
  Archivo,
  Outfit,
  Quicksand,
  Comfortaa,
  Cormorant_Garamond,
  Libre_Baskerville,
  Fraunces,
  Abril_Fatface,
  Pacifico,
  Caveat,
} from "next/font/google";

/**
 * Curated font library the admin can choose from. Each is loaded via next/font
 * (self-hosted, commercial-safe). The chosen key is stored on Profile.themeFont
 * / themeBodyFont and applied as the --font-heading / --font-body CSS variable.
 *
 * next/font/google requires each family to be a static top-level import, so the
 * "full library" here is a broad curated set rather than the whole Google
 * catalog. Each font exposes its CSS family so the admin picker can render each
 * option label in its own typeface.
 */

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const poppins = Poppins({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const sora = Sora({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const interDisplay = Inter({ subsets: ["latin"], display: "swap", weight: ["600", "800"] });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const raleway = Raleway({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const nunito = Nunito({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const workSans = Work_Sans({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const rubik = Rubik({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const manrope = Manrope({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const josefin = Josefin_Sans({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const bebas = Bebas_Neue({ subsets: ["latin"], display: "swap", weight: ["400"] });
const oswald = Oswald({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const lora = Lora({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const merriweather = Merriweather({ subsets: ["latin"], display: "swap", weight: ["700"] });
const archivo = Archivo({ subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const outfit = Outfit({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const quicksand = Quicksand({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const comfortaa = Comfortaa({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const libreBaskerville = Libre_Baskerville({ subsets: ["latin"], display: "swap", weight: ["700"] });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });
const abril = Abril_Fatface({ subsets: ["latin"], display: "swap", weight: ["400"] });
const pacifico = Pacifico({ subsets: ["latin"], display: "swap", weight: ["400"] });
const caveat = Caveat({ subsets: ["latin"], display: "swap", weight: ["500", "700"] });

export type FontKey =
  | "space-grotesk"
  | "poppins"
  | "sora"
  | "dm-sans"
  | "playfair"
  | "inter"
  | "montserrat"
  | "raleway"
  | "nunito"
  | "work-sans"
  | "rubik"
  | "manrope"
  | "josefin"
  | "bebas"
  | "oswald"
  | "lora"
  | "merriweather"
  | "archivo"
  | "outfit"
  | "quicksand"
  | "comfortaa"
  | "cormorant"
  | "libre-baskerville"
  | "fraunces"
  | "abril"
  | "pacifico"
  | "caveat";

export const HEADING_FONTS: Record<FontKey, { label: string; family: string }> = {
  "space-grotesk": { label: "Space Grotesk (default)", family: spaceGrotesk.style.fontFamily },
  poppins: { label: "Poppins", family: poppins.style.fontFamily },
  sora: { label: "Sora", family: sora.style.fontFamily },
  "dm-sans": { label: "DM Sans", family: dmSans.style.fontFamily },
  playfair: { label: "Playfair Display", family: playfair.style.fontFamily },
  inter: { label: "Inter", family: interDisplay.style.fontFamily },
  montserrat: { label: "Montserrat", family: montserrat.style.fontFamily },
  raleway: { label: "Raleway", family: raleway.style.fontFamily },
  nunito: { label: "Nunito", family: nunito.style.fontFamily },
  "work-sans": { label: "Work Sans", family: workSans.style.fontFamily },
  rubik: { label: "Rubik", family: rubik.style.fontFamily },
  manrope: { label: "Manrope", family: manrope.style.fontFamily },
  josefin: { label: "Josefin Sans", family: josefin.style.fontFamily },
  bebas: { label: "Bebas Neue", family: bebas.style.fontFamily },
  oswald: { label: "Oswald", family: oswald.style.fontFamily },
  lora: { label: "Lora", family: lora.style.fontFamily },
  merriweather: { label: "Merriweather", family: merriweather.style.fontFamily },
  archivo: { label: "Archivo", family: archivo.style.fontFamily },
  outfit: { label: "Outfit", family: outfit.style.fontFamily },
  quicksand: { label: "Quicksand", family: quicksand.style.fontFamily },
  comfortaa: { label: "Comfortaa", family: comfortaa.style.fontFamily },
  cormorant: { label: "Cormorant Garamond", family: cormorant.style.fontFamily },
  "libre-baskerville": { label: "Libre Baskerville", family: libreBaskerville.style.fontFamily },
  fraunces: { label: "Fraunces", family: fraunces.style.fontFamily },
  abril: { label: "Abril Fatface", family: abril.style.fontFamily },
  pacifico: { label: "Pacifico", family: pacifico.style.fontFamily },
  caveat: { label: "Caveat", family: caveat.style.fontFamily },
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
  family: v.family,
}));

// Body font list with Inter as the labeled default.
export const BODY_FONT_OPTIONS = FONT_OPTIONS.map((f) =>
  f.key === "inter" ? { ...f, label: "Inter (default)" } : f,
);
