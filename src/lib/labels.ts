import type { ProgressStatus } from "./srs";

/** User-facing labels (internal SRS status keys stay unchanged). */
export const STATUS_LABEL: Record<ProgressStatus, string> = {
  new: "Not yet",
  learning: "Still learning",
  mastered: "I know",
};

export const SWIPE_LEFT_LABEL = "Not yet";
export const SWIPE_RIGHT_LABEL = "I know";

export const DAILY_GOAL_OPTIONS = [15, 20, 25, 30] as const;
export const DEFAULT_DAILY_GOAL = 20;
