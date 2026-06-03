import {
  ArrowLeft,
  BookOpenText,
  ChevronDown,
  Clock3,
  ClipboardType,
  FileText,
  Keyboard,
  Pause,
  Play,
  RefreshCw,
  Search,
  TrendingUp,
  Volume2,
  VolumeX
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent
} from "react";
import {
  createCustomContent,
  essayContents,
  getRandomTimedContent,
  normalizeTypingText
} from "./data/typingContent";
import { ResultsPanel } from "./components/ResultsPanel";
import { TypingSurface } from "./components/TypingSurface";
import { useTypingSounds } from "./hooks/useTypingSounds";
import {
  backspace,
  completeTimedSession,
  createTypingSession,
  getMistakeHotspots,
  getProgress,
  getStats,
  isCompleted,
  isPrintableKey,
  ONE_MINUTE_MS,
  pauseSession,
  resumeSession,
  THREE_MINUTES_MS,
  typeCharacter
} from "./typing/typingEngine";
import type {
  ChallengeMode,
  TypedCharacter,
  TypingContent,
  TypingSession
} from "./typing/types";

function formatTime(mode: ChallengeMode, elapsedMs: number, durationMs: number) {
  const formatClock = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  if (mode === "timed") {
    const remainingSeconds = Math.max(
      0,
      Math.ceil((durationMs - elapsedMs) / 1000)
    );

    return formatClock(remainingSeconds);
  }

  const totalSeconds = Math.floor(elapsedMs / 1000);
  return formatClock(totalSeconds);
}

function getEssayContent(selectedEssayId: string): TypingContent {
  return (
    essayContents.find((content) => content.id === selectedEssayId) ??
    essayContents[0]
  );
}

function getTypedCharacter(key: string) {
  return key === "Enter" ? "\n" : key;
}

function formatDurationLabel(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

type AppRoute = "home" | "typing";

type LastPractice =
  | {
      mode: "timed";
      durationMs: number;
    }
  | {
      mode: "essay";
      essayId: string;
    };

type EssayJourneyFilter = "all" | "saved" | "unstarted" | "finished";

type EssayJourneyState = Exclude<EssayJourneyFilter, "all">;

type PracticeResult = {
  id: string;
  practiceKey: string;
  mode: ChallengeMode;
  title: string;
  completedAt: number;
  durationMs: number;
  elapsedMs: number;
  wpm: number;
  accuracy: number;
  typos: number;
  typedChars: number;
  essayId?: string;
  sourceEssayId?: string;
};

const LAST_PRACTICE_STORAGE_KEY = "typingjourney:last-practice";
const PERSONAL_BESTS_STORAGE_KEY = "typingjourney:personal-bests";
const ESSAY_PROGRESS_STORAGE_KEY = "typingjourney:essay-progress";
const SESSION_HISTORY_STORAGE_KEY = "typingjourney:session-history";
const ESSAY_IDLE_AUTO_PAUSE_MS = 15_000;
const CUSTOM_TEXT_MIN_LENGTH = 40;
const SESSION_HISTORY_LIMIT = 80;

type EssayBest = {
  elapsedMs: number;
  wpm: number;
  completedAt: number;
};

type PersonalBests = {
  timed: Partial<Record<"60000" | "180000", number>>;
  essays: Record<string, EssayBest>;
};

type StoredEssayProgress = {
  essayId: string;
  entries: TypedCharacter[];
  mistakes: TypedCharacter[];
  inputChars: number;
  correctInputChars: number;
  elapsedMs: number;
  updatedAt: number;
};

type StoredEssayProgresses = Record<string, StoredEssayProgress>;

const EMPTY_PERSONAL_BESTS: PersonalBests = {
  timed: {},
  essays: {}
};

function getCurrentRoute(): AppRoute {
  return window.location.pathname === "/typing" ? "typing" : "home";
}

function updateBrowserRoute(
  path: "/" | "/typing",
  action: "push" | "replace" = "push"
) {
  if (window.location.pathname === path) {
    return;
  }

  if (action === "replace") {
    window.history.replaceState({}, "", path);
    return;
  }

  window.history.pushState({}, "", path);
}

function storeLastPractice(practice: LastPractice) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      LAST_PRACTICE_STORAGE_KEY,
      JSON.stringify(practice)
    );
  } catch {
    // The app still works when local storage is unavailable.
  }
}

function clearLastPractice() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(LAST_PRACTICE_STORAGE_KEY);
  } catch {
    // Last practice is a convenience; custom practice can continue without it.
  }
}

function getStoredLastPractice(): LastPractice | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedPractice = window.localStorage.getItem(
      LAST_PRACTICE_STORAGE_KEY
    );

    if (!storedPractice) {
      return null;
    }

    const parsedPractice = JSON.parse(storedPractice) as Partial<LastPractice>;

    if (
      parsedPractice.mode === "timed" &&
      (parsedPractice.durationMs === ONE_MINUTE_MS ||
        parsedPractice.durationMs === THREE_MINUTES_MS)
    ) {
      return {
        mode: "timed",
        durationMs: parsedPractice.durationMs
      };
    }

    if (
      parsedPractice.mode === "essay" &&
      typeof parsedPractice.essayId === "string" &&
      essayContents.some((content) => content.id === parsedPractice.essayId)
    ) {
      return {
        mode: "essay",
        essayId: parsedPractice.essayId
      };
    }
  } catch {
    return null;
  }

  return null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getNonNegativeNumber(value: unknown) {
  return isFiniteNumber(value) ? Math.max(0, value) : null;
}

function getNonNegativeInteger(value: unknown) {
  return isFiniteNumber(value) ? Math.max(0, Math.floor(value)) : null;
}

function clampPercentage(value: unknown) {
  return isFiniteNumber(value) ? Math.min(100, Math.max(0, value)) : null;
}

function isKnownEssayId(essayId: string) {
  return essayContents.some((content) => content.id === essayId);
}

function parseStoredEssayBest(value: unknown): EssayBest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const best = value as Partial<EssayBest>;
  const elapsedMs = getNonNegativeNumber(best.elapsedMs);
  const wpm = getNonNegativeNumber(best.wpm);
  const completedAt = getNonNegativeNumber(best.completedAt);

  if (elapsedMs === null || wpm === null || completedAt === null) {
    return null;
  }

  return {
    elapsedMs,
    wpm,
    completedAt
  };
}

function getStoredPersonalBests(): PersonalBests {
  if (typeof window === "undefined") {
    return EMPTY_PERSONAL_BESTS;
  }

  try {
    const storedBests = window.localStorage.getItem(PERSONAL_BESTS_STORAGE_KEY);

    if (!storedBests) {
      return EMPTY_PERSONAL_BESTS;
    }

    const parsedBests = JSON.parse(storedBests) as Partial<PersonalBests>;
    const essayBestEntries =
      parsedBests.essays && typeof parsedBests.essays === "object"
        ? Object.entries(parsedBests.essays).flatMap(([essayId, best]) => {
            const parsedBest = parseStoredEssayBest(best);

            return isKnownEssayId(essayId) && parsedBest
              ? [[essayId, parsedBest] satisfies [string, EssayBest]]
              : [];
          })
        : [];
    const oneMinuteBest = getNonNegativeNumber(parsedBests.timed?.["60000"]);
    const threeMinuteBest = getNonNegativeNumber(parsedBests.timed?.["180000"]);

    return {
      timed: {
        "60000": oneMinuteBest ?? undefined,
        "180000": threeMinuteBest ?? undefined
      },
      essays: Object.fromEntries(essayBestEntries)
    };
  } catch {
    return EMPTY_PERSONAL_BESTS;
  }
}

function storePersonalBests(bests: PersonalBests) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      PERSONAL_BESTS_STORAGE_KEY,
      JSON.stringify(bests)
    );
  } catch {
    // Personal bests are progressive enhancement; practice still works.
  }
}

function parseStoredPracticeResult(value: unknown): PracticeResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const result = value as Partial<PracticeResult> & { errors?: unknown };
  const durationMs = getNonNegativeNumber(result.durationMs);
  const elapsedMs = getNonNegativeNumber(result.elapsedMs);
  const wpm = getNonNegativeNumber(result.wpm);
  const accuracy = clampPercentage(result.accuracy);
  const typos = getNonNegativeInteger(result.typos ?? result.errors);
  const typedChars = getNonNegativeInteger(result.typedChars);
  const completedAt = getNonNegativeNumber(result.completedAt);

  if (
    typeof result.id !== "string" ||
    result.id.trim().length === 0 ||
    typeof result.practiceKey !== "string" ||
    result.practiceKey.trim().length === 0 ||
    (result.mode !== "timed" &&
      result.mode !== "essay" &&
      result.mode !== "custom") ||
    durationMs === null ||
    elapsedMs === null ||
    wpm === null ||
    accuracy === null ||
    typos === null ||
    typedChars === null ||
    completedAt === null
  ) {
    return null;
  }

  return {
    id: result.id,
    practiceKey: result.practiceKey,
    mode: result.mode,
    title:
      typeof result.title === "string" && result.title.trim()
        ? result.title
        : "Untitled practice",
    completedAt,
    durationMs,
    elapsedMs,
    wpm,
    accuracy,
    typos,
    typedChars,
    essayId:
      typeof result.essayId === "string" && isKnownEssayId(result.essayId)
        ? result.essayId
        : undefined,
    sourceEssayId:
      typeof result.sourceEssayId === "string" ? result.sourceEssayId : undefined
  };
}

function getStoredSessionHistory(): PracticeResult[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedHistory = window.localStorage.getItem(
      SESSION_HISTORY_STORAGE_KEY
    );

    if (!storedHistory) {
      return [];
    }

    const parsedHistory = JSON.parse(storedHistory);

    if (!Array.isArray(parsedHistory)) {
      return [];
    }

    const sortedHistory = parsedHistory
      .flatMap((result) => {
        const parsedResult = parseStoredPracticeResult(result);

        return parsedResult ? [parsedResult] : [];
      })
      .sort((a, b) => b.completedAt - a.completedAt);
    const uniqueHistory = new Map<string, PracticeResult>();

    for (const result of sortedHistory) {
      if (!uniqueHistory.has(result.id)) {
        uniqueHistory.set(result.id, result);
      }
    }

    return Array.from(uniqueHistory.values()).slice(0, SESSION_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function storeSessionHistory(history: PracticeResult[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      SESSION_HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, SESSION_HISTORY_LIMIT))
    );
  } catch {
    // History is local-only progress context; practice still works.
  }
}

function getPracticeKey(
  mode: ChallengeMode,
  content: TypingContent,
  durationMs: number
) {
  if (mode === "timed") {
    return `timed:${durationMs}`;
  }

  return `${mode}:${content.id}`;
}

function getResultId(
  mode: ChallengeMode,
  contentId: string,
  startedAt: number | null,
  finishedAt: number | null
) {
  return [mode, contentId, startedAt ?? "idle", finishedAt ?? "complete"].join(
    ":"
  );
}

function createPracticeResult({
  content,
  durationMs,
  mode,
  resultId,
  stats
}: {
  content: TypingContent;
  durationMs: number;
  mode: ChallengeMode;
  resultId: string;
  stats: ReturnType<typeof getStats>;
}): PracticeResult {
  return {
    id: resultId,
    practiceKey: getPracticeKey(mode, content, durationMs),
    mode,
    title: content.title,
    completedAt: Date.now(),
    durationMs,
    elapsedMs: stats.elapsedMs,
    wpm: stats.wpm,
    accuracy: stats.accuracy,
    typos: stats.typos,
    typedChars: stats.typedChars,
    essayId: mode === "essay" ? content.id : undefined,
    sourceEssayId: content.sourceEssayId
  };
}

function isStoredTypedCharacter(value: unknown): value is TypedCharacter {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<TypedCharacter>;

  return (
    typeof entry.expected === "string" &&
    typeof entry.actual === "string" &&
    typeof entry.correct === "boolean"
  );
}

function getStoredEssayProgresses(): StoredEssayProgresses {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedProgress = window.localStorage.getItem(
      ESSAY_PROGRESS_STORAGE_KEY
    );

    if (!storedProgress) {
      return {};
    }

    const parsedProgress = JSON.parse(storedProgress);

    if (!parsedProgress || typeof parsedProgress !== "object") {
      return {};
    }

    const progressEntries = Object.entries(parsedProgress).flatMap(
      ([essayId, progress]) => {
        if (!progress || typeof progress !== "object") {
          return [];
        }

        const candidate = progress as Partial<StoredEssayProgress>;

        if (
          typeof candidate.essayId !== "string" ||
          candidate.essayId !== essayId ||
          !Array.isArray(candidate.entries) ||
          !Array.isArray(candidate.mistakes) ||
          typeof candidate.elapsedMs !== "number" ||
          typeof candidate.updatedAt !== "number"
        ) {
          return [];
        }

        const entries = candidate.entries.filter(isStoredTypedCharacter);
        const mistakes = candidate.mistakes.filter(isStoredTypedCharacter);
        const storedInputChars = getNonNegativeInteger(candidate.inputChars);
        const storedCorrectInputChars = getNonNegativeInteger(
          candidate.correctInputChars
        );
        const finalCorrectChars = entries.filter(
          (entry) => entry.correct
        ).length;
        const finalTypos = entries.filter((entry) => !entry.correct).length;
        const legacyInputChars =
          entries.length + Math.max(0, mistakes.length - finalTypos);
        const inputChars = Math.max(
          entries.length,
          storedInputChars ?? legacyInputChars
        );
        const fallbackCorrectInputChars =
          storedInputChars === null
            ? finalCorrectChars
            : Math.max(finalCorrectChars, inputChars - mistakes.length);
        const correctInputChars = Math.min(
          inputChars,
          Math.max(
            finalCorrectChars,
            storedCorrectInputChars ?? fallbackCorrectInputChars
          )
        );

        return [
          [
            essayId,
            {
              essayId,
              entries,
              mistakes,
              inputChars,
              correctInputChars,
              elapsedMs: Math.max(0, candidate.elapsedMs),
              updatedAt: candidate.updatedAt
            }
          ] satisfies [string, StoredEssayProgress]
        ];
      }
    );

    return Object.fromEntries(progressEntries);
  } catch {
    return {};
  }
}

function storeEssayProgresses(progresses: StoredEssayProgresses) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      ESSAY_PROGRESS_STORAGE_KEY,
      JSON.stringify(progresses)
    );
  } catch {
    // Essay progress is helpful, but typing should continue without it.
  }
}

function getRestorableEssayProgress(
  content: TypingContent,
  progress?: StoredEssayProgress
) {
  if (!progress || progress.entries.length === 0) {
    return null;
  }

  const entries = progress.entries.slice(0, content.text.length);
  const matchesEssayText = entries.every(
    (entry, index) => entry.expected === content.text[index]
  );

  if (!matchesEssayText || entries.length >= content.text.length) {
    return null;
  }

  return {
    ...progress,
    entries
  };
}

function createStoredEssayProgress(
  essayId: string,
  session: TypingSession,
  nowMs: number
): StoredEssayProgress | null {
  if (
    session.mode !== "essay" ||
    session.entries.length === 0 ||
    session.finishedAt !== null
  ) {
    return null;
  }

  return {
    essayId,
    entries: session.entries,
    mistakes: session.mistakes,
    inputChars: session.inputChars,
    correctInputChars: session.correctInputChars,
    elapsedMs: getStats(session, nowMs).elapsedMs,
    updatedAt: nowMs
  };
}

function createPausedEssaySessionFromProgress(
  content: TypingContent,
  progress: StoredEssayProgress,
  nowMs: number
): TypingSession {
  return {
    ...createTypingSession({
      mode: "essay",
      text: content.text,
      durationMs: ONE_MINUTE_MS
    }),
    entries: progress.entries,
    mistakes: progress.mistakes,
    inputChars: progress.inputChars,
    correctInputChars: progress.correctInputChars,
    startedAt: nowMs - progress.elapsedMs,
    pausedAt: nowMs
  };
}

function updateStoredEssayProgress(
  progresses: StoredEssayProgresses,
  essayId: string,
  progress: StoredEssayProgress | null
) {
  const nextProgresses = { ...progresses };

  if (progress) {
    nextProgresses[essayId] = progress;
  } else {
    delete nextProgresses[essayId];
  }

  return nextProgresses;
}

function formatSavedEssayProgress(
  content: TypingContent,
  progress?: StoredEssayProgress
) {
  const restorableProgress = getRestorableEssayProgress(content, progress);

  if (!restorableProgress) {
    return null;
  }

  const percentComplete = Math.max(
    1,
    Math.round((restorableProgress.entries.length / content.text.length) * 100)
  );

  return `${percentComplete}% saved`;
}

function getEssayJourneyState(
  content: TypingContent,
  best?: EssayBest,
  progress?: StoredEssayProgress
): EssayJourneyState {
  if (getRestorableEssayProgress(content, progress)) {
    return "saved";
  }

  return best ? "finished" : "unstarted";
}

function formatEssayJourneyState(state: EssayJourneyState) {
  if (state === "saved") {
    return "In progress";
  }

  if (state === "finished") {
    return "Finished";
  }

  return "Unstarted";
}

function formatBestWpm(bestWpm?: number) {
  return bestWpm === undefined
    ? "No best yet"
    : `Best ${Math.round(bestWpm)} WPM`;
}

function formatBestTime(best?: EssayBest) {
  return best
    ? `Best ${formatDurationLabel(best.elapsedMs)}`
    : "No best time yet";
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatModeLabel(mode: ChallengeMode) {
  if (mode === "timed") {
    return "Timed";
  }

  if (mode === "custom") {
    return "Custom";
  }

  return "Essay";
}

function formatHistoryTrendLabel(results: PracticeResult[]) {
  if (results.length === 0) {
    return "Recent WPM trend: no sessions yet.";
  }

  if (results.length === 1) {
    return `Recent WPM trend: one session at ${Math.round(
      results[0].wpm
    )} WPM.`;
  }

  return `Recent WPM trend from oldest to newest: ${results
    .map((result) => `${Math.round(result.wpm)} WPM`)
    .join(", ")}.`;
}

function getResultBadge({
  mode,
  previousResults,
  stats
}: {
  mode: ChallengeMode;
  previousResults: PracticeResult[];
  stats: ReturnType<typeof getStats>;
}) {
  const bestRun =
    mode === "essay"
      ? previousResults.reduce<PracticeResult | null>(
          (best, result) =>
            !best || result.elapsedMs < best.elapsedMs ? result : best,
          null
        )
      : previousResults.reduce<PracticeResult | null>(
          (best, result) => (!best || result.wpm > best.wpm ? result : best),
          null
        );
  const isNewBest =
    !bestRun ||
    (mode === "essay"
      ? stats.elapsedMs < bestRun.elapsedMs
      : stats.wpm > bestRun.wpm);

  if (!isNewBest) {
    return "Completed";
  }

  return mode === "essay" ? "New best time" : "New best WPM";
}

type ResetSessionOptions = {
  nextMode?: ChallengeMode;
  durationMs?: number;
  content?: TypingContent;
  restoredSession?: TypingSession;
  clearSavedProgress?: boolean;
};

type InitialPracticeState = {
  mode: ChallengeMode;
  timedDurationMs: number;
  timedContent: TypingContent;
  selectedEssayId: string;
  essayProgresses: StoredEssayProgresses;
  session: TypingSession;
};

function createInitialPracticeState(): InitialPracticeState {
  const essayProgresses = getStoredEssayProgresses();
  const lastPractice = getStoredLastPractice();
  const nowMs = Date.now();

  if (lastPractice?.mode === "essay") {
    const content = getEssayContent(lastPractice.essayId);
    const savedProgress = getRestorableEssayProgress(
      content,
      essayProgresses[content.id]
    );
    const session = savedProgress
      ? createPausedEssaySessionFromProgress(content, savedProgress, nowMs)
      : createTypingSession({
          mode: "essay",
          text: content.text,
          durationMs: ONE_MINUTE_MS
        });

    return {
      mode: "essay",
      timedDurationMs: ONE_MINUTE_MS,
      timedContent: getRandomTimedContent(ONE_MINUTE_MS),
      selectedEssayId: content.id,
      essayProgresses,
      session
    };
  }

  const timedDurationMs =
    lastPractice?.mode === "timed"
      ? lastPractice.durationMs
      : ONE_MINUTE_MS;
  const timedContent = getRandomTimedContent(timedDurationMs);

  return {
    mode: "timed",
    timedDurationMs,
    timedContent,
    selectedEssayId: essayContents[0].id,
    essayProgresses,
    session: createTypingSession({
      mode: "timed",
      text: timedContent.text,
      durationMs: timedDurationMs
    })
  };
}

export function App() {
  const [initialPracticeState] = useState(() => createInitialPracticeState());
  const [mode, setMode] = useState<ChallengeMode>(initialPracticeState.mode);
  const [timedDurationMs, setTimedDurationMs] = useState(
    initialPracticeState.timedDurationMs
  );
  const [timedContent, setTimedContent] = useState(
    initialPracticeState.timedContent
  );
  const [selectedEssayId, setSelectedEssayId] = useState(
    initialPracticeState.selectedEssayId
  );
  const [customContent, setCustomContent] = useState<TypingContent | null>(
    null
  );
  const [essayPickerOpen, setEssayPickerOpen] = useState(false);
  const [essaySearchQuery, setEssaySearchQuery] = useState("");
  const [essayJourneyFilter, setEssayJourneyFilter] =
    useState<EssayJourneyFilter>("all");
  const [customTextOpen, setCustomTextOpen] = useState(false);
  const [customTextDraft, setCustomTextDraft] = useState("");
  const [personalBests, setPersonalBests] = useState<PersonalBests>(() =>
    getStoredPersonalBests()
  );
  const [sessionHistory, setSessionHistory] = useState<PracticeResult[]>(() =>
    getStoredSessionHistory()
  );
  const [essayProgresses, setEssayProgresses] =
    useState<StoredEssayProgresses>(initialPracticeState.essayProgresses);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [route, setRoute] = useState<AppRoute>(() => getCurrentRoute());
  const [session, setSession] = useState<TypingSession>(
    initialPracticeState.session
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const essaySearchRef = useRef<HTMLInputElement | null>(null);
  const sessionRef = useRef(session);
  const essayProgressesRef = useRef(essayProgresses);
  const completionPlayedRef = useRef(false);
  const recordedResultRef = useRef<string | null>(null);
  const playSound = useTypingSounds(soundEnabled);

  const selectedEssayContent = useMemo(
    () => getEssayContent(selectedEssayId),
    [selectedEssayId]
  );

  const activeContent =
    mode === "timed"
      ? timedContent
      : mode === "custom"
        ? customContent ?? selectedEssayContent
        : selectedEssayContent;

  const stats = getStats(session, nowMs);
  const mistakeHotspots = useMemo(() => getMistakeHotspots(session), [session]);
  const progress = Math.min(1, Math.max(0, getProgress(session, nowMs)));
  const timeLabel = formatTime(mode, stats.elapsedMs, session.durationMs);
  const isTypingRoute = route === "typing";
  const isSessionActive =
    isTypingRoute &&
    session.startedAt !== null &&
    session.pausedAt === null &&
    !stats.completed;
  const isResultsScreen = isTypingRoute && stats.completed;
  const isPaused = session.pausedAt !== null;
  const activePracticeTitle =
    mode === "timed"
      ? `${Math.round(timedDurationMs / ONE_MINUTE_MS)} minute test`
      : activeContent.title;
  const activePracticeKey = getPracticeKey(
    mode,
    activeContent,
    session.durationMs
  );
  const activeResultId =
    stats.completed && session.startedAt !== null
      ? getResultId(
          mode,
          activeContent.id,
          session.startedAt,
          session.finishedAt
        )
      : null;
  const previousComparableResults = useMemo(
    () =>
      sessionHistory.filter(
        (result) =>
          result.practiceKey === activePracticeKey &&
          result.id !== activeResultId
      ),
    [activePracticeKey, activeResultId, sessionHistory]
  );
  const resultBadge = useMemo(
    () =>
      getResultBadge({
        mode,
        previousResults: previousComparableResults,
        stats
      }),
    [mode, previousComparableResults, stats]
  );
  const finishedEssayCount = essayContents.filter(
    (content) => personalBests.essays[content.id]
  ).length;
  const savedEssayProgressCount = essayContents.filter((content) =>
    getRestorableEssayProgress(content, essayProgresses[content.id])
  ).length;
  const essayJourneyCounts = useMemo(
    () =>
      essayContents.reduce(
        (counts, content) => {
          counts[
            getEssayJourneyState(
              content,
              personalBests.essays[content.id],
              essayProgresses[content.id]
            )
          ] += 1;

          return counts;
        },
        { all: essayContents.length, saved: 0, unstarted: 0, finished: 0 }
      ),
    [essayProgresses, personalBests.essays]
  );
  const filteredEssayContents = useMemo(() => {
    const normalizedSearchQuery = essaySearchQuery.trim().toLowerCase();

    return essayContents.filter((content) => {
      const matchesSearch =
        !normalizedSearchQuery ||
        [content.title, content.author, content.description]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearchQuery);

      if (!matchesSearch) {
        return false;
      }

      if (essayJourneyFilter === "all") {
        return true;
      }

      return (
        getEssayJourneyState(
          content,
          personalBests.essays[content.id],
          essayProgresses[content.id]
        ) === essayJourneyFilter
      );
    });
  }, [essayJourneyFilter, essayProgresses, essaySearchQuery, personalBests.essays]);
  const essayCountLabel =
    filteredEssayContents.length === essayContents.length
      ? `${essayContents.length} essays`
      : `${filteredEssayContents.length} shown`;
  const normalizedCustomText = normalizeTypingText(customTextDraft);
  const customTextCharacterCount = normalizedCustomText.length;
  const canStartCustomText = customTextCharacterCount >= CUSTOM_TEXT_MIN_LENGTH;
  const recentHistory = sessionHistory.slice(0, 8);
  const recentFiveResults = sessionHistory.slice(0, 5);
  const averageRecentWpm = getAverage(
    recentFiveResults.map((result) => result.wpm)
  );
  const averageRecentAccuracy = getAverage(
    recentFiveResults.map((result) => result.accuracy)
  );
  const bestHistoryResult = sessionHistory.reduce<PracticeResult | null>(
    (best, result) => (!best || result.wpm > best.wpm ? result : best),
    null
  );
  const historyTrendResults = [...recentHistory].reverse();
  const historyTrendWpms = historyTrendResults.map((result) => result.wpm);
  const historyTrendMinWpm =
    historyTrendWpms.length > 0 ? Math.min(...historyTrendWpms) : 0;
  const historyTrendMaxWpm =
    historyTrendWpms.length > 0 ? Math.max(...historyTrendWpms) : 0;
  const historyTrendRange = historyTrendMaxWpm - historyTrendMinWpm;
  const historyTrendPoints = historyTrendResults.map((result, index) => {
    const x =
      historyTrendResults.length <= 1
        ? 50
        : 6 + (index / (historyTrendResults.length - 1)) * 88;
    const y =
      historyTrendRange <= 0
        ? 24
        : 40 - ((result.wpm - historyTrendMinWpm) / historyTrendRange) * 30;

    return {
      result,
      x,
      y
    };
  });
  const historyTrendLinePoints = historyTrendPoints
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  const historyTrendAreaPoints =
    historyTrendPoints.length > 1
      ? `6,44 ${historyTrendLinePoints} 94,44`
      : "";
  const historyTrendLabel = formatHistoryTrendLabel(historyTrendResults);

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const updateEssayProgress = useCallback(
    (essayId: string, progress: StoredEssayProgress | null) => {
      setEssayProgresses((currentProgresses) => {
        const nextProgresses = updateStoredEssayProgress(
          currentProgresses,
          essayId,
          progress
        );

        essayProgressesRef.current = nextProgresses;
        storeEssayProgresses(nextProgresses);
        return nextProgresses;
      });
    },
    []
  );

  const saveEssaySessionProgress = useCallback(
    (essayId: string, nextSession: TypingSession, nowMs: number) => {
      updateEssayProgress(
        essayId,
        createStoredEssayProgress(essayId, nextSession, nowMs)
      );
    },
    [updateEssayProgress]
  );

  const navigateToTyping = useCallback(() => {
    updateBrowserRoute("/typing");
    setRoute("typing");
    window.requestAnimationFrame(focusInput);
  }, [focusInput]);

  const navigateHome = useCallback(() => {
    const currentSession = sessionRef.current;

    if (
      currentSession.mode !== "timed" &&
      currentSession.entries.length > 0 &&
      currentSession.finishedAt === null
    ) {
      const currentTime = Date.now();
      const pausedSession = pauseSession(currentSession, currentTime);

      sessionRef.current = pausedSession;
      setSession(pausedSession);
      setNowMs(currentTime);

      if (pausedSession.mode === "essay") {
        saveEssaySessionProgress(activeContent.id, pausedSession, currentTime);
      }
    }

    updateBrowserRoute("/", "replace");
    setRoute("home");
  }, [activeContent.id, saveEssaySessionProgress]);

  const resetSession = useCallback(
    ({
      nextMode = mode,
      durationMs = timedDurationMs,
      content,
      restoredSession,
      clearSavedProgress = true
    }: ResetSessionOptions = {}) => {
      const nextContent =
        content ??
        (nextMode === "timed"
          ? getRandomTimedContent(durationMs, timedContent.sourceEssayId)
          : nextMode === "custom"
            ? customContent ?? createCustomContent(customTextDraft)
            : selectedEssayContent);

      if (nextMode === "timed") {
        setTimedContent(nextContent);
        setTimedDurationMs(durationMs);
      }

      if (nextMode === "custom") {
        setCustomContent(nextContent);
      }

      const nextSession =
        restoredSession ??
        createTypingSession({
          mode: nextMode,
          text: nextContent.text,
          durationMs
        });

      if (nextMode === "essay" && clearSavedProgress) {
        updateEssayProgress(nextContent.id, null);
      }

      sessionRef.current = nextSession;
      completionPlayedRef.current = false;
      recordedResultRef.current = null;
      setSession(nextSession);
      setNowMs(Date.now());
      window.requestAnimationFrame(focusInput);
    },
    [
      customContent,
      customTextDraft,
      focusInput,
      mode,
      selectedEssayContent,
      timedContent.sourceEssayId,
      timedDurationMs,
      updateEssayProgress
    ]
  );

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    essayProgressesRef.current = essayProgresses;
  }, [essayProgresses]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const currentSession = sessionRef.current;

      if (
        currentSession.mode !== "essay" ||
        currentSession.entries.length === 0 ||
        currentSession.finishedAt !== null
      ) {
        return;
      }

      const currentTime = Date.now();
      const progress = createStoredEssayProgress(
        activeContent.id,
        pauseSession(currentSession, currentTime),
        currentTime
      );
      const nextProgresses = updateStoredEssayProgress(
        essayProgressesRef.current,
        activeContent.id,
        progress
      );

      storeEssayProgresses(nextProgresses);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeContent.id]);

  useEffect(() => {
    const handlePopState = () => setRoute(getCurrentRoute());

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (isTypingRoute) {
      focusInput();
    }
  }, [focusInput, isTypingRoute]);

  useEffect(() => {
    if (essayPickerOpen && !isTypingRoute) {
      window.requestAnimationFrame(() => {
        essaySearchRef.current?.focus({ preventScroll: true });
      });
    }
  }, [essayPickerOpen, isTypingRoute]);

  useEffect(() => {
    if (
      !isTypingRoute ||
      session.startedAt === null ||
      session.pausedAt !== null ||
      session.finishedAt !== null
    ) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      setSession((previous) => {
        const next = completeTimedSession(previous, current);
        sessionRef.current = next;
        return next;
      });
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [isTypingRoute, session.finishedAt, session.pausedAt, session.startedAt]);

  useEffect(() => {
    if (
      !isTypingRoute ||
      mode === "timed" ||
      session.startedAt === null ||
      session.pausedAt !== null ||
      session.finishedAt !== null ||
      session.entries.length === 0
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const currentTime = Date.now();

      setNowMs(currentTime);
      setSession((previous) => {
        if (
          previous.mode === "timed" ||
          previous.startedAt === null ||
          previous.pausedAt !== null ||
          previous.finishedAt !== null ||
          previous.entries.length === 0
        ) {
          return previous;
        }

        const next = pauseSession(previous, currentTime);

        sessionRef.current = next;

        if (next.mode === "essay") {
          saveEssaySessionProgress(activeContent.id, next, currentTime);
        }

        return next;
      });
    }, ESSAY_IDLE_AUTO_PAUSE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeContent.id,
    isTypingRoute,
    mode,
    saveEssaySessionProgress,
    session.entries.length,
    session.finishedAt,
    session.pausedAt,
    session.startedAt
  ]);

  useEffect(() => {
    if (
      isTypingRoute &&
      stats.completed &&
      session.startedAt !== null &&
      !completionPlayedRef.current
    ) {
      completionPlayedRef.current = true;
      playSound("complete");
    }
  }, [isTypingRoute, playSound, session.startedAt, stats.completed]);

  useEffect(() => {
    if (!isTypingRoute || !stats.completed || session.startedAt === null) {
      return;
    }

    const resultKey = getResultId(
      mode,
      activeContent.id,
      session.startedAt,
      session.finishedAt
    );

    if (recordedResultRef.current === resultKey) {
      return;
    }

    recordedResultRef.current = resultKey;

    setSessionHistory((currentHistory) => {
      if (currentHistory.some((result) => result.id === resultKey)) {
        return currentHistory;
      }

      const nextHistory = [
        createPracticeResult({
          content: activeContent,
          durationMs: session.durationMs,
          mode,
          resultId: resultKey,
          stats
        }),
        ...currentHistory
      ].slice(0, SESSION_HISTORY_LIMIT);

      storeSessionHistory(nextHistory);
      return nextHistory;
    });

    if (mode === "essay") {
      updateEssayProgress(activeContent.id, null);
    }

    setPersonalBests((currentBests) => {
      let nextBests = currentBests;

      if (mode === "timed" && stats.typedChars > 0) {
        const durationKey =
          timedDurationMs === THREE_MINUTES_MS ? "180000" : "60000";
        const currentBest = currentBests.timed[durationKey];

        if (currentBest === undefined || stats.wpm > currentBest) {
          nextBests = {
            ...currentBests,
            timed: {
              ...currentBests.timed,
              [durationKey]: stats.wpm
            }
          };
        }
      }

      if (mode === "essay" && stats.typedChars > 0) {
        const currentBest = currentBests.essays[activeContent.id];

        if (!currentBest || stats.elapsedMs < currentBest.elapsedMs) {
          nextBests = {
            ...currentBests,
            essays: {
              ...currentBests.essays,
              [activeContent.id]: {
                elapsedMs: stats.elapsedMs,
                wpm: stats.wpm,
                completedAt: Date.now()
              }
            }
          };
        }
      }

      if (nextBests !== currentBests) {
        storePersonalBests(nextBests);
      }

      return nextBests;
    });
  }, [
    activeContent,
    activeContent.id,
    isTypingRoute,
    mode,
    session.finishedAt,
    session.startedAt,
    stats.accuracy,
    stats.completed,
    stats.elapsedMs,
    stats.typos,
    stats.typedChars,
    stats.wpm,
    session.durationMs,
    timedDurationMs,
    updateEssayProgress
  ]);

  const rememberPractice = useCallback((practice: LastPractice) => {
    storeLastPractice(practice);
  }, []);

  const handleStartTimedChallenge = useCallback(
    (durationMs: number) => {
      const content = getRandomTimedContent(
        durationMs,
        timedContent.sourceEssayId
      );

      setMode("timed");
      setTimedDurationMs(durationMs);
      setTimedContent(content);
      setEssayPickerOpen(false);
      setCustomTextOpen(false);
      setEssaySearchQuery("");
      rememberPractice({ mode: "timed", durationMs });
      resetSession({ nextMode: "timed", durationMs, content });
      navigateToTyping();
    },
    [
      navigateToTyping,
      rememberPractice,
      resetSession,
      timedContent.sourceEssayId
    ]
  );

  const handleStartEssayChallenge = useCallback(
    (essayId = selectedEssayId) => {
      const content = getEssayContent(essayId);
      const currentTime = Date.now();
      const savedProgress = getRestorableEssayProgress(
        content,
        essayProgresses[content.id]
      );
      const restoredSession = savedProgress
        ? createPausedEssaySessionFromProgress(
            content,
            savedProgress,
            currentTime
          )
        : undefined;

      setMode("essay");
      setSelectedEssayId(content.id);
      setEssayPickerOpen(false);
      setCustomTextOpen(false);
      setEssaySearchQuery("");
      rememberPractice({ mode: "essay", essayId: content.id });
      resetSession({
        nextMode: "essay",
        durationMs: ONE_MINUTE_MS,
        content,
        restoredSession,
        clearSavedProgress: !savedProgress
      });
      navigateToTyping();
    },
    [
      essayProgresses,
      navigateToTyping,
      rememberPractice,
      resetSession,
      selectedEssayId
    ]
  );

  const handleEssaySearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setEssaySearchQuery(event.target.value);
    },
    []
  );

  const handleCustomTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setCustomTextDraft(event.target.value);
    },
    []
  );

  const handleStartCustomChallenge = useCallback(() => {
    const content = createCustomContent(customTextDraft);

    if (content.text.length < CUSTOM_TEXT_MIN_LENGTH) {
      return;
    }

    setMode("custom");
    setCustomContent(content);
    setEssayPickerOpen(false);
    setCustomTextOpen(false);
    setEssaySearchQuery("");
    clearLastPractice();
    resetSession({
      nextMode: "custom",
      durationMs: ONE_MINUTE_MS,
      content
    });
    navigateToTyping();
  }, [customTextDraft, navigateToTyping, resetSession]);

  const handleToggleEssayPause = useCallback(() => {
    if ((mode !== "essay" && mode !== "custom") || stats.completed) {
      return;
    }

    const currentTime = Date.now();
    const wasPaused = sessionRef.current.pausedAt !== null;

    setNowMs(currentTime);
    setSession((previous) => {
      const next = previous.pausedAt
        ? resumeSession(previous, currentTime)
        : pauseSession(previous, currentTime);

      sessionRef.current = next;

      if (next.mode === "essay") {
        saveEssaySessionProgress(activeContent.id, next, currentTime);
      }

      return next;
    });

    if (wasPaused) {
      window.requestAnimationFrame(focusInput);
    }
  }, [
    activeContent.id,
    focusInput,
    mode,
    saveEssaySessionProgress,
    stats.completed
  ]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA";

      if (isTypingRoute && event.key === "Escape") {
        event.preventDefault();
        navigateHome();
        return;
      }

      if (
        isTypingRoute &&
        event.key === "Enter" &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        resetSession();
        return;
      }

      if (
        isTypingRoute ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget
      ) {
        return;
      }

      if (event.key === "1") {
        event.preventDefault();
        handleStartTimedChallenge(ONE_MINUTE_MS);
        return;
      }

      if (event.key === "3") {
        event.preventDefault();
        handleStartTimedChallenge(THREE_MINUTES_MS);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    handleStartTimedChallenge,
    isTypingRoute,
    navigateHome,
    resetSession
  ]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!isTypingRoute) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const key = event.key;
    const typedCharacter = getTypedCharacter(key);
    const currentSession = sessionRef.current;
    const currentTime = Date.now();

    if (currentSession.pausedAt !== null) {
      if (key === "Backspace" || isPrintableKey(typedCharacter)) {
        event.preventDefault();
      }
      return;
    }

    if (isCompleted(currentSession, currentTime)) {
      if (key === "Backspace" || isPrintableKey(typedCharacter)) {
        event.preventDefault();
        setSession((previous) => {
          const next = completeTimedSession(previous, currentTime);
          sessionRef.current = next;
          return next;
        });
      }
      return;
    }

    if (key === "Backspace") {
      event.preventDefault();
      setNowMs(currentTime);

      if (currentSession.entries.length > 0) {
        playSound("backspace");
      }

      setSession((previous) => {
        const next = backspace(previous);
        sessionRef.current = next;

        if (next.mode === "essay") {
          saveEssaySessionProgress(activeContent.id, next, currentTime);
        }

        return next;
      });
      return;
    }

    if (!isPrintableKey(typedCharacter)) {
      return;
    }

    event.preventDefault();
    setNowMs(currentTime);

    const expected = currentSession.text[currentSession.entries.length];
    if (expected !== undefined) {
      playSound(typedCharacter === expected ? "correct" : "error");
    }

    setSession((previous) => {
      const typed = typeCharacter(previous, typedCharacter, currentTime);
      const next = completeTimedSession(typed, currentTime);
      sessionRef.current = next;

      if (next.mode === "essay") {
        saveEssaySessionProgress(activeContent.id, next, currentTime);
      }

      return next;
    });
  };

  return (
    <main
      className={[
        "app-shell",
        isTypingRoute ? "typing-route" : "home-route",
        isSessionActive ? "typing-active" : "",
        isResultsScreen ? "results-active" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isTypingRoute ? (
        <textarea
          ref={inputRef}
          className="capture-input"
          aria-label="Typing capture input"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value=""
          onChange={() => undefined}
          onKeyDown={handleKeyDown}
        />
      ) : null}

      <header className="topbar">
        <div className="topbar-left">
          {isTypingRoute ? (
            <button
              className="icon-action back-action"
              type="button"
              onClick={navigateHome}
              title="Back to home"
            >
              <ArrowLeft size={18} />
              <span>Home</span>
            </button>
          ) : null}

          <div className="brand">
            <div className="brand-mark">
              <BookOpenText size={24} />
            </div>
            <div>
              <p>Typing Journey</p>
              <span>Typing studio</span>
            </div>
          </div>
        </div>

        <div className="top-actions">
          <button
            className="icon-action"
            type="button"
            onClick={() => setSoundEnabled((enabled) => !enabled)}
            title={soundEnabled ? "Mute sounds" : "Enable sounds"}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span>{soundEnabled ? "Sound" : "Muted"}</span>
          </button>
          {isTypingRoute && !isResultsScreen ? (
            <button
              className="icon-action"
              type="button"
              onClick={() => resetSession()}
            >
              <RefreshCw size={18} />
              <span>Restart</span>
            </button>
          ) : null}
          {isTypingRoute &&
          (mode === "essay" || mode === "custom") &&
          !isResultsScreen ? (
            <button
              className="icon-action"
              type="button"
              onClick={handleToggleEssayPause}
              disabled={session.startedAt === null}
              title={isPaused ? "Continue practice" : "Pause practice"}
            >
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
              <span>{isPaused ? "Continue" : "Pause"}</span>
            </button>
          ) : null}
        </div>
      </header>

      {isTypingRoute ? (
        <section className="typing-workspace" aria-label="Typing challenge">
          <div className="practice-header">
            <div>
              <p className="eyebrow">
                {mode === "timed"
                  ? "Timed practice"
                  : mode === "custom"
                    ? "Custom practice"
                    : activeContent.author}
              </p>
              <h1>{activePracticeTitle}</h1>
              {activeContent.sourceUrl ? (
                <a
                  className="source-link"
                  href={activeContent.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {mode === "timed"
                    ? activeContent.title.replace(/^(1|3)-Minute: /, "")
                    : "Source"}
                </a>
              ) : null}
            </div>

            <div className="test-metrics" aria-live="polite">
              <div className="metric-pill metric-pill-time">
                <span>{timeLabel}</span>
                <small>{mode === "timed" ? "left" : "elapsed"}</small>
              </div>
              <div className="metric-pill">
                <span>{Math.round(stats.wpm)}</span>
                <small>wpm</small>
              </div>
              <div className="metric-pill">
                <span>{Math.round(stats.accuracy)}%</span>
                <small>accuracy</small>
              </div>
              <div className="metric-pill">
                <span>{formatCount(stats.typos, "char", "chars")}</span>
                <small>typos</small>
              </div>
            </div>
          </div>

          <div className="progress-meter" aria-label="Challenge progress">
            <div style={{ width: `${progress * 100}%` }} />
          </div>

          {stats.completed ? (
            <ResultsPanel
              mode={mode}
              stats={stats}
              hotspots={mistakeHotspots}
              title={activePracticeTitle}
              durationLabel={formatDurationLabel(stats.elapsedMs)}
              resultBadge={resultBadge}
              onChooseAnother={navigateHome}
              onRetry={() => resetSession()}
            />
          ) : (
            <>
              {isPaused ? (
                <div className="pause-banner" role="status">
                  <Pause size={17} />
                  <span>Paused</span>
                </div>
              ) : null}
              <TypingSurface
                text={session.text}
                entries={session.entries}
                completed={stats.completed}
                onFocusRequest={focusInput}
              />
            </>
          )}
        </section>
      ) : (
        <section className="home-screen" aria-label="Practice types">
          <div className="home-heading">
            <p className="eyebrow">Practice</p>
            <h1>Choose a practice path.</h1>
          </div>

          <div className="practice-grid">
            <button
              className="practice-card practice-card-fast"
              type="button"
              onClick={() => handleStartTimedChallenge(ONE_MINUTE_MS)}
            >
              <span className="mode-icon mode-icon-fast">
                <Clock3 size={20} />
              </span>
              <span className="practice-card-copy">
                <span className="practice-card-title">1 minute sprint</span>
                <span className="practice-card-detail">
                  60 sec / Speed check
                </span>
                <span className="best-chip">
                  {formatBestWpm(personalBests.timed["60000"])}
                </span>
              </span>
              <Play className="practice-card-action" size={18} />
            </button>

            <button
              className="practice-card practice-card-steady"
              type="button"
              onClick={() => handleStartTimedChallenge(THREE_MINUTES_MS)}
            >
              <span className="mode-icon mode-icon-steady">
                <Keyboard size={20} />
              </span>
              <span className="practice-card-copy">
                <span className="practice-card-title">3 minute rhythm</span>
                <span className="practice-card-detail">
                  3 min / Endurance
                </span>
                <span className="best-chip">
                  {formatBestWpm(personalBests.timed["180000"])}
                </span>
              </span>
              <Play className="practice-card-action" size={18} />
            </button>

            <button
              className={[
                "practice-card",
                "practice-card-essay",
                essayPickerOpen ? "practice-card-open" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              onClick={() => {
                setCustomTextOpen(false);
                setEssayPickerOpen((open) => !open);
              }}
              aria-expanded={essayPickerOpen}
              aria-controls="essay-chooser"
            >
              <span className="mode-icon mode-icon-essay">
                <FileText size={20} />
              </span>
              <span className="practice-card-copy">
                <span className="practice-card-title">Essay practice</span>
                <span className="practice-card-detail">
                  {essayContents.length} essays / Full accuracy
                </span>
                <span className="best-chip">
                  {savedEssayProgressCount > 0
                    ? `${savedEssayProgressCount} saved`
                    : finishedEssayCount > 0
                      ? `${finishedEssayCount} finished`
                      : "No essays finished"}
                </span>
              </span>
              <ChevronDown className="practice-card-action essay-card-arrow" size={18} />
            </button>

            <button
              className={[
                "practice-card",
                "practice-card-custom",
                customTextOpen ? "practice-card-open" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              onClick={() => {
                setEssayPickerOpen(false);
                setCustomTextOpen((open) => !open);
              }}
              aria-expanded={customTextOpen}
              aria-controls="custom-text-chooser"
            >
              <span className="mode-icon mode-icon-custom">
                <ClipboardType size={20} />
              </span>
              <span className="practice-card-copy">
                <span className="practice-card-title">Custom text</span>
                <span className="practice-card-detail">
                  Paste text / Full accuracy
                </span>
                <span className="best-chip">
                  {customTextCharacterCount > 0
                    ? `${customTextCharacterCount} chars ready`
                    : "Bring your own"}
                </span>
              </span>
              <ChevronDown className="practice-card-action essay-card-arrow" size={18} />
            </button>
          </div>

          {customTextOpen ? (
            <section
              className="custom-chooser"
              id="custom-text-chooser"
              aria-label="Custom text practice"
            >
              <div className="essay-chooser-header">
                <h2>Custom text</h2>
                <span>{customTextCharacterCount.toLocaleString()} chars</span>
              </div>

              <textarea
                className="custom-textarea"
                aria-label="Custom practice text"
                value={customTextDraft}
                onChange={handleCustomTextChange}
                placeholder="Paste text to practice"
                spellCheck={false}
              />

              <div className="custom-actions">
                <span>
                  {canStartCustomText
                    ? "Ready"
                    : `${Math.max(
                        0,
                        CUSTOM_TEXT_MIN_LENGTH - customTextCharacterCount
                      )} more chars`}
                </span>
                <button
                  className="primary-action"
                  type="button"
                  onClick={handleStartCustomChallenge}
                  disabled={!canStartCustomText}
                >
                  <Play size={18} />
                  Start custom
                </button>
              </div>
            </section>
          ) : null}

          {essayPickerOpen ? (
            <section
              className="essay-chooser"
              id="essay-chooser"
              aria-label="Essay chooser"
            >
              <div className="essay-chooser-header">
                <h2>Choose an essay</h2>
                <span>{essayCountLabel}</span>
              </div>

              <label className="essay-search">
                <Search size={17} />
                <input
                  ref={essaySearchRef}
                  type="search"
                  aria-label="Search essays"
                  autoComplete="off"
                  value={essaySearchQuery}
                  onChange={handleEssaySearchChange}
                  placeholder="Search essays"
                />
              </label>

              <div
                className="essay-filter-tabs"
                role="group"
                aria-label="Essay journey filters"
              >
                {(
                  [
                    ["all", "All", essayJourneyCounts.all],
                    ["saved", "Saved", essayJourneyCounts.saved],
                    ["unstarted", "Unstarted", essayJourneyCounts.unstarted],
                    ["finished", "Finished", essayJourneyCounts.finished]
                  ] as const
                ).map(([filter, label, count]) => (
                  <button
                    className={
                      essayJourneyFilter === filter ? "filter-tab-active" : ""
                    }
                    type="button"
                    key={filter}
                    onClick={() => setEssayJourneyFilter(filter)}
                  >
                    {label}
                    <span>{count}</span>
                  </button>
                ))}
              </div>

              <div className="essay-list" role="region" aria-label="Essay list">
                {filteredEssayContents.map((content) => {
                  const essayBest = personalBests.essays[content.id];
                  const savedProgressLabel = formatSavedEssayProgress(
                    content,
                    essayProgresses[content.id]
                  );
                  const journeyState = getEssayJourneyState(
                    content,
                    essayBest,
                    essayProgresses[content.id]
                  );

                  return (
                    <button
                      className={[
                        "essay-row",
                        content.id === selectedEssayId ? "essay-row-selected" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      type="button"
                      key={content.id}
                      onClick={() => handleStartEssayChallenge(content.id)}
                      aria-current={
                        content.id === selectedEssayId ? "true" : undefined
                      }
                    >
                      <span className="essay-row-copy">
                        <span className="essay-row-title">{content.title}</span>
                        <span className="essay-row-description">
                          {content.description}
                        </span>
                      </span>
                      <span className="essay-row-best">
                        <span className={`essay-status essay-status-${journeyState}`}>
                          {formatEssayJourneyState(journeyState)}
                        </span>
                        <span>{savedProgressLabel ?? formatBestTime(essayBest)}</span>
                      </span>
                    </button>
                  );
                })}
                {filteredEssayContents.length === 0 ? (
                  <p className="essay-empty">No essays found</p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="progress-panel" aria-label="Progress history">
            <div className="progress-panel-header">
              <div>
                <p className="eyebrow">Progress</p>
                <h2>Recent sessions</h2>
              </div>
              <TrendingUp size={22} />
            </div>

            {sessionHistory.length > 0 ? (
              <>
                <div className="history-summary" aria-label="Progress summary">
                  <div>
                    <span>{sessionHistory.length}</span>
                    <small>sessions</small>
                  </div>
                  <div>
                    <span>{Math.round(averageRecentWpm)}</span>
                    <small>avg wpm</small>
                  </div>
                  <div>
                    <span>{Math.round(averageRecentAccuracy)}%</span>
                    <small>avg accuracy</small>
                  </div>
                  <div>
                    <span>
                      {bestHistoryResult
                        ? Math.round(bestHistoryResult.wpm)
                        : 0}
                    </span>
                    <small>best wpm</small>
                  </div>
                </div>

                <div
                  className="history-line-chart"
                  aria-label={historyTrendLabel}
                  role="img"
                >
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    viewBox="0 0 100 48"
                    preserveAspectRatio="none"
                  >
                    <line
                      className="history-line-grid"
                      x1="6"
                      y1="40"
                      x2="94"
                      y2="40"
                    />
                    <line
                      className="history-line-grid"
                      x1="6"
                      y1="10"
                      x2="94"
                      y2="10"
                    />
                    {historyTrendAreaPoints ? (
                      <polygon
                        className="history-line-area"
                        points={historyTrendAreaPoints}
                      />
                    ) : null}
                    {historyTrendLinePoints ? (
                      <polyline
                        className="history-line"
                        points={historyTrendLinePoints}
                      />
                    ) : null}
                  </svg>
                  {historyTrendPoints.map((point, index) => (
                    <span
                      aria-hidden="true"
                      className={
                        index === historyTrendPoints.length - 1
                          ? "history-line-dot history-line-dot-current"
                          : "history-line-dot"
                      }
                      key={point.result.id}
                      style={{
                        left: `${point.x}%`,
                        top: `${(point.y / 48) * 100}%`
                      }}
                      title={`${Math.round(
                        point.result.wpm
                      )} WPM, ${Math.round(point.result.accuracy)}% accuracy`}
                    />
                  ))}
                </div>

                <div className="history-list">
                  {sessionHistory.slice(0, 4).map((result) => (
                    <div className="history-row" key={result.id}>
                      <span>
                        <strong>{Math.round(result.wpm)} WPM</strong>
                        <small>
                          {Math.round(result.accuracy)}% /{" "}
                          {formatModeLabel(result.mode)}
                        </small>
                      </span>
                      <span>{result.title}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="history-empty">No sessions yet.</p>
            )}
          </section>
        </section>
      )}
    </main>
  );
}
