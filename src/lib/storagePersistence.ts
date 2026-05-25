export type PersistentStorageStatus = {
  /** `navigator.storage.persist` exists in this browser. */
  supported: boolean;
  /** Storage is (or was already) marked persistent — OS eviction less likely. */
  granted: boolean;
  /** Already persistent before this call (no new request needed). */
  alreadyPersistent?: boolean;
};

/**
 * Asks the browser to mark origin storage as persistent (survives storage pressure).
 * Safe to call on every launch: no-ops when unsupported or denied; never throws.
 */
export async function requestPersistentStorage(): Promise<PersistentStorageStatus> {
  const storage = navigator.storage;
  if (!storage?.persist) {
    return { supported: false, granted: false };
  }

  try {
    if (storage.persisted) {
      const alreadyPersistent = await storage.persisted();
      if (alreadyPersistent) {
        return { supported: true, granted: true, alreadyPersistent: true };
      }
    }

    const granted = await storage.persist();
    return { supported: true, granted };
  } catch (error) {
    console.warn("[LexiLift] Persistent storage request failed; using normal storage", error);
    return { supported: true, granted: false };
  }
}
