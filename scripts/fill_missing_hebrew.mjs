#!/usr/bin/env node
/**
 * Fills Hebrew translations for seed entries marked "תרגום יתווסף".
 * Usage: OPENAI_API_KEY=sk-... node scripts/fill_missing_hebrew.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 25);
const SEED_FILE = process.env.SEED_FILE ?? "src/data/oxford3000_seed.json";
const PLACEHOLDER = "תרגום יתווסף";

if (!OPENAI_API_KEY) {
  console.error("❌ Set OPENAI_API_KEY");
  process.exit(1);
}

async function translateBatch(entries) {
  const wordList = entries
    .map((e) => `- ${e.word} (${e.difficulty_level}, rank ${e.frequency_rank})`)
    .join("\n");

  const prompt = `Translate these English words to Hebrew for a flashcard app.
Return ONLY a JSON array. One object per input word, same "word" field (English).

Each object:
{
  "word": "english word exactly as given",
  "translation": "Hebrew (infinitive for verbs)",
  "phonetic": "IPA like /həˈloʊ/",
  "example_sentence": "Simple English sentence, max 12 words"
}

Words:
${wordList}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Return JSON: {"entries":[...]} — precise EN→HE flashcard rows.',
        },
        { role: "user", content: `${prompt}\n\nWrap the array in {"entries": [...]}` },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "[]";
  const jsonText = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText);
  const rows = Array.isArray(parsed) ? parsed : parsed.entries;
  if (!Array.isArray(rows)) throw new Error("Expected entries array");
  return rows;
}

async function main() {
  const seedPath = path.resolve(process.cwd(), SEED_FILE);
  const raw = await fs.readFile(seedPath, "utf-8");
  const words = JSON.parse(raw);

  const byKey = new Map(words.map((w) => [w.word.toLowerCase(), w]));
  const missing = words.filter((w) => w.translation === PLACEHOLDER);

  console.log(`📖 ${words.length} total, ${missing.length} need Hebrew`);

  if (missing.length === 0) {
    console.log("✅ Nothing to fill.");
    return;
  }

  let filled = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    console.log(`⏳ Batch ${i + 1}-${i + batch.length} of ${missing.length}...`);

    try {
      const translated = await translateBatch(batch);
      for (const row of translated) {
        const key = String(row.word).toLowerCase();
        const target = byKey.get(key);
        if (!target) continue;
        target.translation = String(row.translation).trim();
        target.phonetic = String(row.phonetic || target.phonetic).trim();
        target.example_sentence = String(row.example_sentence || target.example_sentence).trim();
        filled += 1;
      }

      await fs.writeFile(seedPath, `${JSON.stringify(words, null, 2)}\n`, "utf-8");
      const left = words.filter((w) => w.translation === PLACEHOLDER).length;
      console.log(`   ✅ checkpoint — filled ${filled}, remaining ${left}`);
    } catch (err) {
      console.error(`   ❌ ${err.message}`);
      if (batch.length > 1) {
        console.log("   ↳ retrying one word at a time...");
        for (const single of batch) {
          try {
            const [row] = await translateBatch([single]);
            const key = String(row.word).toLowerCase();
            const target = byKey.get(key);
            if (target) {
              target.translation = String(row.translation).trim();
              target.phonetic = String(row.phonetic || target.phonetic).trim();
              target.example_sentence = String(row.example_sentence || target.example_sentence).trim();
              filled += 1;
            }
            await fs.writeFile(seedPath, `${JSON.stringify(words, null, 2)}\n`, "utf-8");
            await new Promise((r) => setTimeout(r, 400));
          } catch (singleErr) {
            console.error(`      skip "${single.word}": ${singleErr.message}`);
          }
        }
        continue;
      }
      console.log("   ↳ skip batch after single-word retries");
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  const left = words.filter((w) => w.translation === PLACEHOLDER).length;
  console.log(`\n🎉 Done. Filled ${filled}. Still missing: ${left}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
