# מאיפה אפשר להוסיף מילים ל-LexiLift (מקומי, בלי Supabase)

## כבר בתוך האפליקציה

| מקום | קובץ / UI | מה זה נותן |
|------|-----------|------------|
| **Oxford 3000 (+ אופציונלי 5000)** | `src/data/oxford3000_seed.json` | עיקר המילון (~3k–5k מילים) |
| **מילון גיבוי** | `src/data/seed_words.json` | ~580 מילים עם עברית איכותית |
| **מיזוג** | `src/data/allWords.ts` | מאחד את שני הקבצים + קטגוריות |
| **Quick Add** | כפתור + באפליקציה | מילים מותאמות אישית → `localStorage` |
| **Explore → +** | UI | מוסיף מילים מהמילון ללמידה |

בנייה מחדש: `npm run words:build` (רשת נדרשת פעם אחת).

---

## מקורות חינמיים באינטרנט (מומלצים)

### 1. GiliGold Hebrew VAD Lexicon (מחובר לסקריפט הבנייה)

- **קישור:** [huggingface.co/datasets/GiliGold/Hebrew_VAD_lexicon](https://huggingface.co/datasets/GiliGold/Hebrew_VAD_lexicon)
- **קובץ:** `english_hebrew_enriched_final_lexicon.csv` (~14k זוגות EN→HE)
- **יתרון:** ממלא אוטומטית אלפי תרגומים חסרים ב-Oxford
- **חיסרון:** לא תמיד מילה בודדת ב-Oxford; לפעמים תרגום רגשי/לא מדויק

### 2. Oxford 5000 (מעבר ל-3000)

- **קישור:** [The Oxford 5000.txt](https://github.com/ittuann/The-Oxford-5000-Word-Lists/blob/main/The%20Oxford%205000.txt)
- **~2,000 מילים נוספות** שלא ב-3000
- **הפעלה:** `ADD_OXFORD_5000=1 npm run words:build` (ברירת מחדל: מופעל)
- **כיבוי:** `ADD_OXFORD_5000=0 npm run words:build` — רק 3000 מילים (קובץ קטן יותר)

### 3. מטא-דאטה (הגייה, CEFR, דוגמאות באנגלית)

- **winterdl/oxford-5000-vocabulary** — JSON עם CEFR, IPA, משפטים
- כבר בשימוש ב-`scripts/build_oxford_local_seed.mjs`

### 4. יצירה עם OpenAI (איכות עברית גבוהה)

```bash
export OPENAI_API_KEY=sk-...
node scripts/batch_generate_oxford.mjs
```

- ממלא תרגום + דוגמה + IPA בבאצ'ים
- עולה כסף; איכות הכי טובה לעברית

### 5. מילונים גדולים (מתקדם)

| מקור | גודל | הערה |
|------|------|------|
| [Uri-Tauber/StarDict-Hebrew](https://github.com/Uri-Tauber/StarDict-Hebrew) | ~150k רשומות EN↔HE | פורמט StarDict — צריך סקריפט המרה |
| [tdulcet/compact-dictionaries](https://github.com/tdulcet/compact-dictionaries) | מילון EN/HE נפרד | הגדרות באנגלית, לא תרגום ישיר |
| [kaikki.org Hebrew](https://kaikki.org/dictionary/Hebrew/) | ויקימילון | JSONL ענק; עיבוד כבד |

### 6. משפטים מקבילים (לא מילון מילה-מילה)

| מקור | שימוש |
|------|--------|
| [Tatoeba eng-heb](https://downloads.tatoeba.org/exports/per_language/eng/eng-heb_links.tsv.bz2) | משפטים שלמים — טוב לדוגמאות, לא ל-flashcards |
| [ccmatrix_en_he](https://huggingface.co/datasets/Picard1203/ccmatrix_en_he) | 25M משפטים — כבד מדי ל-PWA |

### 7. נישה: אנגלית טכנולוגית בעברית

- [Hebrew-Tech-Vocab](https://github.com/danielrosehill/Hebrew-Tech-Vocab) — מילים טכניות (אם יש `dictionary.json` ב-repo)

---

## סדר עדיפות מעשי

1. `npm run words:build` — Oxford + GiliGold (+ 5000 אופציונלי)
2. `node scripts/batch_generate_oxford.mjs` — להשלמת עברית איכותית
3. מילים ידניות / Quick Add באפליקציה
4. רק אם צריך עוד: StarDict / Tatoeba / מקורות נישה

---

## מה לא כדאי

- **Supabase** — ויתרתם; לא נדרש למילון מקומי
- **הדבקת 3000 שורות בצ'אט** — לא יעבוד
- **הורדת 5GB מ-Hugging Face** ל-PWA — יהרוג את גודל האפליקציה
