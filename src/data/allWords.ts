// Primary source: Oxford 3000 seed (grows as you generate more words)
// Falls back to the built-in seed_words.json for demo mode
import oxfordSeed from "./oxford3000_seed.json";
import fallbackSeed from "./seed_words.json";

export type DifficultyLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type Category = "Tech" | "Business" | "Travel" | "Daily Life";

export type SeedWord = {
  word: string;
  translation: string;
  difficulty_level: DifficultyLevel;
  frequency_rank: number;
  phonetic: string;
  example_sentence: string;
  category?: Category;
};

export const CATEGORIES: Category[] = ["Tech", "Business", "Travel", "Daily Life"];

export function getWordCategory(word: string): Category {
  const lower = word.toLowerCase();
  if (
    lower.includes("tech") || lower.includes("program") || lower.includes("web") ||
    lower.includes("online") || lower.includes("screen") || lower.includes("digital") ||
    lower.includes("data") || lower.includes("system") || lower.includes("optimize") ||
    lower.includes("science") || lower.includes("device") || lower.includes("network") ||
    lower.includes("code") || lower.includes("software") || lower.includes("machine") ||
    lower.includes("innovate") || lower.includes("dynamic") || lower.includes("simulate")
  ) {
    return "Tech";
  }
  if (
    lower.includes("money") || lower.includes("business") || lower.includes("office") ||
    lower.includes("career") || lower.includes("company") || lower.includes("market") ||
    lower.includes("economy") || lower.includes("revenue") || lower.includes("finance") ||
    lower.includes("salary") || lower.includes("tax") || lower.includes("price") ||
    lower.includes("pay") || lower.includes("work") || lower.includes("meeting") ||
    lower.includes("negotiate") || lower.includes("contract") || lower.includes("trade") ||
    lower.includes("budget") || lower.includes("fund") || lower.includes("yield")
  ) {
    return "Business";
  }
  if (
    lower.includes("travel") || lower.includes("visit") || lower.includes("city") ||
    lower.includes("island") || lower.includes("hotel") || lower.includes("mountain") ||
    lower.includes("river") || lower.includes("map") || lower.includes("flight") ||
    lower.includes("tour") || lower.includes("passport") || lower.includes("beach") ||
    lower.includes("trip") || lower.includes("journey") || lower.includes("train") ||
    lower.includes("road") || lower.includes("car") || lower.includes("walk") ||
    lower.includes("drive") || lower.includes("explore") || lower.includes("park")
  ) {
    return "Travel";
  }
  return "Daily Life";
}

// Merge Oxford seed + fallback; Oxford entries win on duplicate keys (better ranks / CEFR).
const rawSources = [...(oxfordSeed as SeedWord[]), ...(fallbackSeed as SeedWord[])];

const seen = new Set<string>();
export const ALL_WORDS: SeedWord[] = [];

for (const w of rawSources) {
  const key = w.word.toLowerCase();
  if (!seen.has(key)) {
    seen.add(key);
    ALL_WORDS.push({
      ...w,
      category: w.category || getWordCategory(w.word),
    });
  }
}

// Sort by frequency rank for display purposes
ALL_WORDS.sort((a, b) => a.frequency_rank - b.frequency_rank);

// Group words by difficulty level
export const WORDS_BY_LEVEL: Record<DifficultyLevel, SeedWord[]> = {
  A1: ALL_WORDS.filter((w) => w.difficulty_level === "A1"),
  A2: ALL_WORDS.filter((w) => w.difficulty_level === "A2"),
  B1: ALL_WORDS.filter((w) => w.difficulty_level === "B1"),
  B2: ALL_WORDS.filter((w) => w.difficulty_level === "B2"),
  C1: ALL_WORDS.filter((w) => w.difficulty_level === "C1"),
  C2: ALL_WORDS.filter((w) => w.difficulty_level === "C2"),
};

export const DIFFICULTY_LEVELS: DifficultyLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function getLevelColor(level: DifficultyLevel): string {
  const colors: Record<DifficultyLevel, string> = {
    A1: "bg-emerald-100 text-emerald-800",
    A2: "bg-green-100 text-green-800",
    B1: "bg-yellow-100 text-yellow-800",
    B2: "bg-orange-100 text-orange-800",
    C1: "bg-red-100 text-red-800",
    C2: "bg-purple-100 text-purple-800",
  };
  return colors[level];
}

export function getLevelEmoji(level: DifficultyLevel): string {
  const emojis: Record<DifficultyLevel, string> = {
    A1: "🌱",
    A2: "🌿",
    B1: "🌳",
    B2: "🏔️",
    C1: "🎓",
    C2: "👑",
  };
  return emojis[level];
}

/**
 * Fisher-Yates shuffle — randomizes array order in-place (returns new array).
 * This is used to shuffle the study queue so cards appear in random order,
 * NOT sorted alphabetically or by frequency rank.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
