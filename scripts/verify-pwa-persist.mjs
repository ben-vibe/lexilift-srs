/**
 * Checks manifest + service worker + storage.persist() (no app changes).
 * Run with dev server: BASE_URL=http://localhost:5173 node scripts/verify-pwa-persist.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5173";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const manifestOk = await page.goto(`${BASE_URL}/manifest.webmanifest`).then(async (res) => {
    if (!res?.ok()) return { ok: false, reason: `HTTP ${res?.status()}` };
    const json = await res.json();
    const ok =
      json.display === "standalone" &&
      typeof json.name === "string" &&
      Array.isArray(json.icons) &&
      json.icons.some((i) => String(i.sizes).includes("512"));
    return { ok, json };
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const runtime = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const hasPersist = typeof navigator.storage?.persist === "function";
    let granted = false;
    let supported = hasPersist;
    let alreadyPersistent = false;
    if (hasPersist) {
      try {
        if (navigator.storage.persisted) {
          alreadyPersistent = await navigator.storage.persisted();
        }
        granted = alreadyPersistent || (await navigator.storage.persist());
      } catch {
        granted = false;
      }
    }
    return {
      swRegistered: Boolean(reg),
      swActive: Boolean(reg?.active),
      persist: { supported, granted, alreadyPersistent },
    };
  });

  await browser.close();

  console.log(JSON.stringify({ manifestOk, runtime }, null, 2));
  const pass = manifestOk.ok && runtime.swRegistered && runtime.persist.supported;
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
