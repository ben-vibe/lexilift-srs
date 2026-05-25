import fs from "node:fs/promises";
import path from "node:path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const TARGET_COUNT = Number(process.env.WORD_TARGET ?? 1000);
const CHUNK_SIZE = Number(process.env.WORD_CHUNK_SIZE ?? 50);
const OUT_FILE = process.env.WORD_OUT_FILE ?? "generated_words.json";

const fields = [
  "word",
  "translation",
  "difficulty_level",
  "frequency_rank",
  "phonetic",
  "example_sentence",
];

function validateWord(entry, expectedRank) {
  for (const field of fields) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === "") {
      throw new Error(`Missing ${field} for rank ${expectedRank}`);
    }
  }

  if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(entry.difficulty_level)) {
    throw new Error(`Invalid CEFR level for ${entry.word}`);
  }

  return {
    word: String(entry.word).trim(),
    translation: String(entry.translation).trim(),
    difficulty_level: entry.difficulty_level,
    frequency_rank: expectedRank,
    phonetic: String(entry.phonetic).trim(),
    example_sentence: String(entry.example_sentence).trim(),
  };
}

async function generateChunk(startRank, count, existingWords) {
  if (!OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY before running this script.");
  }

  const prompt = `Create ${count} common English vocabulary entries for Hebrew speakers.
Start at frequency_rank ${startRank}. Continue in practical frequency order, avoid duplicates, and do not use any of these words: ${existingWords.join(", ")}.
Return only valid JSON, an array of objects with exactly these fields: ${fields.join(", ")}.
Rules:
- translation must be Hebrew, usually the most common meaning.
- verbs should use Hebrew infinitive form when natural.
- difficulty_level must be one of A1, A2, B1, B2, C1, C2.
- phonetic should be IPA-like English pronunciation.
- example_sentence must be a simple English sentence using the word.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You generate clean JSON seed data for an English-Hebrew vocabulary app." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "[]";
  const jsonText = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText);

  if (!Array.isArray(parsed) || parsed.length !== count) {
    throw new Error(`Expected ${count} entries, got ${Array.isArray(parsed) ? parsed.length : "non-array"}`);
  }

  return parsed.map((entry, index) => validateWord(entry, startRank + index));
}

async function main() {
  const output = [];
  const existing = new Set();

  while (output.length < TARGET_COUNT) {
    const startRank = output.length + 1;
    const count = Math.min(CHUNK_SIZE, TARGET_COUNT - output.length);
    const chunk = await generateChunk(startRank, count, Array.from(existing).slice(-200));

    for (const entry of chunk) {
      const key = entry.word.toLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      output.push(entry);
    }

    console.log(`Generated ${output.length}/${TARGET_COUNT}`);
  }

  const targetPath = path.resolve(process.cwd(), OUT_FILE);
  await fs.writeFile(targetPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${output.length} words to ${targetPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});