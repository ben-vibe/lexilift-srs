# פריסה מקצועית: GitHub → Vercel → מפתחות

## סדר עבודה (מומלץ)

```
1. GitHub (ben-vibe/lexilift-srs)  ← קוד + היסטוריה
2. Vercel ← חיבור ל-repo, build אוטומטי
3. מפתחות ← רק ב-Vercel / מקומי ב-.env (לא בקוד)
```

---

## 1. GitHub

**Repo:** https://github.com/ben-vibe/lexilift-srs

```bash
cd flashcard/english-srs-flashcard-system
git init
git add .
git commit -m "Initial commit: LexiLift SRS PWA"
git branch -M main
git remote add origin https://github.com/ben-vibe/lexilift-srs.git
git push -u origin main
```

---

## 2. Vercel

1. היכנס ל-[vercel.com](https://vercel.com) עם אותו חשבון GitHub.
2. **Add New Project** → Import `ben-vibe/lexilift-srs`.
3. Vercel יזהה Vite אוטומטית (`vercel.json` כבר מוגדר).
4. **Node.js Version:** 20.x (בהגדרות הפרויקט).
5. Deploy.

**אחרי כל push ל-`main`** — Vercel יבנה מחדש אוטומטית.

---

## 3. איפה לשים מפתחות (חשוב)

| מפתח | איפה | למה |
|------|------|-----|
| `OPENAI_API_KEY` | **Vercel → Environment Variables** (Production) | רק ל-API בשרת (`/api/*`) — **לא** `VITE_` |
| `OPENAI_API_KEY` | **מקומי:** `.env` (לא נכנס ל-git) | סקריפטים: `batch_generate_oxford.mjs` |
| `VITE_SUPABASE_*` | Vercel (אופציונלי) | רק אם תחזירו Supabase |

### כלל זהב

- **`VITE_` = נחשף לדפדפן** — כל מי שפותח את האתר יכול לראות.
- **מפתח OpenAI לעולם לא ב-`VITE_`** — רק בשרת Vercel או במחשב שלך לסקריפטים.

האפליקציה **עובדת בלי שום מפתח** (מילון מקומי + שמירה במכשיר).

---

## 4. תרגום אוטומטי בעתיד (אופציונלי)

כדי ש-Quick Add ישתמש ב-OpenAI בפרודקשן:

1. הוסף `api/translate.ts` (Serverless Function ב-Vercel).
2. הגדר `OPENAI_API_KEY` ב-Vercel.
3. באפליקציה: `VITE_TRANSLATE_API=/api/translate` (רק URL, לא המפתח).

זה השלב הבא — לא חובה לפריסה הראשונה.

---

## 5. בדיקות אחרי Deploy

- [ ] האתר נטען (Dashboard)
- [ ] Study / Explore עובדים
- [ ] רענון שומר התקדמות (local)
- [ ] "Add to Home Screen" / PWA (במובייל)

---

## Node מקומי

```bash
nvm use 20
npm install
npm run dev
```
