// ...existing code...
import { UiTranslationCache } from "../models/UiTranslationCache";
import crypto from "crypto";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function hashSourceText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function getOrCreateTranslation({
  namespace = "clinical-demo",
  sourceLocale = "fr",
  targetLang,
  text,
}) {
  const sourceHash = hashSourceText(text);
  let cache = await UiTranslationCache.findOne({
    namespace,
    sourceLocale,
    targetLang,
    sourceHash,
  });
  if (cache) {
    return cache.payload;
  }
  // Call OpenAI for translation
  const prompt = `Traduire ce texte en ${targetLang}: ${text}`;
  const completion = await openai.chat.completions.create({
    model: "gpt-4-0613",
    messages: [
      { role: "system", content: `You are a professional medical translator.` },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 512,
  });
  const translated = completion.choices[0]?.message?.content?.trim() || "";
  // Save to DB
  cache = await UiTranslationCache.create({
    namespace,
    sourceLocale,
    targetLang,
    sourceHash,
    payload: { text: translated },
    model: "gpt-4-0613",
  });
  return cache.payload;
}
