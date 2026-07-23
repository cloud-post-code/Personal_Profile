import type Anthropic from "@anthropic-ai/sdk";
import { claude, claudeModel } from "./claude";

/**
 * Uses Claude vision to write a one-paragraph description of an uploaded photo.
 * Returns "" on any failure so the upload still succeeds and the admin can
 * write the description manually.
 */

const MEDIA: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function describeImage(
  bytes: Buffer,
  ext: string,
): Promise<string> {
  const mediaType = MEDIA[ext.toLowerCase()] ?? "image/jpeg";
  try {
    const msg = await claude().messages.create({
      model: claudeModel(),
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: bytes.toString("base64"),
              },
            },
            {
              type: "text",
              text:
                "Write ONE natural paragraph (2-4 sentences) describing this photo " +
                "for a personal website gallery. Describe what's visibly in it — " +
                "subject, setting, mood. Do not invent names, places, or facts you " +
                "can't see. Plain prose, no preamble.",
            },
          ],
        },
      ],
    });
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch {
    return "";
  }
}
