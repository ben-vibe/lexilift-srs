export type StudyLogRating = "again" | "hard" | "good" | "easy";
export type StudyOutcome = "not_yet" | "known";

export type StudyLogEntry = {
  wordId: string;
  rating: StudyLogRating;
  outcome: StudyOutcome;
  at: string;
};

export type StudyLog = Record<string, StudyLogEntry[]>;

const MAX_LOG_DAYS = 120;

export function dayKeyFromDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function sanitizeStudyLog(raw: unknown): StudyLog {
  if (!raw || typeof raw !== "object") return {};
  const out: StudyLog = {};

  for (const [dayKey, entries] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !Array.isArray(entries)) continue;

    const cleanEntries: StudyLogEntry[] = [];
    for (const item of entries) {
      if (!item || typeof item !== "object") continue;
      const row = item as Partial<StudyLogEntry>;
      if (
        typeof row.wordId === "string" &&
        typeof row.at === "string" &&
        (row.rating === "again" || row.rating === "hard" || row.rating === "good" || row.rating === "easy") &&
        (row.outcome === "known" || row.outcome === "not_yet")
      ) {
        cleanEntries.push({
          wordId: row.wordId,
          at: row.at,
          rating: row.rating,
          outcome: row.outcome,
        });
      }
    }

    if (cleanEntries.length > 0) {
      out[dayKey] = cleanEntries;
    }
  }

  return pruneStudyLog(out);
}

export function logStudyReview(
  studyLog: StudyLog,
  wordId: string,
  rating: StudyLogRating,
  at = new Date(),
): StudyLog {
  const dayKey = dayKeyFromDate(at);
  const entry: StudyLogEntry = {
    wordId,
    rating,
    outcome: rating === "again" || rating === "hard" ? "not_yet" : "known",
    at: at.toISOString(),
  };

  const next: StudyLog = {
    ...studyLog,
    [dayKey]: [...(studyLog[dayKey] ?? []), entry],
  };
  return pruneStudyLog(next);
}

function pruneStudyLog(log: StudyLog): StudyLog {
  const keys = Object.keys(log).sort();
  if (keys.length <= MAX_LOG_DAYS) return log;
  const keep = new Set(keys.slice(-MAX_LOG_DAYS));
  const out: StudyLog = {};
  for (const key of keys) {
    if (keep.has(key)) out[key] = log[key];
  }
  return out;
}
