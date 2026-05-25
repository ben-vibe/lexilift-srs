import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import {
  BookOpen,
  Brain,
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
  Sparkles,
  Trophy,
  User,
  Volume2,
  Wand2,
  X,
  ArrowLeftRight,
  Filter,
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
  type PersistedCustomWord,
} from "./lib/localPersistence";
import {
  getInitialProgress,
  getNextProgress,
  isDue,
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

type Tab = "home" | "study" | "explore" | "profile";
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
          LEARN
        </div>
      </motion.div>

      <motion.div
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end rounded-3xl bg-emerald-500/90 p-6"
        style={{ opacity: opacityRight }}
      >
        <div className="flex items-center gap-2 text-2xl font-black text-white">
          KNOW
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
              Status: {progress?.status || "new"} • Interval: {progress?.interval || 0}d
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
}: {
  dueWords: AppWord[];
  progress: ProgressMap;
  onSwipe: (wordId: string, direction: "left" | "right") => void;
  isReverse: boolean;
  onToggleReverse: () => void;
  onShuffle: () => void;
  selectedCategory: Category | "All";
  onToggleCategory: (cat: Category | "All") => void;
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
        <p className="mt-2 text-slate-600">No cards due for review. Adjust category or check back later.</p>
        
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
          <span className="text-sm font-bold text-slate-600">{dueWords.length} cards remaining</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onShuffle}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-slate-100"
              title="Shuffle cards"
            >
              <Shuffle className="h-4 w-4" />
            </button>
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
          <p>Don't know</p>
          <p className="mt-0.5">Know</p>
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
  masteredPercent,
  dueWords,
  studiedToday,
  customWords,
  onStartStudy,
  onReset,
}: {
  statusCounts: Record<ProgressStatus, number>;
  totalWords: number;
  masteredPercent: number;
  dueWords: AppWord[];
  studiedToday: number;
  customWords: AppWord[];
  onStartStudy: () => void;
  onReset: () => void;
}) {
  const progressRows = [
    { status: "new" as const, label: "New", icon: Layers3, color: "bg-slate-950", count: statusCounts.new },
    { status: "learning" as const, label: "Learning", icon: Brain, color: "bg-amber-400", count: statusCounts.learning },
    { status: "mastered" as const, label: "Mastered", icon: Trophy, color: "bg-emerald-500", count: statusCounts.mastered },
  ];

  return (
    <div className="flex h-full flex-col px-4 pb-28 pt-4">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Sparkles className="h-4 w-4" />
          LexiLift SRS
        </div>
        <h1 className="text-4xl font-black text-slate-950">Dashboard</h1>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-slate-950 p-5 text-white">
          <p className="text-sm font-medium text-white/60">Mastered</p>
          <p className="mt-1 text-4xl font-black">{masteredPercent}%</p>
        </div>
        <div className="rounded-2xl bg-emerald-100 p-5 text-emerald-900">
          <p className="text-sm font-medium text-emerald-700">Due now</p>
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
          <p className="mt-2 text-xl font-black">{studiedToday}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400">Today</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <Wand2 className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-2 text-xl font-black">{customWords.length}</p>
          <p className="text-[10px] font-bold uppercase text-slate-400">Custom</p>
        </div>
      </div>

      <button
        onClick={onStartStudy}
        disabled={dueWords.length === 0}
        className="mt-auto flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-lg font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <BookOpen className="h-5 w-5" />
        {dueWords.length > 0 ? `Study ${dueWords.length} cards` : "No cards due"}
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
                    {status}
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

// ==================== PROFILE & SETTINGS ====================
function ProfileScreen({
  isSupabaseConfigured,
  onDownloadSeed,
  userProfile,
  onSignIn,
  onSignOut,
  onDeleteAccount,
}: {
  isSupabaseConfigured: boolean;
  onDownloadSeed: () => void;
  userProfile: any;
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
          <h3 className="mb-3 font-bold text-slate-950">Install PWA App</h3>
          <p className="text-xs text-slate-600">
            For native-like Google Play Store mobile experience, use "Add to Home Screen" option in your browser menu.
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
    });
  }, [progress, customWords, settings, localPersistReady]);

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
  const dueWords = useMemo(() => {
    const due = allWords.filter((word) => isDue(progress[word.id], now));
    const catFiltered =
      settings.selectedCategory === "All"
        ? due
        : due.filter((w) => w.category === settings.selectedCategory);
    return shuffleArray(catFiltered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allWords, now, progress, shuffleSeed, settings.selectedCategory]);

  const statusCounts = useMemo(() => {
    return allWords.reduce<Record<ProgressStatus, number>>(
      (counts, word) => {
        const status = progress[word.id]?.status ?? "new";
        counts[status] += 1;
        return counts;
      },
      { new: 0, learning: 0, mastered: 0 },
    );
  }, [allWords, progress]);

  const studiedToday = useMemo(() => {
    const today = new Date().toDateString();
    return Object.values(progress).filter((item) => {
      if (!item.last_reviewed) return false;
      return new Date(item.last_reviewed).toDateString() === today;
    }).length;
  }, [progress]);

  const totalWords = allWords.length;
  const masteredPercent = totalWords ? Math.round((statusCounts.mastered / totalWords) * 100) : 0;

  const handleSwipe = (wordId: string, direction: "left" | "right") => {
    const rating: ReviewRating = direction === "right" ? "good" : "again";
    setProgress((current) => ({
      ...current,
      [wordId]: getNextProgress(current[wordId], rating),
    }));
    triggerHaptic(direction === "right" ? "medium" : "light");
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
                masteredPercent={masteredPercent}
                dueWords={dueWords}
                studiedToday={studiedToday}
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
                dueWords={dueWords}
                progress={progress}
                onSwipe={handleSwipe}
                isReverse={settings.isReverse}
                onToggleReverse={handleToggleReverse}
                onShuffle={handleShuffle}
                selectedCategory={settings.selectedCategory}
                onToggleCategory={handleToggleCategory}
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
                onSignIn={handleGoogleSignIn}
                onSignOut={handleSignOut}
                onDeleteAccount={handleDeleteAccount}
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
