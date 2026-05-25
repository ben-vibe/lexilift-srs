#!/usr/bin/env node
/**
 * Batch word generator that uses an LLM API to generate Oxford 3000 words.
 * 
 * Usage:
 *   OPENAI_API_KEY=your_key node scripts/batch_generate_oxford.mjs
 * 
 * This script generates words in chunks and writes them to src/data/oxford3000_seed.json
 */

import fs from "node:fs/promises";
import path from "node:path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 100);
const TOTAL_TARGET = Number(process.env.TOTAL_TARGET ?? 3000);
const OUT_FILE = process.env.OUT_FILE ?? "src/data/oxford3000_seed.json";

// Load already generated words (for resume)
async function loadExisting() {
  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), OUT_FILE), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function generateBatch(startRank, count, existingWords) {
  if (!OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY environment variable.");
  }

  // Determine CEFR range for this batch
  let cefrTarget = "A1";
  if (startRank > 2200) cefrTarget = "B2";
  else if (startRank > 1200) cefrTarget = "B1";
  else if (startRank > 500) cefrTarget = "A2";

  const prompt = `Generate exactly ${count} English words for Hebrew learners from the Oxford 3000 list.
These words must be at ${cefrTarget} level. Start at frequency rank ${startRank}.

Do NOT include any of these words: ${existingWords.slice(-300).join(", ")}.

Return ONLY a valid JSON array (no markdown, no explanations).
Each object must have these exact fields:
{
  "word": "the English word",
  "translation": "Hebrew translation (use infinitive for verbs like ללכת, לאכול)",
  "difficulty_level": "${cefrTarget}",
  "frequency_rank": number,
  "phonetic": "IPA pronunciation like /haʊs/",
  "example_sentence": "Simple English sentence using this word, max 12 words"
}

Generate ${count} unique, frequently used Oxford 3000 words.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You are an expert linguist that generates clean JSON seed data for an English-Hebrew vocabulary app. Return ONLY valid JSON arrays, no other text.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "[]";
  const jsonText = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse JSON from API response`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("API did not return an array");
  }

  // Assign correct ranks
  return parsed.map((entry, i) => ({
    word: String(entry.word).trim(),
    translation: String(entry.translation).trim(),
    difficulty_level: cefrTarget,
    frequency_rank: startRank + i,
    phonetic: String(entry.phonetic || "").trim(),
    example_sentence: String(entry.example_sentence || "").trim(),
  }));
}

async function main() {
  const existing = await loadExisting();
  const seen = new Set(existing.map((w) => w.word.toLowerCase()));
  let results = [...existing];

  while (results.length < TOTAL_TARGET) {
    const startRank = results.length + 1;
    const count = Math.min(BATCH_SIZE, TOTAL_TARGET - results.length);

    console.log(`⏳ Generating batch ${results.length + 1}-${results.length + count}...`);

    try {
      const batch = await generateBatch(startRank, count, results.map((w) => w.word));

      for (const entry of batch) {
        if (seen.has(entry.word.toLowerCase())) continue;
        seen.add(entry.word.toLowerCase());
        results.push(entry);
      }

      // Save checkpoint after each batch
      await fs.writeFile(
        path.resolve(process.cwd(), OUT_FILE),
        `${JSON.stringify(results, null, 2)}\n`,
        "utf-8"
      );

      console.log(`✅ Saved ${results.length}/${TOTAL_TARGET} words`);
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      console.log("⏸️ Retrying in 5 seconds...");
      await new Promise((r) => setTimeout(r, 5000));
    }

    // Rate limit: wait 1 second between batches
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Final sort and save
  results.sort((a, b) => a.frequency_rank - b.frequency_rank);
  await fs.writeFile(
    path.resolve(process.cwd(), OUT_FILE),
    `${JSON.stringify(results, null, 2)}\n`,
    "utf-8"
  );

  console.log(`\n🎉 Generated ${results.length} Oxford 3000 words!`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
