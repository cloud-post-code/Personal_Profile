import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin wrapper around the Anthropic SDK. All Claude calls (chatbot + link
 * summarizer) go through here so the model + key are configured once.
 */

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export function claudeModel(): string {
  return process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
}
