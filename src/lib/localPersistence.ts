import type { Category } from "../data/allWords";
import type { WordProgress } from "./srs";

/** Legacy localStorage keys (v3) — kept for migration and mirror writes. */
export const LEGACY_PROGRESS_KEY = "lexilift-progress-v3";
export const LEGACY_CUSTOM_WORDS_KEY = "lexilift-custom-words-v3";
export const LEGACY_SETTINGS_KEY = "lexilift-settings-v3";

const SNAPSHOT_VERSION = 4;
const IDB_NAME = "lexilift-local";
const IDB_VERSION = 1;
const IDB_STORE = "kv";
const IDB_SNAPSHOT_KEY = "snapshot-v4";
const IDB_BACKUP_KEY = "snapshot-v4-backup";
const MIRROR_SNAPSHOT_KEY = "lexilift-snapshot-v4";
const MIRROR_BACKUP_KEY = "lexilift-snapshot-v4-backup";

export type AppSettings = {
  isReverse: boolean;
  selectedCategory: Category | "All";
};

export type PersistedCustomWord = {
  id: string;
  word: string;
  translation: string;
  difficulty_level: string;
  frequency_rank: number;
  phonetic: string;
  example_sentence: string;
  category?: Category;
  custom?: boolean;
};

export type ProgressMap = Record<string, WordProgress>;

export type LocalSnapshot = {
  version: number;
  progress: ProgressMap;
  customWords: PersistedCustomWord[];
  settings: AppSettings;
  savedAt: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  isReverse: false,
  selectedCategory: "All",
};

const EMPTY_SNAPSHOT: LocalSnapshot = {
  version: SNAPSHOT_VERSION,
  progress: {},
  customWords: [],
  settings: DEFAULT_SETTINGS,
  savedAt: new Date(0).toISOString(),
};

let persistChain: Promise<void> = Promise.resolve();
let lastPersistedJson = "";

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.code === 22)
  );
}

function isWordProgress(value: unknown): value is WordProgress {
  if (!value || typeof value !== "object") return false;
  const row = value as WordProgress;
  return (
    typeof row.status === "string" &&
    ["new", "learning", "mastered"].includes(row.status) &&
    typeof row.ease_factor === "number" &&
    Number.isFinite(row.ease_factor) &&
    typeof row.interval === "number" &&
    Number.isFinite(row.interval) &&
    typeof row.next_review === "string" &&
    (row.last_reviewed === undefined || typeof row.last_reviewed === "string")
  );
}

function sanitizeProgress(raw: unknown): ProgressMap {
  if (!raw || typeof raw !== "object") return {};
  const out: ProgressMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key === "string" && isWordProgress(value)) {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeCustomWords(raw: unknown): PersistedCustomWord[] {
  if (!Array.isArray(raw)) return [];
  const out: PersistedCustomWord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as PersistedCustomWord;
    if (
      typeof row.id === "string" &&
      typeof row.word === "string" &&
      typeof row.translation === "string" &&
      typeof row.difficulty_level === "string" &&
      typeof row.frequency_rank === "number" &&
      typeof row.phonetic === "string" &&
      typeof row.example_sentence === "string"
    ) {
      out.push(row);
    }
  }
  return out;
}

function sanitizeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const row = raw as Partial<AppSettings>;
  const selectedCategory =
    row.selectedCategory === "All" ||
    row.selectedCategory === "Tech" ||
    row.selectedCategory === "Business" ||
    row.selectedCategory === "Travel" ||
    row.selectedCategory === "Daily Life"
      ? row.selectedCategory
      : DEFAULT_SETTINGS.selectedCategory;
  return {
    isReverse: Boolean(row.isReverse),
    selectedCategory,
  };
}

function parseJsonSafely<T>(
  raw: string | null,
  sanitize: (value: unknown) => T,
  label: string,
): { value: T; corrupted: boolean } {
  if (!raw) {
    return { value: sanitize(null), corrupted: false };
  }
  try {
    return { value: sanitize(JSON.parse(raw)), corrupted: false };
  } catch (error) {
    console.warn(`[LexiLift] Could not parse ${label}; attempting recovery`, error);
    return { value: sanitize(null), corrupted: true };
  }
}

function readLegacySnapshot(): LocalSnapshot {
  const progressParsed = parseJsonSafely(
    localStorage.getItem(LEGACY_PROGRESS_KEY),
    sanitizeProgress,
    LEGACY_PROGRESS_KEY,
  );
  const customParsed = parseJsonSafely(
    localStorage.getItem(LEGACY_CUSTOM_WORDS_KEY),
    sanitizeCustomWords,
    LEGACY_CUSTOM_WORDS_KEY,
  );
  const settingsParsed = parseJsonSafely(
    localStorage.getItem(LEGACY_SETTINGS_KEY),
    sanitizeSettings,
    LEGACY_SETTINGS_KEY,
  );

  const corrupted =
    progressParsed.corrupted || customParsed.corrupted || settingsParsed.corrupted;

  if (corrupted) {
    console.warn("[LexiLift] Legacy localStorage had corrupted entries; salvaged valid fields.");
  }

  return {
    version: 3,
    progress: progressParsed.value,
    customWords: customParsed.value,
    settings: settingsParsed.value,
    savedAt: new Date(0).toISOString(),
  };
}

function readMirrorSnapshot(key: string): LocalSnapshot | null {
  const parsed = parseJsonSafely(
    localStorage.getItem(key),
    (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as Partial<LocalSnapshot>;
      return {
        version: typeof row.version === "number" ? row.version : SNAPSHOT_VERSION,
        progress: sanitizeProgress(row.progress),
        customWords: sanitizeCustomWords(row.customWords),
        settings: sanitizeSettings(row.settings),
        savedAt: typeof row.savedAt === "string" ? row.savedAt : new Date(0).toISOString(),
      };
    },
    key,
  );
  return parsed.value;
}

function mergeSnapshots(base: LocalSnapshot, incoming: LocalSnapshot): LocalSnapshot {
  const baseTime = Date.parse(base.savedAt) || 0;
  const incomingTime = Date.parse(incoming.savedAt) || 0;
  const preferIncoming = incomingTime >= baseTime;

  return {
    version: SNAPSHOT_VERSION,
    progress: { ...base.progress, ...incoming.progress },
    customWords:
      incoming.customWords.length > 0
        ? preferIncoming
          ? incoming.customWords
          : base.customWords.length > 0
            ? base.customWords
            : incoming.customWords
        : base.customWords,
    settings: preferIncoming ? incoming.settings : base.settings,
    savedAt: preferIncoming ? incoming.savedAt : base.savedAt,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function idbGet<T>(key: string): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const request = tx.objectStore(IDB_STORE).get(key);
        request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
      }),
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const request = tx.objectStore(IDB_STORE).put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("IndexedDB write failed"));
      }),
  );
}

function writeLocalStorageMirror(snapshot: LocalSnapshot): void {
  const json = JSON.stringify(snapshot);
  try {
    localStorage.setItem(MIRROR_SNAPSHOT_KEY, json);
    localStorage.setItem(LEGACY_PROGRESS_KEY, JSON.stringify(snapshot.progress));
    localStorage.setItem(LEGACY_CUSTOM_WORDS_KEY, JSON.stringify(snapshot.customWords));
    localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify(snapshot.settings));
  } catch (error) {
    if (isQuotaError(error)) {
      console.warn("[LexiLift] localStorage mirror skipped (quota exceeded). IndexedDB copy retained.");
      return;
    }
    throw error;
  }

  try {
    localStorage.setItem(MIRROR_BACKUP_KEY, json);
  } catch (error) {
    if (!isQuotaError(error)) {
      console.warn("[LexiLift] Could not write localStorage backup", error);
    }
  }
}

async function writeIndexedDB(snapshot: LocalSnapshot): Promise<void> {
  const existing = await idbGet<LocalSnapshot>(IDB_SNAPSHOT_KEY);
  if (existing) {
    await idbSet(IDB_BACKUP_KEY, existing);
  }
  await idbSet(IDB_SNAPSHOT_KEY, snapshot);
}

function enqueuePersist(task: () => Promise<void>): Promise<void> {
  persistChain = persistChain
    .then(task)
    .catch((error) => {
      console.error("[LexiLift] Persist failed:", error);
    });
  return persistChain;
}

/** Synchronous bootstrap read for first paint (legacy keys + v4 mirror). */
export function readBootstrapSnapshot(): LocalSnapshot {
  const legacy = readLegacySnapshot();
  const mirror = readMirrorSnapshot(MIRROR_SNAPSHOT_KEY);
  const mirrorBackup = readMirrorSnapshot(MIRROR_BACKUP_KEY);

  if (mirror && mirrorBackup) {
    return mergeSnapshots(mergeSnapshots(EMPTY_SNAPSHOT, mirrorBackup), mirror);
  }
  if (mirror) {
    return mergeSnapshots(EMPTY_SNAPSHOT, mirror);
  }
  return legacy;
}

/** Load durable snapshot (IndexedDB first, then salvage from mirrors/legacy). */
export async function loadPersistedSnapshot(): Promise<LocalSnapshot> {
  const candidates: LocalSnapshot[] = [readBootstrapSnapshot()];

  try {
    const idbCurrent = await idbGet<LocalSnapshot>(IDB_SNAPSHOT_KEY);
    if (idbCurrent) {
      candidates.push({
        version: SNAPSHOT_VERSION,
        progress: sanitizeProgress(idbCurrent.progress),
        customWords: sanitizeCustomWords(idbCurrent.customWords),
        settings: sanitizeSettings(idbCurrent.settings),
        savedAt: typeof idbCurrent.savedAt === "string" ? idbCurrent.savedAt : new Date().toISOString(),
      });
    }
  } catch (error) {
    console.warn("[LexiLift] IndexedDB read failed; using localStorage salvage", error);
  }

  try {
    const idbBackup = await idbGet<LocalSnapshot>(IDB_BACKUP_KEY);
    if (idbBackup) {
      candidates.push({
        version: SNAPSHOT_VERSION,
        progress: sanitizeProgress(idbBackup.progress),
        customWords: sanitizeCustomWords(idbBackup.customWords),
        settings: sanitizeSettings(idbBackup.settings),
        savedAt: typeof idbBackup.savedAt === "string" ? idbBackup.savedAt : new Date(0).toISOString(),
      });
    }
  } catch (error) {
    console.warn("[LexiLift] IndexedDB backup read failed", error);
  }

  const mirrorBackup = readMirrorSnapshot(MIRROR_BACKUP_KEY);
  if (mirrorBackup) {
    candidates.push(mirrorBackup);
  }

  let merged = EMPTY_SNAPSHOT;
  for (const candidate of candidates) {
    merged = mergeSnapshots(merged, candidate);
  }

  const hasData =
    Object.keys(merged.progress).length > 0 ||
    merged.customWords.length > 0 ||
    merged.settings.isReverse ||
    merged.settings.selectedCategory !== "All";

  if (hasData) {
    await persistSnapshot(
      {
        ...merged,
        version: SNAPSHOT_VERSION,
        savedAt: new Date().toISOString(),
      },
      { skipQueue: true },
    );
  }

  return merged;
}

export async function persistSnapshot(
  snapshot: LocalSnapshot,
  options?: { skipQueue?: boolean },
): Promise<void> {
  const payload: LocalSnapshot = {
    version: SNAPSHOT_VERSION,
    progress: sanitizeProgress(snapshot.progress),
    customWords: sanitizeCustomWords(snapshot.customWords),
    settings: sanitizeSettings(snapshot.settings),
    savedAt: new Date().toISOString(),
  };

  const json = JSON.stringify(payload);
  if (json === lastPersistedJson) {
    return;
  }
  lastPersistedJson = json;

  const write = async () => {
    try {
      await writeIndexedDB(payload);
    } catch (error) {
      console.warn("[LexiLift] IndexedDB write failed; mirroring to localStorage only", error);
    }
    writeLocalStorageMirror(payload);
  };

  if (options?.skipQueue) {
    await write();
    return;
  }

  await enqueuePersist(write);
}

export function persistUserState(state: {
  progress: ProgressMap;
  customWords: PersistedCustomWord[];
  settings: AppSettings;
}): Promise<void> {
  return persistSnapshot({
    version: SNAPSHOT_VERSION,
    progress: sanitizeProgress(state.progress),
    customWords: sanitizeCustomWords(state.customWords),
    settings: sanitizeSettings(state.settings),
    savedAt: new Date().toISOString(),
  });
}

/** Clears progress only (matches previous sign-out behavior). */
export async function clearPersistedProgress(): Promise<void> {
  const bootstrap = readBootstrapSnapshot();
  lastPersistedJson = "";
  await persistSnapshot({
    ...bootstrap,
    progress: {},
    savedAt: new Date().toISOString(),
  });
  try {
    localStorage.removeItem(LEGACY_PROGRESS_KEY);
  } catch (error) {
    console.warn("[LexiLift] Could not remove legacy progress key", error);
  }
}

/** Clears all local user data (reset demo / delete guest account). */
export async function clearAllLocalUserData(): Promise<void> {
  lastPersistedJson = "";
  const empty: LocalSnapshot = {
    ...EMPTY_SNAPSHOT,
    savedAt: new Date().toISOString(),
  };

  try {
    await writeIndexedDB(empty);
  } catch (error) {
    console.warn("[LexiLift] IndexedDB clear failed", error);
  }

  const keys = [
    LEGACY_PROGRESS_KEY,
    LEGACY_CUSTOM_WORDS_KEY,
    LEGACY_SETTINGS_KEY,
    MIRROR_SNAPSHOT_KEY,
    MIRROR_BACKUP_KEY,
  ];
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[LexiLift] Could not remove ${key}`, error);
    }
  }
}
