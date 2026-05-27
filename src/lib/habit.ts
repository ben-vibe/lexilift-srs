import { DEFAULT_DAILY_GOAL } from "./labels";

export type HabitStats = {
  /** Reviews counted toward today's goal (swipes in study). */
  reviewsToday: number;
  /** Calendar day key (YYYY-MM-DD) for reviewsToday. */
  dayKey: string;
  streak: number;
  /** Last calendar day the daily goal was completed. */
  lastGoalDayKey: string | null;
};

export const DEFAULT_HABIT: HabitStats = {
  reviewsToday: 0,
  dayKey: "",
  streak: 0,
  lastGoalDayKey: null,
};

export function toDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey(date = new Date()): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return toDayKey(d);
}

/** Call on load so a missed day breaks the streak before the next swipe. */
export function normalizeHabitForToday(
  habit: HabitStats,
  dailyGoal: number,
  now = new Date(),
): HabitStats {
  const today = toDayKey(now);
  if (!habit.dayKey || habit.dayKey === today) {
    return habit.dayKey ? habit : { ...habit, dayKey: today };
  }

  const metPreviousDay = habit.reviewsToday >= dailyGoal;
  let streak = habit.streak;
  if (!metPreviousDay) {
    streak = 0;
  }

  return {
    ...habit,
    dayKey: today,
    reviewsToday: 0,
    streak,
  };
}

/** Record one study swipe; updates today's count and streak when goal is hit. */
export function recordStudyReview(
  habit: HabitStats,
  dailyGoal: number,
  now = new Date(),
): HabitStats {
  const today = toDayKey(now);
  const yesterday = yesterdayKey(now);
  let next = normalizeHabitForToday(habit, dailyGoal, now);

  if (next.dayKey !== today) {
    next = { ...next, dayKey: today, reviewsToday: 0 };
  }

  const reviewsToday = next.reviewsToday + 1;
  let { streak, lastGoalDayKey } = next;

  if (reviewsToday >= dailyGoal && lastGoalDayKey !== today) {
    if (lastGoalDayKey === yesterday) {
      streak = Math.max(1, streak + 1);
    } else {
      streak = 1;
    }
    lastGoalDayKey = today;
  }

  return {
    dayKey: today,
    reviewsToday,
    streak,
    lastGoalDayKey,
  };
}

export function hasHabitData(habit: HabitStats): boolean {
  return (
    habit.reviewsToday > 0 ||
    habit.streak > 0 ||
    Boolean(habit.lastGoalDayKey) ||
    Boolean(habit.dayKey)
  );
}

export function sanitizeHabit(raw: unknown): HabitStats {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_HABIT };
  const row = raw as Partial<HabitStats>;
  const reviewsToday =
    typeof row.reviewsToday === "number" && Number.isFinite(row.reviewsToday)
      ? Math.max(0, Math.floor(row.reviewsToday))
      : 0;
  const streak =
    typeof row.streak === "number" && Number.isFinite(row.streak)
      ? Math.max(0, Math.floor(row.streak))
      : 0;
  const dayKey = typeof row.dayKey === "string" ? row.dayKey : toDayKey();
  const lastGoalDayKey =
    typeof row.lastGoalDayKey === "string" ? row.lastGoalDayKey : null;
  return { reviewsToday, dayKey, streak, lastGoalDayKey };
}

export function dailyGoalFromSettings(dailyGoal: number | undefined): number {
  if (typeof dailyGoal === "number" && dailyGoal >= 5 && dailyGoal <= 100) {
    return Math.floor(dailyGoal);
  }
  return DEFAULT_DAILY_GOAL;
}
