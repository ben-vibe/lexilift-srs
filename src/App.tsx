import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { DayPicker } from "react-day-picker";
import {
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Grid3X3,
  Home,
  Layers3,
  Loader2,
  Plus,
  RotateCcw,
  Shuffle,
  Trophy,
  User,
  Volume2,
  Wand2,
  X,
  ArrowLeftRight,
  Filter,
  Flame,
  Shield,
  Trash2,
  LogOut,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";
import {
  clearAllLocalUserData,
  clearPersistedProgress,
  loadPersistedSnapshot,
  persistUserState,
  readBootstrapSnapshot,
  type AppSettings,
  type HabitStats,
  type PersistedCustomWord,
} from "./lib/localPersistence";
import { DEFAULT_HABIT, normalizeHabitForToday, recordStudyReview } from "./lib/habit";
import {
  DAILY_GOAL_OPTIONS,
  STATUS_LABEL,
  SWIPE_LEFT_LABEL,
  SWIPE_RIGHT_LABEL,
} from "./lib/labels";
import { dayKeyFromDate, logStudyReview, type StudyLog } from "./lib/studyLog";
import {
  getInitialProgress,
  getNextProgress,
  isStudyDue,
  type ProgressStatus,
  type ReviewRating,
  type WordProgress,
} from "./lib/srs";
import {
  ALL_WORDS,
  DIFFICULTY_LEVELS,
  CATEGORIES,
  getLevelColor,
  getLevelEmoji,
  shuffleArray,
  type DifficultyLevel,
  type Category,
  type SeedWord,
} from "./data/allWords";
import { FLUTTER_DART_CODE } from "./data/flutterCode";

// Haptic feedback helper
const triggerHaptic = (type: "light" | "medium" | "heavy" = "light") => {
  if ("vibrate" in navigator) {
    const patterns = { light: 10, medium: 20, heavy: 30 };
    navigator.vibrate(patterns[type]);
  }
};

type Tab = "home" | "study" | "explore" | "journal" | "profile";
type AppWord = SeedWord & { id: string; custom?: boolean };
type ProgressMap = Record<string, WordProgress>;
type QuickState = "idle" | "loading" | "linked" | "created" | "error";

const fallbackTranslations: Record<string, string> = {
  build: "לבנות", learn: "ללמוד", study: "ללמוד",
  design: "לעצב", deploy: "להעלות לאוויר", review: "לחזור על חומר",
  memory: "זיכרון", speak: "לדבר", write: "לכתוב", listen: "להקשיב",
};

function toWordId(word: string) {
  return word.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function speakWord(word: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

// Convert seed words to app words
const seedWords: AppWord[] = ALL_WORDS.map((word) => ({
  ...word,
  id: toWordId(word.word),
}));

// ==================== SWIPE CARD ====================
function SwipeCard({
  word,
  progress,
  onSwipe,
  onFlip,
  isFlipped,
  isReverse,
}: {
  word: AppWord;
  progress: WordProgress | undefined;
  onSwipe: (direction: "left" | "right") => void;
  onFlip: () => void;
  isFlipped: boolean;
  isReverse: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacityLeft = useTransform(x, [-200, -50, 0], [1, 0.5, 0]);
  const opacityRight = useTransform(x, [0, 50, 200], [0, 0.5, 1]);
  const scale = useTransform(x, [-200, 0, 200], [0.95, 1, 0.95]);

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const threshold = 80;
    const velocity = 500;
    if (info.offset.x > threshold || info.velocity.x > velocity) {
      triggerHaptic("medium");
      onSwipe("right");
    } else if (info.offset.x < -threshold || info.velocity.x < -velocity) {
      triggerHaptic("medium");
      onSwipe("left");
    }
  };

  const frontText = isReverse ? word.translation : word.word;
  const frontSubtext = isReverse ? word.difficulty_level : word.phonetic;
  const backText = isReverse ? word.word : word.translation;
  const backExample = word.example_sentence;

  return (
    <motion.div
      className="relative w-full max-w-sm cursor-grab touch-none select-none active:cursor-grabbing"
      style={{ x, rotate, scale }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      whileTap={{ scale: 1.02 }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-start rounded-3xl bg-red-500/90 p-6"
        style={{ opacity: opacityLeft }}
      >
        <div className="flex items-center gap-2 text-2xl font-black text-white">
          <X className="h-8 w-8" />
          {SWIPE_LEFT_LABEL}
        </div>
      </motion.div>

      <motion.div
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end rounded-3xl bg-emerald-500/90 p-6"
        style={{ opacity: opacityRight }}
      >
        <div className="flex items-center gap-2 text-2xl font-black text-white">
          {SWIPE_RIGHT_LABEL}
          <Check className="h-8 w-8" />
        </div>
      </motion.div>

      <div
        className={`relative min-h-[420px] overflow-hidden rounded-3xl shadow-2xl transition-transform ${
          isFlipped ? "bg-white" : "bg-slate-950 text-white"
        }`}
        onClick={onFlip}
      >
        {!isFlipped ? (
          <div className="flex h-full min-h-[420px] flex-col justify-between p-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                {word.difficulty_level}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); speakWord(word.word); }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-950"
              >
                <Volume2 className="h-5 w-5" />
              </button>
            </div>

            <div className="text-center">
              <motion.h2
                className={`text-5xl font-black tracking-tight ${isReverse ? "text-right" : ""}`}
                dir={isReverse ? "rtl" : "ltr"}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                {frontText}
              </motion.h2>
              {!isReverse && <p className="mt-2 font-mono text-lg text-white/60">{frontSubtext}</p>}
              {word.category && (
                <span className="mt-2 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">
                  {word.category}
                </span>
              )}
            </div>

            <div className="text-center text-sm text-white/50">
              <p>Tap to reveal</p>
              <p className="mt-1">← Swipe left | Swipe right →</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[420px] flex-col justify-between p-6">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {word.difficulty_level}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onFlip(); }}
                className="text-sm font-bold text-slate-400"
              >
                Back
              </button>
            </div>

            <div className="text-center">
              <h3
                className="text-4xl font-black text-slate-950"
                dir={isReverse ? "ltr" : "rtl"}
              >
                {backText}
              </h3>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">{backExample}</p>
              {isReverse && (
                <p className="mt-2 font-mono text-sm text-slate-400">{word.phonetic}</p>
              )}
            </div>

            <div className="text-center text-xs text-slate-400">
              {STATUS_LABEL[progress?.status ?? "new"]} • Next in {progress?.interval || 0}d
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ==================== BOTTOM NAV ====================
function BottomNav({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (tab: Tab) => void }) {
  const tabs: { id: Tab; icon: typeof Home; label: string }[] = [
    { id: "home", icon: Home, label: "Home" },
    { id: "study", icon: BookOpen, label: "Study" },
    { id: "explore", icon: Grid3X3, label: "Explore" },
    { id: "journal", icon: CalendarDays, label: "Journal" },
    { id: "profile", icon: User, label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-lg safe-area-pb">
      <div className="mx-auto flex max-w-md justify-around px-2 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex min-h-[44px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 transition ${
                isActive ? "text-slate-950" : "text-slate-400"
              }`}
            >
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] font-bold ${isActive ? "text-slate-950" : "text-slate-400"}`}>
                {tab.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute -bottom-0.5 h-1 w-8 rounded-full bg-slate-950"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ==================== STUDY SCREEN ====================
function StudyScreen({
  dueWords,
  progress,
  onSwipe,
  isReverse,
  onToggleReverse,
  onShuffle,
  selectedCategory,
  onToggleCategory,
  practiceMode,
  onExitPractice,
}: {
  dueWords: AppWord[];
  progress: ProgressMap;
  onSwipe: (wordId: string, direction: "left" | "right") => void;
  isReverse: boolean;
  onToggleReverse: () => void;
  onShuffle: () => void;
  selectedCategory: Category | "All";
  onToggleCategory: (cat: Category | "All") => void;
  practiceMode: boolean;
  onExitPractice: () => void;
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const currentWord = dueWords[0];

  const handleSwipe = (direction: "left" | "right") => {
    if (!currentWord) return;
    onSwipe(currentWord.id, direction);
    setIsFlipped(false);
  };

  if (!currentWord) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-full bg-emerald-100 p-6"
        >
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        </motion.div>
        <h2 className="mt-6 text-2xl font-black text-slate-950">All caught up!</h2>
        <p className="mt-2 text-slate-600">
          {practiceMode
            ? "Practice session complete. Great work."
            : "No cards due right now. Add words from Explore, or change category and try again later."}
        </p>
        {practiceMode && (
          <button
            onClick={onExitPractice}
            className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white"
          >
            Back to journal
          </button>
        )}
        
        {/* Category switcher */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {(["All", ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => onToggleCategory(cat)}
              className={`rounded-full px-3.5 py-2 text-xs font-black transition ${
                selectedCategory === cat
                  ? "bg-slate-950 text-white"
                  : "bg-white text-slate-600 border border-slate-200 shadow-sm"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col px-4 pb-24 pt-4">
      {/* Top controls */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-600">
            {dueWords.length} cards remaining {practiceMode ? "(Practice mode)" : ""}
          </span>
          <div className="flex items-center gap-2">
            {practiceMode && (
              <button
                onClick={onExitPractice}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
              >
                Exit
              </button>
            )}
            {!practiceMode && (
              <button
                onClick={onShuffle}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-slate-100"
                title="Shuffle cards"
              >
                <Shuffle className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onToggleReverse}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition ${
                isReverse
                  ? "bg-violet-100 text-violet-700"
                  : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
              }`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {isReverse ? "HE → EN" : "EN → HE"}
            </button>
          </div>
        </div>

        {/* Horizontal category filtering in study view */}
        {!practiceMode && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(["All", ...CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => onToggleCategory(cat)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  selectedCategory === cat
                    ? "bg-slate-950 text-white"
                    : "bg-white text-slate-600 border border-slate-200 shadow-sm hover:bg-slate-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Card stack */}
      <div className="flex flex-1 items-center justify-center">
        <AnimatePresence mode="popLayout">
          <SwipeCard
            key={currentWord.id}
            word={currentWord}
            progress={progress[currentWord.id]}
            onSwipe={handleSwipe}
            onFlip={() => setIsFlipped(!isFlipped)}
            isFlipped={isFlipped}
            isReverse={isReverse}
          />
        </AnimatePresence>
      </div>

      {/* Manual buttons */}
      <div className="mt-6 flex items-center justify-center gap-6">
        <button
          onClick={() => handleSwipe("left")}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:scale-105 active:scale-95"
        >
          <X className="h-7 w-7" />
        </button>
        <div className="text-center text-xs text-slate-400">
          <p>{SWIPE_LEFT_LABEL}</p>
          <p className="mt-0.5">{SWIPE_RIGHT_LABEL}</p>
        </div>
        <button
          onClick={() => handleSwipe("right")}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:scale-105 active:scale-95"
        >
          <Check className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
}

// ==================== HOME SCREEN ====================
function HomeScreen({
  statusCounts,
  totalWords,
  knownPercent,
  dueWords,
  studyQueueCount,
  habit,
  dailyGoal,
  deckCount,
  customWords,
  onStartStudy,
  onReset,
}: {
  statusCounts: Record<ProgressStatus, number>;
  totalWords: number;
  knownPercent: number;
  dueWords: AppWord[];
  studyQueueCount: number;
  habit: HabitStats;
  dailyGoal: number;
  deckCount: number;
  customWords: AppWord[];
  onStartStudy: () => void;
  onReset: () => void;
}) {
  const goalMet = habit.reviewsToday >= dailyGoal;
  const todayProgress = Math.min(100, Math.round((habit.reviewsToday / dailyGoal) * 100));

  const progressRows = [
    { status: "new" as const, label: STATUS_LABEL.new, icon: Layers3, color: "bg-slate-950", count: statusCounts.new },
    { status: "learning" as const, label: STATUS_LABEL.learning, icon: Brain, color: "bg-amber-400", count: statusCounts.learning },
    { status: "mastered" as const, label: STATUS_LABEL.mastered, icon: Trophy, color: "bg-emerald-500", count: statusCounts.mastered },
  ];

  return (
    <div className="flex h-full flex-col px-4 pb-28 pt-4">
      <div className="mb-6 text-center">
        <img
          src="/logo-lexilift.png"
          alt="LexiLift — Learn, Study, Words, English"
          className="mx-auto h-28 w-28 rounded-3xl object-cover shadow-lg ring-2 ring-white/80 sm:h-32 sm:w-32"
          width={128}
          height={128}
        />
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          LexiLift SRS
        </p>
        <h1 className="mt-1 text-4xl font-black text-slate-950">Dashboard</h1>
      </div>

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-amber-900">Daily goal</p>
            <p className="mt-1 text-3xl font-black text-slate-950">
              {habit.reviewsToday}
              <span className="text-lg font-bold text-slate-500"> / {dailyGoal}</span>
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {goalMet ? "Goal reached — nice work!" : `${dailyGoal - habit.reviewsToday} cards to go today`}
            </p>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-white/80 px-4 py-2">
            <Flame className={`h-6 w-6 ${habit.streak > 0 ? "text-orange-500" : "text-slate-300"}`} />
            <p className="mt-1 text-2xl font-black text-slate-950">{habit.streak}</p>
            <p className="text-[10px] font-bold uppercase text-slate-500">day streak</p>
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/70">
          <motion.div
            className="h-full rounded-full bg-orange-500"
            initial={{ width: 0 }}
            animate={{ width: `${todayProgress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-slate-950 p-5 text-white">
          <p className="text-sm font-medium text-white/60">I know</p>
          <p className="mt-1 text-4xl font-black">{knownPercent}%</p>
        </div>
        <div className="rounded-2xl bg-emerald-100 p-5 text-emerald-900">
          <p className="text-sm font-medium text-emerald-700">Due to practice</p>
          <p className="mt-1 text-4xl font-black">{dueWords.length}</p>
        </div>
      </div>

      <div className="mb-6 space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        {progressRows.map((row) => {
          const Icon = row.icon;
          const width = totalWords ? `${(row.count / totalWords) * 100}%` : "0%";
          return (
            <div key={row.status}>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <Icon className="h-4 w-4" />
                  {row.label}
                </div>
                <span className="text-xs text-slate-500">{row.count}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className={`h-full rounded-full ${row.color}`}
                  initial={{ width: 0 }}
                  animate={{ width }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <Clock3 className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-2 text-xl font-black">{dueWords.length}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400">Due</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-2 text-xl font-black">{deckCount}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400">In deck</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <Wand2 className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-2 text-xl font-black">{customWords.length}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400">Custom</p>
        </div>
      </div>

      {deckCount === 0 && (
        <p className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-900">
          Open Explore, pick a level, and tap + to add words to your deck.
        </p>
      )}

      <button
        onClick={onStartStudy}
        disabled={studyQueueCount === 0}
        className="mt-auto flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-lg font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <BookOpen className="h-5 w-5" />
        {studyQueueCount > 0
          ? goalMet
            ? `Keep practicing (${studyQueueCount})`
            : `Study today (${studyQueueCount})`
          : deckCount === 0
            ? "Add words in Explore"
            : "No cards due"}
      </button>

      <button
        onClick={onReset}
        className="mt-3 flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
      >
        <RotateCcw className="h-4 w-4" />
        Reset progress
      </button>
    </div>
  );
}

// ==================== EXPLORE SCREEN ====================
function ExploreScreen({
  allWords,
  progress,
  onAddWord,
  onBulkAdd,
}: {
  allWords: AppWord[];
  progress: ProgressMap;
  onAddWord: (wordId: string) => void;
  onBulkAdd: (level: DifficultyLevel) => void;
}) {
  const [selectedLevel, setSelectedLevel] = useState<DifficultyLevel>("A1");
  const [showOnlyNew, setShowOnlyNew] = useState(false);

  const wordsAtLevel = useMemo(() => {
    const levelWords = allWords.filter((w) => w.difficulty_level === selectedLevel);
    if (showOnlyNew) {
      return levelWords.filter((w) => !progress[w.id]);
    }
    return levelWords;
  }, [allWords, selectedLevel, showOnlyNew, progress]);

  const wordsNotInProgress = useMemo(() => {
    return allWords.filter((w) => w.difficulty_level === selectedLevel && !progress[w.id]);
  }, [allWords, selectedLevel, progress]);

  const levelStats = useMemo(() => {
    return DIFFICULTY_LEVELS.map((level) => {
      const levelWords = allWords.filter((w) => w.difficulty_level === level);
      const inProgress = levelWords.filter((w) => progress[w.id]);
      return {
        level,
        total: levelWords.length,
        learning: inProgress.length,
        emoji: getLevelEmoji(level),
      };
    });
  }, [allWords, progress]);

  return (
    <div className="flex h-full flex-col px-4 pb-28 pt-4">
      <div className="mb-4">
        <h1 className="text-3xl font-black text-slate-950">Explore</h1>
        <p className="mt-1 text-sm text-slate-600">Browse words by level and add them to your study deck</p>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {levelStats.map((stat) => (
          <button
            key={stat.level}
            onClick={() => setSelectedLevel(stat.level)}
            className={`flex min-w-[80px] flex-col items-center rounded-2xl p-3 transition ${
              selectedLevel === stat.level
                ? "bg-slate-950 text-white"
                : "bg-white text-slate-600 shadow-sm"
            }`}
          >
            <span className="text-xl">{stat.emoji}</span>
            <span className="text-sm font-black">{stat.level}</span>
            <span className="text-[10px] font-bold opacity-70">{stat.learning}/{stat.total}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-slate-400" />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlyNew}
              onChange={(e) => setShowOnlyNew(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="font-bold text-slate-700">Show only new</span>
          </label>
        </div>
        {wordsNotInProgress.length > 0 && (
          <button
            onClick={() => onBulkAdd(selectedLevel)}
            className="flex items-center gap-1.5 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Add all {selectedLevel}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {wordsAtLevel.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="mt-4 text-lg font-bold text-slate-700">
              {showOnlyNew ? "All words added!" : "No words at this level"}
            </p>
          </div>
        ) : (
          wordsAtLevel.map((word) => {
            const inProgress = Boolean(progress[word.id]);
            const status = progress[word.id]?.status;
            return (
              <motion.div
                key={word.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-950">{word.word}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getLevelColor(word.difficulty_level)}`}>
                      {word.difficulty_level}
                    </span>
                  </div>
                  <p className="truncate text-sm text-slate-500" dir="rtl">{word.translation}</p>
                  {word.category && (
                    <span className="text-[10px] font-bold text-slate-400 mt-0.5 inline-block">
                      Category: {word.category}
                    </span>
                  )}
                </div>
                {inProgress ? (
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    status === "mastered"
                      ? "bg-emerald-100 text-emerald-700"
                      : status === "learning"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}>
                    {STATUS_LABEL[status ?? "new"]}
                  </span>
                ) : (
                  <button
                    onClick={() => onAddWord(word.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white transition hover:scale-105 active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

type JournalDaySummary = {
  totalReviews: number;
  knownWordIds: string[];
  notYetWordIds: string[];
};

function dayKeyToDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

function summarizeDay(log: StudyLog, dayKey: string): JournalDaySummary {
  const entries = log[dayKey] ?? [];
  const latestByWord = new Map<string, "known" | "not_yet">();
  for (const entry of entries) {
    latestByWord.set(entry.wordId, entry.outcome);
  }

  const knownWordIds: string[] = [];
  const notYetWordIds: string[] = [];
  for (const [wordId, outcome] of latestByWord.entries()) {
    if (outcome === "known") knownWordIds.push(wordId);
    else notYetWordIds.push(wordId);
  }

  return {
    totalReviews: entries.length,
    knownWordIds,
    notYetWordIds,
  };
}

function JournalWordList({
  words,
  tone,
}: {
  words: AppWord[];
  tone: "known" | "not_yet";
}) {
  const toneStyles =
    tone === "known"
      ? "border-emerald-100 bg-emerald-50 text-emerald-800"
      : "border-red-100 bg-red-50 text-red-800";

  return (
    <div className="mt-2 space-y-2">
      {words.map((word) => (
        <div
          key={word.id}
          className={`rounded-xl border px-3 py-2 ${toneStyles}`}
        >
          <p className="font-bold">{word.word}</p>
          <p className="mt-0.5 text-sm opacity-80" dir="rtl">
            {word.translation}
          </p>
        </div>
      ))}
    </div>
  );
}

function JournalScreen({
  studyLog,
  allWords,
  dailyGoal,
  onPracticeDayNotYet,
  onPracticeAllNotYet,
  onPracticeDayKnown,
  onPracticeAllKnown,
}: {
  studyLog: StudyLog;
  allWords: AppWord[];
  dailyGoal: number;
  onPracticeDayNotYet: (dayKey: string) => void;
  onPracticeAllNotYet: () => void;
  onPracticeDayKnown: (dayKey: string) => void;
  onPracticeAllKnown: () => void;
}) {
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const wordsById = useMemo(() => {
    const map = new Map<string, AppWord>();
    for (const word of allWords) map.set(word.id, word);
    return map;
  }, [allWords]);

  const dayKeys = useMemo(() => Object.keys(studyLog).sort(), [studyLog]);
  const selectedDayKey = dayKeyFromDate(selectedDay);
  const selectedSummary = useMemo(
    () => summarizeDay(studyLog, selectedDayKey),
    [selectedDayKey, studyLog],
  );

  const allNotYetIds = useMemo(() => {
    const set = new Set<string>();
    for (const key of dayKeys) {
      const summary = summarizeDay(studyLog, key);
      for (const id of summary.notYetWordIds) set.add(id);
    }
    return Array.from(set);
  }, [dayKeys, studyLog]);

  const allKnownIds = useMemo(() => {
    const set = new Set<string>();
    for (const key of dayKeys) {
      const summary = summarizeDay(studyLog, key);
      for (const id of summary.knownWordIds) set.add(id);
    }
    return Array.from(set);
  }, [dayKeys, studyLog]);

  const dailyStats = useMemo(() => {
    return dayKeys.map((dayKey) => {
      const summary = summarizeDay(studyLog, dayKey);
      return {
        dayKey,
        date: dayKeyToDate(dayKey),
        reviews: summary.totalReviews,
        goalDone: summary.totalReviews >= dailyGoal,
        hasNotYet: summary.notYetWordIds.length > 0,
      };
    });
  }, [dailyGoal, dayKeys, studyLog]);

  const goalDoneDates = dailyStats.filter((d) => d.goalDone).map((d) => d.date);
  const studiedDates = dailyStats.filter((d) => d.reviews > 0 && !d.goalDone).map((d) => d.date);

  const knownWords = selectedSummary.knownWordIds
    .map((id) => wordsById.get(id))
    .filter((value): value is AppWord => Boolean(value));
  const notYetWords = selectedSummary.notYetWordIds
    .map((id) => wordsById.get(id))
    .filter((value): value is AppWord => Boolean(value));

  return (
    <div className="h-full overflow-y-auto px-4 pb-28 pt-4">
      <div className="mb-4">
        <h1 className="text-3xl font-black text-slate-950">Journal</h1>
        <p className="mt-1 text-sm text-slate-600">Track what you knew and what you did not know each day</p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <DayPicker
          mode="single"
          selected={selectedDay}
          onSelect={(day) => day && setSelectedDay(day)}
          modifiers={{
            goalDone: goalDoneDates,
            studied: studiedDates,
          }}
          modifiersClassNames={{
            goalDone: "bg-emerald-500 text-white rounded-full",
            studied: "bg-amber-200 text-slate-900 rounded-full",
          }}
          className="mx-auto"
        />
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1 text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Goal done</span>
          <span className="flex items-center gap-1 text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-amber-300" />Studied</span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase text-slate-500">{selectedDayKey}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-100 p-3 text-center">
            <p className="text-xl font-black">{selectedSummary.totalReviews}</p>
            <p className="text-[10px] font-bold uppercase text-slate-500">Reviews</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 text-center">
            <p className="text-xl font-black text-emerald-700">{knownWords.length}</p>
            <p className="text-[10px] font-bold uppercase text-emerald-700">I know</p>
          </div>
          <div className="rounded-xl bg-red-50 p-3 text-center">
            <p className="text-xl font-black text-red-700">{notYetWords.length}</p>
            <p className="text-[10px] font-bold uppercase text-red-700">Not yet</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          <button
            onClick={() => onPracticeDayNotYet(selectedDayKey)}
            disabled={notYetWords.length === 0}
            className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Practice Not yet (this day)
          </button>
          <button
            onClick={onPracticeAllNotYet}
            disabled={allNotYetIds.length === 0}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Practice Not yet (all days)
          </button>
          <button
            onClick={() => onPracticeDayKnown(selectedDayKey)}
            disabled={knownWords.length === 0}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300"
          >
            Practice I know (this day)
          </button>
          <button
            onClick={onPracticeAllKnown}
            disabled={allKnownIds.length === 0}
            className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Practice I know (all days)
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black text-emerald-700">I know</h3>
          {knownWords.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No words marked as known on this day.</p>
          ) : (
            <JournalWordList words={knownWords} tone="known" />
          )}
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="text-sm font-black text-red-700">Not yet</h3>
          {notYetWords.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No words marked as not yet on this day.</p>
          ) : (
            <JournalWordList words={notYetWords} tone="not_yet" />
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== PROFILE & SETTINGS ====================
function ProfileScreen({
  isSupabaseConfigured,
  onDownloadSeed,
  userProfile,
  dailyGoal,
  onDailyGoalChange,
  onSignIn,
  onSignOut,
  onDeleteAccount,
}: {
  isSupabaseConfigured: boolean;
  onDownloadSeed: () => void;
  userProfile: any;
  dailyGoal: number;
  onDailyGoalChange: (goal: number) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}) {
  const [showFlutter, setShowFlutter] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <div className="flex h-full flex-col px-4 pb-28 pt-4 overflow-y-auto">
      <h1 className="mb-6 text-3xl font-black text-slate-950">Profile & Settings</h1>
      <div className="space-y-4">
        
        {/* User Card with Google Sign In */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              {userProfile?.user_metadata?.avatar_url ? (
                <img
                  src={userProfile.user_metadata.avatar_url}
                  alt="avatar"
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <User className="h-6 w-6 text-slate-600" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-950 truncate">
                {userProfile ? userProfile.email : "Local User"}
              </p>
              <p className="text-xs text-slate-500">
                {userProfile ? "Google Account connected" : "Guest Mode - Local persistence"}
              </p>
            </div>
            {userProfile ? (
              <button
                onClick={onSignOut}
                className="flex items-center justify-center h-10 w-10 rounded-full bg-slate-100 hover:bg-slate-200 transition"
              >
                <LogOut className="h-4 w-4 text-slate-600" />
              </button>
            ) : isSupabaseConfigured ? (
              <button
                onClick={onSignIn}
                className="flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
              >
                Google Log In
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-bold text-slate-950">Daily habit</h3>
          <p className="mb-3 text-xs text-slate-600">
            Aim for a steady session each day. Your streak counts when you hit this goal.
          </p>
          <div className="flex flex-wrap gap-2">
            {DAILY_GOAL_OPTIONS.map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => onDailyGoalChange(goal)}
                className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
                  dailyGoal === goal
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {goal} cards
              </button>
            ))}
          </div>
        </div>

        {/* Sync status */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-bold text-slate-950">Sync Status</h3>
          <div className="flex items-center gap-2 text-sm">
            <Database className="h-4 w-4" />
            <span className={isSupabaseConfigured ? "text-emerald-600" : "text-amber-600"}>
              {isSupabaseConfigured ? "Supabase connected" : "Offline mode (Local storage fallback)"}
            </span>
          </div>
        </div>

        {/* PWA Section */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <img
              src="/icons/icon-192.png"
              alt=""
              className="h-12 w-12 rounded-xl object-cover"
              width={48}
              height={48}
            />
            <h3 className="font-bold text-slate-950">Install LexiLift App</h3>
          </div>
          <p className="text-xs text-slate-600">
            Use &quot;Add to Home Screen&quot; in your browser menu — the app icon matches this logo.
          </p>
        </div>

        {/* General Management */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-bold text-slate-950">App Settings & Actions</h3>
          <div className="space-y-2">
            <button
              onClick={() => setShowPrivacy(!showPrivacy)}
              className="flex w-full items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
            >
              <Shield className="h-4 w-4" />
              Privacy Policy
            </button>

            <button
              onClick={onDeleteAccount}
              className="flex w-full items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700 hover:bg-red-100 transition"
            >
              <Trash2 className="h-4 w-4" />
              Delete Account & Progress
            </button>
          </div>
        </div>

        {/* Privacy modal */}
        {showPrivacy && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600 leading-relaxed max-h-56 overflow-y-auto">
            <h4 className="font-bold text-slate-950 mb-2">Privacy Policy</h4>
            <p className="mb-2"><strong>Data Collection:</strong> We value your privacy. LexiLift SRS caches user learning progress in the client local storage. If Google Authentication is enabled, data is stored in your personal account via Supabase.</p>
            <p className="mb-2"><strong>Delete Account:</strong> You can completely clear your trace and all persisted dictionary progress data at any moment using the "Delete Account" button.</p>
          </div>
        )}

        {/* Flutter code converter */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-bold text-slate-950">Flutter Code Converter</h3>
          <p className="text-xs text-slate-600 mb-3">
            Here is the complete Flutter (Dart) conversion of the LexiLift SRS system. Use this to instantly build exactly as it is for iOS and Android.
          </p>
          <button
            onClick={() => setShowFlutter(!showFlutter)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white transition hover:bg-violet-700"
          >
            {showFlutter ? "Hide Flutter Code" : "Show Flutter Code"}
          </button>
          
          {showFlutter && (
            <div className="mt-4">
              <div className="flex justify-between items-center bg-slate-900 px-4 py-2 rounded-t-xl text-white text-xs font-mono">
                <span>main.dart</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(FLUTTER_DART_CODE);
                    alert("Flutter source code copied to clipboard!");
                  }}
                  className="text-emerald-300 hover:text-emerald-400 font-bold"
                >
                  Copy Code
                </button>
              </div>
              <pre className="max-h-96 overflow-y-auto bg-slate-950 text-emerald-100 p-4 rounded-b-xl font-mono text-xs select-text">
                {FLUTTER_DART_CODE}
              </pre>
            </div>
          )}
        </div>

        {/* Data exporter */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-bold text-slate-950">Data</h3>
          <button
            onClick={onDownloadSeed}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
          >
            <Download className="h-4 w-4" />
            Download seed JSON
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN APP ====================
export default function App() {
  const bootstrapSnapshot = useMemo(() => readBootstrapSnapshot(), []);
  const [localPersistReady, setLocalPersistReady] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [progress, setProgress] = useState<ProgressMap>(() => bootstrapSnapshot.progress);
  const [customWords, setCustomWords] = useState<AppWord[]>(
    () => bootstrapSnapshot.customWords as AppWord[],
  );
  const [settings, setSettings] = useState<AppSettings>(() => bootstrapSnapshot.settings);
  const [habit, setHabit] = useState<HabitStats>(() =>
    normalizeHabitForToday(
      bootstrapSnapshot.habit ?? DEFAULT_HABIT,
      bootstrapSnapshot.settings.dailyGoal,
    ),
  );
  const [studyLog, setStudyLog] = useState<StudyLog>(() => bootstrapSnapshot.studyLog ?? {});
  const [practiceQueueIds, setPracticeQueueIds] = useState<string[] | null>(null);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [quickWord, setQuickWord] = useState("");
  const [quickState, setQuickState] = useState<QuickState>("idle");
  const [quickMessage, setQuickMessage] = useState("Add a word...");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Hydrate from IndexedDB (migrates legacy localStorage on first run).
  useEffect(() => {
    let cancelled = false;

    loadPersistedSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        setProgress((current) => ({ ...snapshot.progress, ...current }));
        setCustomWords((current) => (current.length > 0 ? current : (snapshot.customWords as AppWord[])));
        setSettings((current) => {
          const hasSessionSettings =
            current.isReverse !== false || current.selectedCategory !== "All";
          return hasSessionSettings ? current : snapshot.settings;
        });
        setHabit((current) => {
          const merged = snapshot.habit?.dayKey ? snapshot.habit : current;
          return normalizeHabitForToday(merged, snapshot.settings.dailyGoal);
        });
        setStudyLog(snapshot.studyLog ?? {});
        setLocalPersistReady(true);
      })
      .catch((error) => {
        console.warn("[LexiLift] Could not hydrate from durable storage; keeping bootstrap data", error);
        setLocalPersistReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Check current session via Supabase
  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      const client = supabase;
      client.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUserProfile(session.user);
          // Auto fetch user progress from DB
          client
            .from("user_progress")
            .select("*")
            .eq("user_id", session.user.id)
            .then(({ data }) => {
              if (data) {
                const dbProgress: ProgressMap = {};
                for (const row of data) {
                  dbProgress[row.word_id] = {
                    status: row.status,
                    ease_factor: row.ease_factor,
                    interval: row.interval,
                    next_review: row.next_review,
                    last_reviewed: row.last_reviewed,
                  };
                }
                setProgress((cur) => ({ ...cur, ...dbProgress }));
              }
            });
        }
      });

      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        setUserProfile(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (!localPersistReady) return;

    void persistUserState({
      progress,
      customWords: customWords as PersistedCustomWord[],
      settings,
      habit,
      studyLog,
    });
  }, [progress, customWords, settings, habit, studyLog, localPersistReady]);

  useEffect(() => {
    // If logged in, push updates to DB
    if (!localPersistReady) return;
    if (userProfile && supabase) {
      const client = supabase;
      const updates = Object.entries(progress).map(([word_id, item]) => ({
        user_id: userProfile.id,
        word_id,
        status: item.status,
        ease_factor: item.ease_factor,
        interval: item.interval,
        next_review: item.next_review,
        last_reviewed: item.last_reviewed,
      }));
      if (updates.length > 0) {
        client.from("user_progress").upsert(updates, { onConflict: "user_id,word_id" }).then();
      }
    }
  }, [progress, userProfile, localPersistReady]);

  const allWords = useMemo(
    () =>
      [...seedWords, ...customWords]
        .filter((word, index, words) => words.findIndex((item) => item.id === word.id) === index)
        .sort((a, b) => a.frequency_rank - b.frequency_rank),
    [customWords],
  );

  const now = useMemo(() => new Date(), [progress, customWords]);

  // Shuffle the due words randomly each time shuffleSeed changes.
  // Take Category filter into account
  const deckCount = useMemo(() => Object.keys(progress).length, [progress]);

  const dueWords = useMemo(() => {
    const due = allWords.filter((word) => isStudyDue(progress[word.id], now));
    const catFiltered =
      settings.selectedCategory === "All"
        ? due
        : due.filter((w) => w.category === settings.selectedCategory);
    return shuffleArray(catFiltered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allWords, now, progress, shuffleSeed, settings.selectedCategory]);

  const studyWords = useMemo(() => {
    const goal = settings.dailyGoal;
    const remaining = Math.max(0, goal - habit.reviewsToday);
    const goalMet = habit.reviewsToday >= goal;
    const limit = goalMet
      ? Math.min(dueWords.length, 30)
      : Math.min(dueWords.length, remaining > 0 ? remaining : goal);
    return dueWords.slice(0, limit);
  }, [dueWords, habit.reviewsToday, settings.dailyGoal]);

  const wordsById = useMemo(() => {
    const map = new Map<string, AppWord>();
    for (const word of allWords) map.set(word.id, word);
    return map;
  }, [allWords]);

  const practiceWords = useMemo(() => {
    if (!practiceQueueIds) return [];
    return practiceQueueIds
      .map((id) => wordsById.get(id))
      .filter((value): value is AppWord => Boolean(value));
  }, [practiceQueueIds, wordsById]);

  const activeStudyWords = practiceQueueIds ? practiceWords : studyWords;

  const statusCounts = useMemo(() => {
    return Object.values(progress).reduce<Record<ProgressStatus, number>>(
      (counts, item) => {
        counts[item.status] += 1;
        return counts;
      },
      { new: 0, learning: 0, mastered: 0 },
    );
  }, [progress]);

  const totalWords = allWords.length;
  const knownPercent = deckCount
    ? Math.round((statusCounts.mastered / deckCount) * 100)
    : 0;

  const handleSwipe = (wordId: string, direction: "left" | "right") => {
    const rating: ReviewRating = direction === "right" ? "good" : "again";
    const nextProgress = getNextProgress(progress[wordId], rating);
    setProgress((current) => ({ ...current, [wordId]: nextProgress }));
    setHabit((current) => recordStudyReview(current, settings.dailyGoal));
    setStudyLog((current) => logStudyReview(current, wordId, rating));
    if (practiceQueueIds) {
      setPracticeQueueIds((current) => (current ? current.filter((id) => id !== wordId) : null));
    }
    triggerHaptic(direction === "right" ? "medium" : "light");
  };

  const handleDailyGoalChange = (dailyGoal: number) => {
    setSettings((current) => ({ ...current, dailyGoal }));
    setHabit((current) => normalizeHabitForToday(current, dailyGoal));
  };

  const handlePracticeDayNotYet = (dayKey: string) => {
    const summary = summarizeDay(studyLog, dayKey);
    if (summary.notYetWordIds.length === 0) return;
    setPracticeQueueIds(summary.notYetWordIds);
    setActiveTab("study");
  };

  const handlePracticeAllNotYet = () => {
    const set = new Set<string>();
    for (const dayKey of Object.keys(studyLog)) {
      const summary = summarizeDay(studyLog, dayKey);
      for (const id of summary.notYetWordIds) set.add(id);
    }
    const ids = Array.from(set);
    if (ids.length === 0) return;
    setPracticeQueueIds(ids);
    setActiveTab("study");
  };

  const handlePracticeDayKnown = (dayKey: string) => {
    const summary = summarizeDay(studyLog, dayKey);
    if (summary.knownWordIds.length === 0) return;
    setPracticeQueueIds(summary.knownWordIds);
    setActiveTab("study");
  };

  const handlePracticeAllKnown = () => {
    const set = new Set<string>();
    for (const dayKey of Object.keys(studyLog)) {
      const summary = summarizeDay(studyLog, dayKey);
      for (const id of summary.knownWordIds) set.add(id);
    }
    const ids = Array.from(set);
    if (ids.length === 0) return;
    setPracticeQueueIds(ids);
    setActiveTab("study");
  };

  const handleAddWord = (wordId: string) => {
    setProgress((current) => ({
      ...current,
      [wordId]: current[wordId] ?? getInitialProgress(),
    }));
    triggerHaptic("light");
  };

  const handleBulkAdd = (level: DifficultyLevel) => {
    const wordsToAdd = allWords.filter((w) => w.difficulty_level === level && !progress[w.id]);
    setProgress((current) => {
      const updated = { ...current };
      for (const word of wordsToAdd) {
        updated[word.id] = getInitialProgress();
      }
      return updated;
    });
    triggerHaptic("medium");
  };

  const handleShuffle = () => {
    setShuffleSeed((s) => s + 1);
    triggerHaptic("light");
  };

  const handleToggleReverse = () => {
    setSettings((s) => ({ ...s, isReverse: !s.isReverse }));
    triggerHaptic("light");
  };

  const handleToggleCategory = (cat: Category | "All") => {
    setSettings((s) => ({ ...s, selectedCategory: cat }));
    triggerHaptic("light");
  };

  const handleQuickAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = quickWord.trim();
    if (!value) return;

    setQuickState("loading");
    setQuickMessage("Looking...");

    const existing = allWords.find((word) => word.word.toLowerCase() === value.toLowerCase());
    if (existing) {
      handleAddWord(existing.id);
      setQuickState("linked");
      setQuickMessage(`${existing.word} linked!`);
      setQuickWord("");
      return;
    }

    try {
      setQuickMessage("Generating...");
      const word = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      const generated: AppWord = {
        id: toWordId(word),
        word,
        translation: fallbackTranslations[value.toLowerCase()] ?? "תרגום יתווסף",
        difficulty_level: "B1",
        frequency_rank: allWords.length + 1,
        phonetic: "/.../",
        example_sentence: `I want to remember the word ${word.toLowerCase()}.`,
        custom: true,
      };
      setCustomWords((current) => [generated, ...current.filter((w) => w.id !== generated.id)]);
      handleAddWord(generated.id);
      setQuickState("created");
      setQuickMessage(`${generated.word} added!`);
      setQuickWord("");
    } catch {
      setQuickState("error");
      setQuickMessage("Failed to add");
    }
  };

  const resetDemo = () => {
    setProgress({});
    setCustomWords([]);
    setHabit(DEFAULT_HABIT);
    setStudyLog({});
    setPracticeQueueIds(null);
    setQuickState("idle");
    setQuickMessage("Progress reset");
    void clearAllLocalUserData();
  };

  const handleGoogleSignIn = () => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.signInWithOAuth({ provider: "google" }).then();
    }
  };

  const handleSignOut = () => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.signOut().then(() => {
        setUserProfile(null);
        setProgress({});
        void clearPersistedProgress();
      });
    }
  };

  const handleDeleteAccount = () => {
    if (confirm("Are you sure you want to delete all account data? This clears all personal progress permanently.")) {
      if (userProfile && supabase) {
        supabase
          .from("user_progress")
          .delete()
          .eq("user_id", userProfile.id)
          .then(() => {
            handleSignOut();
          });
      } else {
        resetDemo();
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f5efe4] text-slate-950">
      <main className="h-screen overflow-hidden pt-safe">
        <AnimatePresence mode="wait">
          {activeTab === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full overflow-y-auto"
            >
              <HomeScreen
                statusCounts={statusCounts}
                totalWords={totalWords}
                knownPercent={knownPercent}
                dueWords={dueWords}
                studyQueueCount={studyWords.length}
                habit={habit}
                dailyGoal={settings.dailyGoal}
                deckCount={deckCount}
                customWords={customWords}
                onStartStudy={() => setActiveTab("study")}
                onReset={resetDemo}
              />
            </motion.div>
          )}

          {activeTab === "study" && (
            <motion.div
              key="study"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full"
            >
              <StudyScreen
                dueWords={activeStudyWords}
                progress={progress}
                onSwipe={handleSwipe}
                isReverse={settings.isReverse}
                onToggleReverse={handleToggleReverse}
                onShuffle={handleShuffle}
                selectedCategory={settings.selectedCategory}
                onToggleCategory={handleToggleCategory}
                practiceMode={Boolean(practiceQueueIds)}
                onExitPractice={() => {
                  setPracticeQueueIds(null);
                  setActiveTab("journal");
                }}
              />
            </motion.div>
          )}

          {activeTab === "explore" && (
            <motion.div
              key="explore"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full overflow-y-auto"
            >
              <ExploreScreen
                allWords={allWords}
                progress={progress}
                onAddWord={handleAddWord}
                onBulkAdd={handleBulkAdd}
              />
            </motion.div>
          )}

          {activeTab === "profile" && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full overflow-y-auto"
            >
              <ProfileScreen
                isSupabaseConfigured={isSupabaseConfigured}
                onDownloadSeed={() => {
                  const blob = new Blob([`${JSON.stringify(ALL_WORDS, null, 2)}\n`], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "initial_words.json";
                  link.click();
                  URL.revokeObjectURL(url);
                }}
                userProfile={userProfile}
                dailyGoal={settings.dailyGoal}
                onDailyGoalChange={handleDailyGoalChange}
                onSignIn={handleGoogleSignIn}
                onSignOut={handleSignOut}
                onDeleteAccount={handleDeleteAccount}
              />
            </motion.div>
          )}

          {activeTab === "journal" && (
            <motion.div
              key="journal"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full"
            >
              <JournalScreen
                studyLog={studyLog}
                allWords={allWords}
                dailyGoal={settings.dailyGoal}
                onPracticeDayNotYet={handlePracticeDayNotYet}
                onPracticeAllNotYet={handlePracticeAllNotYet}
                onPracticeDayKnown={handlePracticeDayKnown}
                onPracticeAllKnown={handlePracticeAllKnown}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Quick Add FAB */}
      <button
        onClick={() => setShowQuickAdd(true)}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-xl transition hover:scale-105 active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Quick Add Modal */}
      <AnimatePresence>
        {showQuickAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
            onClick={() => setShowQuickAdd(false)}
          >
            <motion.form
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onSubmit={handleQuickAdd}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-black">Quick Add</h3>
                <button type="button" onClick={() => setShowQuickAdd(false)} className="rounded-full p-2 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <input
                value={quickWord}
                onChange={(e) => { setQuickWord(e.target.value); if (quickState !== "loading") setQuickState("idle"); }}
                placeholder="Enter an English word"
                className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-lg font-bold outline-none focus:border-slate-950"
                autoFocus
              />
              <p className="mt-2 text-sm text-slate-500" dir="auto">{quickMessage}</p>
              <button
                type="submit"
                disabled={quickState === "loading" || !quickWord.trim()}
                className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-lg font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {quickState === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                Add Word
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
