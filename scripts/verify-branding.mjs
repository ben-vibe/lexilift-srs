#!/usr/bin/env node
/**
 * Verifies logo/favicon/PWA assets and captures screenshots.
 * Usage: BASE_URL=http://localhost:5173 node scripts/verify-branding.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve("screenshots/verify-branding");

const checks = [];

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const assetChecks = [
    "/logo-lexilift.png",
    "/icons/icon-32.png",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/manifest.webmanifest",
  ];

  for (const url of assetChecks) {
    const res = await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    checks.push({
      url,
      ok: res?.ok() ?? false,
      status: res?.status() ?? 0,
    });
  }

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const homeLogo = page.locator('img[alt*="LexiLift"]');
  const logoVisible = await homeLogo.isVisible();
  const logoSrc = await homeLogo.getAttribute("src");
  const natural = await homeLogo.evaluate((img) => ({
    w: img.naturalWidth,
    h: img.naturalHeight,
  }));

  checks.push({
    check: "home_logo_visible",
    ok: logoVisible && logoSrc === "/logo-lexilift.png" && natural.w > 0,
    logoSrc,
    natural,
  });

  await page.screenshot({
    path: path.join(OUT_DIR, "home-dashboard.png"),
    fullPage: false,
  });

  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT_DIR, "profile-pwa-section.png"),
    fullPage: false,
  });

  const manifestRes = await page.goto(`${BASE}/manifest.webmanifest`);
  const manifest = await manifestRes?.json();
  const iconLocal = manifest?.icons?.every((i) => i.src.startsWith("/icons/"));

  checks.push({
    check: "manifest_icons_local",
    ok: Boolean(iconLocal && manifest?.icons?.length >= 2),
    icons: manifest?.icons?.map((i) => i.src),
  });

  await browser.close();

  const allOk = checks.every((c) => c.ok !== false);
  const report = { base: BASE, allOk, checks, screenshots: OUT_DIR };
  await fs.writeFile(
    path.join(OUT_DIR, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
