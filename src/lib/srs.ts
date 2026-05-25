export type ReviewRating = "again" | "hard" | "good" | "easy";

export type ProgressStatus = "new" | "learning" | "mastered";

export type WordProgress = {
  status: ProgressStatus;
  ease_factor: number;
  interval: number;
  next_review: string;
  last_reviewed?: string;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const intervalMultiplier: Record<Exclude<ReviewRating, "again">, number> = {
  hard: 1.2,
  good: 2.5,
  easy: 4,
};

const easeDelta: Record<ReviewRating, number> = {
  again: -0.2,
  hard: -0.05,
  good: 0,
  easy: 0.15,
};

export function getInitialProgress(now = new Date()): WordProgress {
  return {
    status: "new",
    ease_factor: 2.5,
    interval: 0,
    next_review: now.toISOString(),
  };
}

export function getNextProgress(
  current: WordProgress | undefined,
  rating: ReviewRating,
  now = new Date(),
): WordProgress {
  const base = current ?? getInitialProgress(now);
  const nextEase = Math.max(1.3, Number((base.ease_factor + easeDelta[rating]).toFixed(2)));

  if (rating === "again") {
    return {
      ...base,
      status: "learning",
      ease_factor: nextEase,
      interval: 0,
      next_review: now.toISOString(),
      last_reviewed: now.toISOString(),
    };
  }

  const nextInterval = Math.max(1, Math.round(base.interval * intervalMultiplier[rating]));
  const nextReview = new Date(now.getTime() + nextInterval * DAY_IN_MS);

  return {
    ...base,
    status: rating === "hard" ? "learning" : "mastered",
    ease_factor: nextEase,
    interval: nextInterval,
    next_review: nextReview.toISOString(),
    last_reviewed: now.toISOString(),
  };
}

export function isDue(progress: WordProgress | undefined, now = new Date()) {
  if (!progress) return true;
  return new Date(progress.next_review).getTime() <= now.getTime();
}