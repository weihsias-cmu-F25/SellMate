import "./loadEnv.js";
import OpenAI from "openai";

/** Strip accidental prefixes like "SellMate" before sk-... */
export function normalizeOpenAIKey(raw?: string | null): string | undefined {
  const key = raw?.trim().replace(/^["']|["']$/g, "");
  if (!key) return undefined;
  const idx = key.indexOf("sk-");
  if (idx >= 0) return key.slice(idx);
  return key;
}

export function getOpenAI(): OpenAI | null {
  const key = normalizeOpenAIKey(process.env.OPENAI_API_KEY);
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

export function hasOpenAI(): boolean {
  return Boolean(normalizeOpenAIKey(process.env.OPENAI_API_KEY));
}

export function visionModel(): string {
  return process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
}

export function textModel(): string {
  return process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini";
}
