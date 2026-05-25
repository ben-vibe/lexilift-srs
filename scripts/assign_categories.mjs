#!/usr/bin/env node
/**
 * Assigns categories into seed JSON (same rules as src/lib/wordCategory.ts).
 * Usage: node scripts/assign_categories.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getWordCategory } from "../src/lib/wordCategory.ts";

const ROOT = process.cwd();
const FILES = ["src/data/oxford3000_seed.json", "src/data/seed_words.json"];

async function assignFile(relPath) {
  const full = path.join(ROOT, relPath);
  const words = JSON.parse(await fs.readFile(full, "utf-8"));
  const counts = { Tech: 0, Business: 0, Travel: 0, "Daily Life": 0 };

  for (const entry of words) {
    entry.category = getWordCategory(entry.word, entry.example_sentence);
    counts[entry.category] += 1;
  }

  await fs.writeFile(full, `${JSON.stringify(words, null, 2)}\n`, "utf-8");
  console.log(`✅ ${relPath}`, counts);
}

for (const file of FILES) {
  await assignFile(file);
}
