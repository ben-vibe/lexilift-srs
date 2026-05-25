# 🚀 LexiLift SRS — Google Play Store & Oxford 3000 Setup Guide

## 📱 Google Play Store Readiness

This project is fully configured for PWA deployment to Google Play Store via:

| Feature | Status |
|---------|--------|
| Category Filtering (Tech/Business/Travel/Daily Life) | ✅ Built |
| Google Auth + Supabase Sync | ✅ Built |
| Settings (Privacy Policy, Delete Account) | ✅ Built |
| PWA Manifest & Service Worker | ✅ Built |
| Shuffle (random card order) | ✅ Built |
| Reverse Mode (HE→EN) | ✅ Built |

---

## 📚 Oxford 3000 Full Word List — How to Generate

### Option A: Automated Batch Generator (Recommended)

Run this to generate all 3,000 words automatically using OpenAI:

```bash
OPENAI_API_KEY=your_key node scripts/batch_generate_oxford.mjs
```

The script:
- Generates words in batches of 100 (configurable via `BATCH_SIZE`)
- Auto-detects CEFR level by frequency rank (A1: 1-500, A2: 501-1200, B1: 1201-2200, B2: 2201-3000)
- Resumes from where it left off (checkpoints to `oxford3000_seed.json`)
- Handles rate limits and retries automatically

### Option B: Cursor Prompt (Manual but Precise)

Copy this prompt and paste it into Cursor / ChatGPT / Claude:

```
Generate a complete JSON file of the Oxford 3000 words for an English-Hebrew vocabulary app.
Create exactly 3000 word entries. Each must have:
  - word: string
  - translation: Hebrew (infinitive for verbs like ללכת)
  - difficulty_level: "A1"|"A2"|"B1"|"B2"
  - frequency_rank: number 1-3000
  - phonetic: IPA pronunciation
  - example_sentence: Simple English sentence (max 12 words)

Rules:
1. Words must be from the official Oxford 3000 list
2. CEFR distribution: A1(~500), A2(~700), B1(~1000), B2(~800)
3. Hebrew translations use infinitive form for verbs
4. Pick the most common meaning for words with multiple definitions
5. Return valid JSON array only, no markdown wrapping
```

Save the output as `src/data/oxford3000_seed.json`.

### Option C: Download & Convert from Official Source

1. Download: [Oxford 3000 PDF (CEFR)](https://www.oxfordlearnersdictionaries.com/external/pdf/wordlists/oxford-3000-5000/The_Oxford_3000_by_CEFR_level.pdf)
2. Convert to JSON using the seed script below

---

## 🔄 Seeding Supabase with Generated Words

Once you have the `oxford3000_seed.json` file:

```bash
# Set environment variables
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Run the seed script
node scripts/seed_oxford3000.ts
```

The script:
- Reads from `src/data/oxford3000_seed.json` (or `SEED_FILE` env var)
- Deduplicates by lowercase word
- Uses `upsert` (on_conflict: word) to avoid duplicates
- Logs progress every 200 words
- Handles errors gracefully without aborting

---

## 📂 File Structure

```
src/data/
├── allWords.ts              ← Main word aggregator (Oxford 3000 + fallback)
├── oxford3000_seed.json     ← Your growing Oxford 3000 seed (150+ words, expanding)
├── seed_words.json          ← Original 583-word fallback seed
└── flutterCode.ts           ← Complete Flutter Dart conversion

scripts/
├── batch_generate_oxford.mjs ← Auto-generates Oxford 3000 via OpenAI
├── seed_oxford3000.ts        ← Seeds Supabase from oxford3000_seed.json
├── generate_word_seed.mjs    ← Legacy generator
└── import_seed_to_supabase.mjs ← Legacy importer

supabase/
└── schema.sql               ← Full DB schema with Google Auth support
```

---

## 🔑 Environment Variables

Create a `.env.local` file:

```env
# Supabase (required for cloud sync & Google Auth)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Seed import (server-side only)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI (for auto-generating Oxford 3000)
OPENAI_API_KEY=sk-your-key

# Optional: Custom LLM endpoint for Quick Add translations
VITE_LLM_ENDPOINT=https://your-api/translate
```

---

## ✅ Quick Checklist Before Publishing

- [ ] Generate full 3000-word Oxford list
- [ ] Run `node scripts/seed_oxford3000.ts` to seed Supabase
- [ ] Test Google Sign-in with real Supabase project
- [ ] Test PWA installation on Android device
- [ ] Verify Privacy Policy content is accurate
- [ ] Test Delete Account functionality
- [ ] Test category filtering for all 4 categories
- [ ] Verify reverse mode (HE→EN) works correctly
- [ ] Confirm shuffle randomizes card order
