import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEED_FILE = process.env.SEED_FILE ?? "src/data/initial_words.json";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing seed data.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const filePath = path.resolve(process.cwd(), SEED_FILE);
const words = JSON.parse(await fs.readFile(filePath, "utf8"));

if (!Array.isArray(words)) {
  throw new Error(`${SEED_FILE} must contain a JSON array.`);
}

const batchSize = 250;

for (let index = 0; index < words.length; index += batchSize) {
  const batch = words.slice(index, index + batchSize);
  const { error } = await supabase
    .from("global_words")
    .upsert(batch, { onConflict: "word" });

  if (error) throw error;
  console.log(`Imported ${Math.min(index + batch.length, words.length)}/${words.length}`);
}

console.log(`Imported ${words.length} words from ${SEED_FILE}`);