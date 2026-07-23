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

/** Ask Claude for a summary + tags from any extracted text. */
async function summarize(
  label: string,
  title: string | null,
  text: string,
): Promise<{ summary: string; tags: string[] }> {
  if (text.trim().length < 40) {
    return {
      summary:
        "Could not extract meaningful content automatically (the source may be " +
        "empty, an image-only PDF, or a login-gated page). Add a summary manually " +
        "so the chatbot can use it.",
      tags: [],
    };
  }

  const prompt =
    `You are helping build a personal-website chatbot for Blake. Summarize the ` +
    `following source so the chatbot can reference it when talking about Blake's ` +
    `work, background, and views. Return STRICT JSON with keys "summary" (2-5 ` +
    `sentences, written so the chatbot can quote it naturally in the first person ` +
    `where appropriate) and "tags" (an array of 3-6 short lowercase topic tags). ` +
    `No prose outside the JSON.\n\n` +
    `SOURCE: ${label}\nTitle: ${title ?? "(none)"}\n\nCONTENT:\n${text.slice(0, 12000)}`;

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

/** Extract a PDF source from its bytes. */
export async function extractPdf(
  bytes: Buffer,
  filename: string,
): Promise<ExtractResult> {
  let text = "";
  let title: string | null = filename.replace(/\.pdf$/i, "");
  try {
    // pdf-parse is CJS; import lazily so it doesn't run at module load.
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(bytes);
    text = (data.text || "").replace(/\s+/g, " ").trim().slice(0, 12000);
    if (data.info?.Title) title = String(data.info.Title);
  } catch (e) {
    text = "";
  }
  const { summary, tags } = await summarize(`PDF: ${filename}`, title, text);
  return { title, rawText: text, imageUrl: null, summary, tags, kind: "resume" };
}

/**
 * Turn uploaded raw material (CSV rows, a text/markdown dump) into a polished
 * first-person bio for the site. Used by the Bio section's file upload.
 */
export async function writeBioFromText(raw: string): Promise<string> {
  const clean = raw.replace(/\r/g, "").trim().slice(0, 12000);
  if (clean.length < 10) return "";

  const prompt =
    `The following is raw material about Blake (it may be CSV rows, notes, or ` +
    `a resume dump). Write a warm, first-person bio for his personal website — ` +
    `2 short paragraphs, natural and specific, no buzzwords, only using facts ` +
    `present in the material. Return ONLY the bio prose, no preamble.\n\n${clean}`;

  const msg = await claude().messages.create({
    model: claudeModel(),
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Extract a pasted text / markdown source. */
export async function extractText(
  text: string,
  title: string | null,
): Promise<ExtractResult> {
  const clean = text.trim().slice(0, 12000);
  const { summary, tags } = await summarize("Pasted text", title, clean);
  return {
    title: title || summary.slice(0, 60),
    rawText: clean,
    imageUrl: null,
    summary,
    tags,
    kind: "note",
  };
}
