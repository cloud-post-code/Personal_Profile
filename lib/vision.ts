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

/**
 * Read an image the way a designer would, for the card builder.
 *
 * Separate from describeImage() because the two want different things: a
 * gallery caption describes the subject for a visitor, while the card builder
 * needs to know what it could DO with the image — its subject, but also its
 * palette, orientation, where the empty space sits, and whether text laid over
 * it would survive. Asking one prompt to serve both produced captions that
 * read nicely and told the designer nothing.
 */
export async function describeImageForDesign(bytes: Buffer, ext: string): Promise<string> {
  const mediaType = MEDIA[ext.toLowerCase()] ?? "image/jpeg";
  try {
    const msg = await claude().messages.create({
      model: claudeModel(),
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: bytes.toString("base64") },
            },
            {
              type: "text",
              text:
                "You are briefing a UI designer who cannot see this image but must build a card "
                + "around it. In 3-5 sentences cover: what it shows; its dominant colors and "
                + "overall lightness; its orientation and whether the subject is centered or "
                + "off to one side; where the calm/empty areas are that text could sit over; and "
                + "any visible text or logo already in it. Describe only what you can see — no "
                + "invented names or places. Plain prose, no preamble, no bullet points.",
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
