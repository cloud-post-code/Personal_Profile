import * as cheerio from "cheerio";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, claudeModel } from "./claude";

/**
 * Rich link scanning: fetch a URL, extract clean text + metadata, then ask
 * Claude for a short summary and tags. Result is stored on the Link row and
 * becomes part of the chatbot's knowledge.
 *
 * Note: some sites (LinkedIn in particular) gate content behind login, so the
 * raw fetch may return little. We degrade gracefully: whatever text we get,
 * Claude summarizes; if nothing, we flag the link so the admin can paste text.
 */

export type ScrapeResult = {
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
      // A realistic UA helps a little with public pages.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    // Don't hang forever on a slow page.
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function extract(html: string): { title: string | null; text: string; imageUrl: string | null } {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, nav, footer, header, form, iframe").remove();

  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text() ||
    null;

  const imageUrl =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    null;

  // Prefer <article>/<main>; fall back to body.
  const scope = $("article").text() || $("main").text() || $("body").text();
  const text = scope.replace(/\s+/g, " ").trim().slice(0, 8000);

  return { title: title?.trim() || null, text, imageUrl: imageUrl || null };
}

async function summarize(
  url: string,
  title: string | null,
  text: string,
): Promise<{ summary: string; tags: string[] }> {
  // If we got basically nothing, don't burn a Claude call on empty content.
  if (text.length < 40) {
    return {
      summary:
        "Could not extract page content automatically (the page may require login). " +
        "Add a summary manually in the admin so the chatbot can use it.",
      tags: [],
    };
  }

  const prompt =
    `You are helping build a personal website chatbot for Blake. ` +
    `Summarize the following web page so the chatbot can reference it when ` +
    `talking about Blake's work. Return STRICT JSON with keys "summary" (2-4 ` +
    `sentences, written so the chatbot can quote it naturally) and "tags" (an ` +
    `array of 3-6 short lowercase topic tags). No prose outside the JSON.\n\n` +
    `URL: ${url}\nTitle: ${title ?? "(none)"}\n\nPAGE TEXT:\n${text}`;

  const msg = await claude().messages.create({
    model: claudeModel(),
    max_tokens: 600,
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
    // Model didn't return clean JSON — keep the text as the summary.
    return { summary: raw.trim().slice(0, 600), tags: [] };
  }
}

export async function scanLink(url: string): Promise<ScrapeResult> {
  const kind = classifyKind(url);
  let title: string | null = null;
  let text = "";
  let imageUrl: string | null = null;

  try {
    const html = await fetchPage(url);
    const ex = extract(html);
    title = ex.title;
    text = ex.text;
    imageUrl = ex.imageUrl;
  } catch (e) {
    // Fetch failed (timeout, block, 4xx). Continue — summarize will note it.
    text = "";
  }

  const { summary, tags } = await summarize(url, title, text);
  return { title, rawText: text, imageUrl, summary, tags, kind };
}
