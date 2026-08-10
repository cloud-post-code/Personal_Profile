import * as cheerio from "cheerio";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, claudeModel } from "./claude";

/**
 * Unified extraction for the three source types the admin can add:
 *   - link:  fetch a URL, extract clean text + metadata
 *   - pdf:   parse an uploaded PDF's text
 *   - text:  pasted text / markdown
 * In every case Claude produces a short summary + tags, which becomes part of
 * the chatbot's knowledge.
 *
 * Note: some sites (LinkedIn especially) gate content behind login, so a link
 * fetch may return little. We degrade gracefully and let the admin paste text.
 */

export type ExtractResult = {
  title: string | null;
  rawText: string;
  imageUrl: string | null;
  summary: string;
  tags: string[];
  kind: string;
};

function classifyKind(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("github.com")) return "project";
  if (u.includes("medium.com") || u.includes("substack.com") || u.includes("/blog")) {
    return "article";
  }
  return "other";
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function extractHtml(html: string): {
  title: string | null;
  text: string;
  imageUrl: string | null;
} {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, form, iframe").remove();

  const title =
    $('meta[property="og:title"]').attr("content") || $("title").first().text() || null;
  const imageUrl =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    null;

  const scope = $("article").text() || $("main").text() || $("body").text();
  const text = scope.replace(/\s+/g, " ").trim().slice(0, 12000);
  return { title: title?.trim() || null, text, imageUrl: imageUrl || null };
}

const EMPTY_SOURCE_SUMMARY =
  "Could not extract meaningful content automatically (the source may be " +
  "empty, an image-only PDF, or a login-gated page). Add a summary manually " +
  "so the chatbot can use it.";

/**
 * Ask Claude for a summary + tags from any extracted text.
 *
 * `origin` decides how little content counts as a failure. A *scraped* source
 * that comes back near-empty means the fetch or parse fell over, so we hand the
 * admin the write-it-yourself message. *Authored* text was typed straight into
 * the form, so there is no extraction to fail — a one-line note ("I play magic
 * in my free time") is real content and gets summarised like anything else.
 */
async function summarize(
  label: string,
  title: string | null,
  text: string,
  origin: "scraped" | "authored" = "scraped",
): Promise<{ summary: string; tags: string[] }> {
  const clean = text.trim();
  if (clean.length < (origin === "authored" ? 1 : 40)) {
    return { summary: EMPTY_SOURCE_SUMMARY, tags: [] };
  }

  const prompt =
    `You are helping build a personal-website chatbot for Blake. Summarize the ` +
    `following source so the chatbot can reference it when talking about Blake's ` +
    `work, background, and views. Return STRICT JSON with keys "summary" (2-5 ` +
    `sentences, written so the chatbot can quote it naturally in the first person ` +
    `where appropriate) and "tags" (an array of 3-6 short lowercase topic tags). ` +
    `If the source is only a line or two, keep the summary to a single faithful ` +
    `sentence and invent nothing that is not in the source. ` +
    `No prose outside the JSON.\n\n` +
    `SOURCE: ${label}\nTitle: ${title ?? "(none)"}\n\nCONTENT:\n${clean.slice(0, 12000)}`;

  const msg = await claude().messages.create({
    model: claudeModel(),
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return {
      summary: String(json.summary ?? "").trim(),
      tags: Array.isArray(json.tags) ? json.tags.map(String).slice(0, 6) : [],
    };
  } catch {
    return { summary: raw.trim().slice(0, 700), tags: [] };
  }
}

/** Extract a link source. */
export async function extractLink(url: string): Promise<ExtractResult> {
  const kind = classifyKind(url);
  let title: string | null = null;
  let text = "";
  let imageUrl: string | null = null;

  try {
    const html = await fetchPage(url);
    const ex = extractHtml(html);
    title = ex.title;
    text = ex.text;
    imageUrl = ex.imageUrl;
  } catch {
    text = "";
  }

  const { summary, tags } = await summarize(url, title, text);
  return { title, rawText: text, imageUrl, summary, tags, kind };
}

/**
 * Pull plain text out of a PDF's bytes.
 *
 * IMPORTANT: import `pdf-parse/lib/pdf-parse.js` directly. The package's index
 * (`pdf-parse`) runs debug code at import that tries to read a bundled test PDF
 * and throws ENOENT in production — which is why PDF extraction silently failed.
 * The lib entry skips that harness.
 */
async function pdfToText(bytes: Buffer): Promise<{ text: string; title: string | null }> {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const data = await pdfParse(bytes);
  const text = (data.text || "").replace(/\s+/g, " ").trim();
  const title = data.info?.Title ? String(data.info.Title) : null;
  return { text, title };
}

/** Pull plain text out of a .docx (Word) file's bytes via mammoth. */
async function docxToText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: bytes });
  return (value || "").replace(/\s+/g, " ").trim();
}

/** True for filenames we know how to read as a Word document. */
function isDocx(filename: string): boolean {
  return /\.docx$/i.test(filename);
}

/**
 * Extract plain text from an uploaded document (PDF, DOCX, or plain text/CSV/MD)
 * by sniffing the filename. Returns text plus an optional title. Used by both
 * the Knowledge ingest and the Bio-from-file flow so they accept the same set
 * of formats. Throws if the parser itself fails, so callers can report the real
 * error instead of a misleading "empty content" message.
 */
export async function fileToText(
  bytes: Buffer,
  filename: string,
): Promise<{ text: string; title: string | null }> {
  if (/\.pdf$/i.test(filename)) {
    const { text, title } = await pdfToText(bytes);
    return { text: text.slice(0, 12000), title: title ?? filename.replace(/\.pdf$/i, "") };
  }
  if (isDocx(filename)) {
    const text = await docxToText(bytes);
    return { text: text.slice(0, 12000), title: filename.replace(/\.docx$/i, "") };
  }
  // csv / txt / md / anything else: treat the bytes as UTF-8 text.
  const text = bytes.toString("utf8").replace(/\r/g, "").trim().slice(0, 12000);
  return { text, title: filename.replace(/\.[^.]+$/, "") };
}

/** Extract a document source (PDF or DOCX) from its bytes. */
export async function extractDocument(
  bytes: Buffer,
  filename: string,
): Promise<ExtractResult> {
  let text = "";
  let title: string | null = filename.replace(/\.[^.]+$/, "");
  let parseError: string | null = null;
  try {
    const r = await fileToText(bytes, filename);
    text = r.text;
    if (r.title) title = r.title;
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
  }

  // If the parser failed outright, tell the admin what actually happened.
  if (parseError && !text) {
    return {
      title,
      rawText: "",
      imageUrl: null,
      summary:
        `Couldn't read this file automatically (${parseError}). It may be a ` +
        `scanned/image-only PDF or an unsupported format. Add a summary manually.`,
      tags: [],
      kind: "resume",
    };
  }

  const label = isDocx(filename) ? `DOC: ${filename}` : `PDF: ${filename}`;
  const { summary, tags } = await summarize(label, title, text);
  return { title, rawText: text, imageUrl: null, summary, tags, kind: "resume" };
}

export type ResumeParse = {
  bio: string;
  experience: { role: string; company: string; dates: string; description: string }[];
  experienceSummary: string;
  other: string;
  name: string;
  location: string;
  email: string;
  socials: { label: string; url: string }[];
};

/**
 * Parse a whole resume in ONE Claude call and split it into every destination
 * the Profile tab has: a bio, structured experience entries, an "everything
 * else" block, and contact fields (name / location / email / socials). Fields
 * come back "" / [] when the resume doesn't mention them, so the caller can
 * fill only what's present.
 */
export async function writeProfileFromResume(raw: string): Promise<ResumeParse> {
  const empty: ResumeParse = {
    bio: "",
    experience: [],
    experienceSummary: "",
    other: "",
    name: "",
    location: "",
    email: "",
    socials: [],
  };
  const clean = raw.replace(/\r/g, "").trim().slice(0, 14000);
  if (clean.length < 10) return empty;

  const prompt =
    `The following is a person's resume (extracted text — may be messy or ` +
    `multi-column). Split it into a single STRICT JSON object with exactly ` +
    `these keys:\n` +
    `- "name": their full name (or "").\n` +
    `- "location": city/region (or "").\n` +
    `- "email": their email (or "").\n` +
    `- "socials": array of {label, url} for any LinkedIn/GitHub/Twitter/site ` +
    `links found (or []).\n` +
    `- "bio": a warm first-person professional summary, 2 short paragraphs, ` +
    `only facts present (or "").\n` +
    `- "experience": array of roles, each {role, company, dates, description} ` +
    `(1-2 sentence description), most recent first (or []).\n` +
    `- "experienceSummary": ONE first-person paragraph (3-5 sentences) ` +
    `summarizing their overall work experience — the arc of their career, the ` +
    `kind of work they do, and what they're good at. Must be non-empty ` +
    `whenever any job history is present.\n` +
    `- "other": a plain-text block of EVERYTHING else — education, skills, ` +
    `certifications, awards, projects — that isn't the bio or a job (or "").\n` +
    `Use only facts present. Return ONLY the JSON object, no prose or fences.\n\n${clean}`;

  const msg = await claude().messages.create({
    model: claudeModel(),
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }],
  });
  const rawOut = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const obj = JSON.parse(rawOut.slice(rawOut.indexOf("{"), rawOut.lastIndexOf("}") + 1));
    const experience = Array.isArray(obj?.experience)
      ? obj.experience
          .map((x: Record<string, unknown>) => ({
            role: String(x?.role ?? "").trim(),
            company: String(x?.company ?? "").trim(),
            dates: String(x?.dates ?? "").trim(),
            description: String(x?.description ?? "").trim(),
          }))
          .filter((x: { role: string; company: string; description: string }) => x.role || x.company || x.description)
      : [];
    const socials = Array.isArray(obj?.socials)
      ? obj.socials
          .map((s: Record<string, unknown>) => ({
            label: String(s?.label ?? "").trim(),
            url: String(s?.url ?? "").trim(),
          }))
          .filter((s: { label: string; url: string }) => s.label && s.url)
      : [];
    // Guarantee the overview paragraph whenever roles exist — if the model
    // skipped it, stitch one from the parsed cards so the field is never blank.
    const summary =
      String(obj?.experienceSummary ?? "").trim() ||
      (experience.length
        ? experience
            .map((x: { role: string; company: string; dates: string }) =>
              [x.role, x.company && `at ${x.company}`, x.dates && `(${x.dates})`]
                .filter(Boolean)
                .join(" "),
            )
            .join(". ") + "."
        : "");

    return {
      bio: String(obj?.bio ?? "").trim(),
      experience,
      experienceSummary: summary,
      other: String(obj?.other ?? "").trim(),
      name: String(obj?.name ?? "").trim(),
      location: String(obj?.location ?? "").trim(),
      email: String(obj?.email ?? "").trim(),
      socials,
    };
  } catch {
    return empty;
  }
}

/**
 * Extract a pasted text / markdown source. The text is authored, not scraped,
 * so it is never rejected for being short, and if the model comes back with
 * nothing usable we fall back to the pasted text itself rather than saving a
 * blank summary.
 */
export async function extractText(
  text: string,
  title: string | null,
): Promise<ExtractResult> {
  const clean = text.trim().slice(0, 12000);
  const { summary, tags } = await summarize("Pasted text", title, clean, "authored");
  return {
    title: title || clean.split("\n")[0].trim().slice(0, 60) || "Note",
    rawText: clean,
    imageUrl: null,
    summary: summary || clean.slice(0, 700),
    tags,
    kind: "note",
  };
}
