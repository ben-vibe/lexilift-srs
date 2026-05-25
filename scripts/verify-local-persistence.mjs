/**
 * Headless checks for local persistence (no Supabase).
 * Run: node scripts/verify-local-persistence.mjs
 * Requires: dev server at http://localhost:5173 (or set BASE_URL).
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";

async function waitForHydration(page) {
  await page.waitForFunction(() => {
    const progress = localStorage.getItem("lexilift-progress-v3");
    return progress !== null;
  }, { timeout: 8000 });
  await page.waitForTimeout(400);
}

async function studyOneCard(page) {
  await page.getByRole("button", { name: "Study", exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator("button.bg-emerald-500").first().click();
  await page.waitForTimeout(600);
}

async function readStoredProgress(page) {
  return page.evaluate(async () => {
    const legacy = localStorage.getItem("lexilift-progress-v3");
    const mirror = localStorage.getItem("lexilift-snapshot-v4");
    let idbCount = 0;
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("lexilift-local", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction("kv", "readonly");
      const value = await new Promise((resolve, reject) => {
        const getReq = tx.objectStore("kv").get("snapshot-v4");
        getReq.onsuccess = () => resolve(getReq.result);
        getReq.onerror = () => reject(getReq.error);
      });
      if (value?.progress) {
        idbCount = Object.keys(value.progress).length;
      }
    } catch {
      idbCount = -1;
    }
    const legacyCount = legacy ? Object.keys(JSON.parse(legacy)).length : 0;
    return { legacyCount, hasMirror: Boolean(mirror), idbCount };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    // Scenario 1 & 2: study then reload
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await waitForHydration(page);
      await studyOneCard(page);
      const before = await readStoredProgress(page);
      await page.reload({ waitUntil: "networkidle" });
      await waitForHydration(page);
      const after = await readStoredProgress(page);
      const pass = after.legacyCount >= before.legacyCount && after.legacyCount > 0;
      results.push({
        name: "1. Refresh keeps progress",
        pass,
        detail: { before, after },
      });
      await context.close();
    }

    // Scenario 2 & 3: same browser profile — reload and later revisit
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await waitForHydration(page);
      await studyOneCard(page);
      await studyOneCard(page);
      const beforeReload = await readStoredProgress(page);
      await page.reload({ waitUntil: "networkidle" });
      await waitForHydration(page);
      const afterReload = await readStoredProgress(page);
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await waitForHydration(page);
      const afterRevisit = await readStoredProgress(page);
      const pass =
        beforeReload.legacyCount >= 2 &&
        afterReload.legacyCount >= beforeReload.legacyCount &&
        afterRevisit.legacyCount >= beforeReload.legacyCount;
      results.push({
        name: "2. Reload / revisit keeps progress (same browser profile)",
        pass,
        detail: { beforeReload, afterReload, afterRevisit },
      });
      results.push({
        name: "3. Returning session loads stored progress",
        pass,
        detail: { beforeReload, afterRevisit },
      });
      await context.close();
    }

    // Scenario 4: empty storage launches cleanly
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      const errors = [];
      page.on("pageerror", (err) => errors.push(String(err)));
      await page.evaluate(() => {
        localStorage.clear();
        indexedDB.deleteDatabase("lexilift-local");
      });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const titleVisible = await page.getByText("Dashboard").isVisible();
      const pass = titleVisible && errors.length === 0;
      results.push({
        name: "4. Empty storage launches without errors",
        pass,
        detail: { titleVisible, errors },
      });
      await context.close();
    }

    // Scenario 5: corrupted storage recovers without crash
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.setItem("lexilift-progress-v3", "{not-json");
        localStorage.setItem("lexilift-custom-words-v3", "[broken");
        localStorage.setItem("lexilift-settings-v3", "???");
        localStorage.setItem(
          "lexilift-snapshot-v4-backup",
          JSON.stringify({
            version: 4,
            progress: { salvage: { status: "learning", ease_factor: 2.5, interval: 1, next_review: new Date().toISOString() } },
            customWords: [],
            settings: { isReverse: true, selectedCategory: "All" },
            savedAt: new Date().toISOString(),
          }),
        );
      });
      const errors = [];
      page.on("pageerror", (err) => errors.push(String(err)));
      await page.reload({ waitUntil: "networkidle" });
      await waitForHydration(page);
      const stored = await readStoredProgress(page);
      const reverseVisible = await page.getByText("Profile").isVisible();
      const pass = reverseVisible && errors.length === 0;
      results.push({
        name: "5. Corrupted storage does not crash (salvage backup)",
        pass,
        detail: { stored, errors },
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log("\n=== Local persistence verification ===\n");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} — ${r.name}`);
    console.log(JSON.stringify(r.detail, null, 2));
  }
  const allPass = results.every((r) => r.pass);
  process.exit(allPass ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
