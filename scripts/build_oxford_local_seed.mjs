#!/usr/bin/env node
/**
 * Builds src/data/oxford3000_seed.json locally (no Supabase).
 * - Word list: Oxford 3000 (ittuann txt)
 * - CEFR + IPA + examples: winterdl/oxford-5000 JSON when available
 * - Hebrew: existing oxford3000_seed.json + seed_words.json, else placeholder
 *
 * Usage: node scripts/build_oxford_local_seed.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src/data/oxford3000_seed.json");
const OXFORD_3000_URL =
  "https://raw.githubusercontent.com/ittuann/The-Oxford-5000-Word-Lists/main/The%20Oxford%203000.txt";
const OXFORD_5000_URL =
  "https://raw.githubusercontent.com/ittuann/The-Oxford-5000-Word-Lists/main/The%20Oxford%205000.txt";
const OXFORD_META_3000_URL =
  "https://raw.githubusercontent.com/winterdl/oxford-5000-vocabulary-audio-definition/master/data/oxford_3000.json";
const OXFORD_META_5000_URL =
  "https://raw.githubusercontent.com/winterdl/oxford-5000-vocabulary-audio-definition/master/data/oxford_5000.json";
const GILI_LEXICON_URL =
  "https://huggingface.co/datasets/GiliGold/Hebrew_VAD_lexicon/resolve/main/english_hebrew_enriched_final_lexicon.csv";

const PLACEHOLDER_HE = "תרגום יתווסף";
const ADD_OXFORD_5000_EXTRA = process.env.ADD_OXFORD_5000 !== "0";

const CEFR_ORDER = { a1: 0, a2: 1, b1: 2, b2: 3, c1: 4, c2: 5 };

function toLevel(raw) {
  const key = String(raw ?? "b1").toLowerCase();
  if (key === "a1" || key === "a2" || key === "b1" || key === "b2") {
    return key.toUpperCase();
  }
  return rankToLevel(1500);
}

function rankToLevel(rank) {
  if (rank <= 500) return "A1";
  if (rank <= 1200) return "A2";
  if (rank <= 2200) return "B1";
  return "B2";
}

function cleanIpa(raw) {
  if (!raw) return "/.../";
  return String(raw).replace(/\\/g, "");
}

function shortExample(text, word) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return `I use the word ${word} every day.`;
  const first = s.split(/[,;]/)[0].trim();
  return first.length > 90 ? `${first.slice(0, 87)}...` : first;
}

async function loadJson(relPath) {
  const raw = await fs.readFile(path.join(ROOT, relPath), "utf-8");
  return JSON.parse(raw);
}

async function loadTranslationBank() {
  const bank = new Map();
  const sources = [
    await loadJson("src/data/oxford3000_seed.json"),
    await loadJson("src/data/seed_words.json"),
  ];

  for (const list of sources) {
    for (const entry of list) {
      const key = String(entry.word).toLowerCase();
      if (!bank.has(key) && entry.translation && entry.translation !== PLACEHOLDER_HE) {
        bank.set(key, entry);
      }
    }
  }
  return bank;
}

/** ~13k English→Hebrew pairs (open dataset, not Oxford-specific). */
async function loadGiliGoldBank() {
  const res = await fetch(GILI_LEXICON_URL);
  if (!res.ok) throw new Error(`GiliGold lexicon fetch failed: ${res.status}`);
  const text = await res.text();
  const bank = new Map();

  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    const eng = parts[0]?.trim().toLowerCase();
    const he = parts[4]?.trim();
    if (!eng || !he || he === "NOT VALID") continue;
    if (!bank.has(eng)) {
      bank.set(eng, { translation: he });
    }
  }
  return bank;
}

async function loadOxfordMeta(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta fetch failed: ${res.status}`);
  const data = await res.json();
  const byWord = new Map();

  for (const item of Object.values(data)) {
    const word = String(item.word ?? "").toLowerCase().trim();
    if (!word) continue;
    const cefr = String(item.cefr ?? "").toLowerCase();
    const existing = byWord.get(word);
    if (!existing || (CEFR_ORDER[cefr] ?? 9) < (CEFR_ORDER[existing.cefr] ?? 9)) {
      byWord.set(word, {
        cefr,
        phonetic: cleanIpa(item.phon_br || item.phon_n_am),
        example: item.example,
      });
    }
  }
  return byWord;
}

async function fetchWordList(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Word list fetch failed: ${res.status}`);
  const text = await res.text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function loadWordList() {
  const ox3000 = await fetchWordList(OXFORD_3000_URL);
  if (!ADD_OXFORD_5000_EXTRA) return ox3000;

  const ox5000 = await fetchWordList(OXFORD_5000_URL);
  const seen = new Set(ox3000.map((w) => w.toLowerCase()));
  const extra = ox5000.filter((w) => !seen.has(w.toLowerCase()));
  console.log(`   +${extra.length} Oxford 5000 words (not in 3000 list)`);
  return [...ox3000, ...extra];
}

function resolveTranslation(key, bank, gili, metaRow, word) {
  const known = bank.get(key);
  if (known?.translation) return known.translation;
  const fromGili = gili.get(key)?.translation;
  if (fromGili) return fromGili;
  return PLACEHOLDER_HE;
}

async function main() {
  console.log("📥 Loading word lists and translation sources...");
  const [words, meta3000, meta5000, bank, gili] = await Promise.all([
    loadWordList(),
    loadOxfordMeta(OXFORD_META_3000_URL),
    ADD_OXFORD_5000_EXTRA ? loadOxfordMeta(OXFORD_META_5000_URL) : Promise.resolve(new Map()),
    loadTranslationBank(),
    loadGiliGoldBank(),
  ]);

  const meta = new Map([...meta3000, ...meta5000]);

  console.log(`   ${words.length} words total`);
  console.log(`   ${bank.size} curated Hebrew entries (seed files)`);
  console.log(`   ${gili.size} GiliGold EN→HE pairs`);

  const seen = new Set();
  const output = [];
  let withHebrew = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const rank = output.length + 1;
    const metaRow = meta.get(key);
    const known = bank.get(key);
    const translation = resolveTranslation(key, bank, gili, metaRow, word);

    const difficulty_level = metaRow
      ? toLevel(metaRow.cefr)
      : known?.difficulty_level ?? rankToLevel(Math.min(rank, 3000));

    if (translation !== PLACEHOLDER_HE) withHebrew += 1;

    output.push({
      word,
      translation,
      difficulty_level: rank > 3000 ? "B2" : difficulty_level,
      frequency_rank: rank,
      phonetic: known?.phonetic ?? metaRow?.phonetic ?? "/.../",
      example_sentence: known?.example_sentence
        ? known.example_sentence
        : shortExample(metaRow?.example, word),
    });
  }

  await fs.writeFile(OUT, `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  const placeholderCount = output.filter((w) => w.translation === PLACEHOLDER_HE).length;
  console.log(`\n✅ Wrote ${output.length} words → ${OUT}`);
  console.log(`   עם תרגום עברי: ${withHebrew}`);
  console.log(`   ממתינים לתרגום (${PLACEHOLDER_HE}): ${placeholderCount}`);
  console.log("\nהרץ: npm run build  (או npm run dev) כדי לטעון באפליקציה.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
