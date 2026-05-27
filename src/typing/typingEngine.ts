import type {
  ChallengeMode,
  DisplayCharacter,
  MistakeHotspot,
  TypingSession,
  TypingStats
} from "./types";

export const ONE_MINUTE_MS = 60_000;
export const THREE_MINUTES_MS = 180_000;

const DEFAULT_DISPLAY_BEFORE = 320;
const DEFAULT_DISPLAY_AFTER = 1_700;

type CreateSessionInput = {
  mode: ChallengeMode;
  text: string;
  durationMs?: number;
};

export function createTypingSession({
  mode,
  text,
  durationMs = ONE_MINUTE_MS
}: CreateSessionInput): TypingSession {
  return {
    mode,
    text,
    durationMs,
    entries: [],
    mistakes: [],
    startedAt: null,
    pausedAt: null,
    finishedAt: null
  };
}

export function isPrintableKey(key: string): boolean {
  return key.length === 1;
}

export function typeCharacter(
  session: TypingSession,
  char: string,
  nowMs: number
): TypingSession {
  if (
    !isPrintableKey(char) ||
    session.pausedAt !== null ||
    isCompleted(session, nowMs)
  ) {
    return session;
  }

  const index = session.entries.length;
  const expected = session.text[index];

  if (expected === undefined) {
    return session;
  }

  const startedAt = session.startedAt ?? nowMs;
  const entries = [
    ...session.entries,
    {
      expected,
      actual: char,
      correct: char === expected
    }
  ];
  const mistakes =
    char === expected
      ? session.mistakes
      : [
          ...session.mistakes,
          {
            expected,
            actual: char,
            correct: false
          }
        ];

  const finishedAt =
    session.mode !== "timed" &&
    entries.length >= session.text.length &&
    entries.every((entry) => entry.correct)
      ? nowMs
      : session.finishedAt;

  return {
    ...session,
    startedAt,
    entries,
    mistakes,
    finishedAt
  };
}

export function backspace(session: TypingSession): TypingSession {
  if (
    session.entries.length === 0 ||
    session.pausedAt !== null ||
    session.finishedAt !== null
  ) {
    return session;
  }

  return {
    ...session,
    entries: session.entries.slice(0, -1)
  };
}

export function pauseSession(
  session: TypingSession,
  nowMs: number
): TypingSession {
  if (
    session.mode === "timed" ||
    session.startedAt === null ||
    session.pausedAt !== null ||
    session.finishedAt !== null
  ) {
    return session;
  }

  return {
    ...session,
    pausedAt: nowMs
  };
}

export function resumeSession(
  session: TypingSession,
  nowMs: number
): TypingSession {
  if (session.pausedAt === null) {
    return session;
  }

  const pausedDurationMs = Math.max(0, nowMs - session.pausedAt);

  return {
    ...session,
    startedAt:
      session.startedAt === null
        ? null
        : session.startedAt + pausedDurationMs,
    pausedAt: null
  };
}

export function completeTimedSession(
  session: TypingSession,
  nowMs: number
): TypingSession {
  if (
    session.mode !== "timed" ||
    session.startedAt === null ||
    session.pausedAt !== null ||
    session.finishedAt !== null
  ) {
    return session;
  }

  const endAt = session.startedAt + session.durationMs;

  if (nowMs < endAt) {
    return session;
  }

  return {
    ...session,
    finishedAt: endAt
  };
}

export function getElapsedMs(session: TypingSession, nowMs: number): number {
  if (session.startedAt === null) {
    return 0;
  }

  const end = session.finishedAt ?? session.pausedAt ?? nowMs;
  const rawElapsed = Math.max(0, end - session.startedAt);

  if (session.mode === "timed") {
    return Math.min(rawElapsed, session.durationMs);
  }

  return rawElapsed;
}

export function isCompleted(session: TypingSession, nowMs: number): boolean {
  if (session.finishedAt !== null) {
    return true;
  }

  if (session.mode === "timed" && session.startedAt !== null) {
    return nowMs - session.startedAt >= session.durationMs;
  }

  return false;
}

export function getStats(session: TypingSession, nowMs: number): TypingStats {
  const elapsedMs = getElapsedMs(session, nowMs);
  const typedChars = session.entries.length;
  const correctChars = session.entries.filter((entry) => entry.correct).length;
  const errors = typedChars - correctChars;
  const elapsedMinutes = elapsedMs / ONE_MINUTE_MS;
  const wpm = elapsedMinutes > 0 ? typedChars / 5 / elapsedMinutes : 0;
  const accuracy = typedChars > 0 ? (correctChars / typedChars) * 100 : 100;

  return {
    wpm,
    accuracy,
    errors,
    typedChars,
    elapsedMs,
    completed: isCompleted(session, nowMs)
  };
}

export function getMistakeHotspots(
  session: TypingSession,
  limit = 3
): MistakeHotspot[] {
  const counts = new Map<string, MistakeHotspot>();

  for (const mistake of session.mistakes) {
    if (mistake.correct) {
      continue;
    }

    const key = JSON.stringify([mistake.expected, mistake.actual]);
    const current = counts.get(key);

    if (current) {
      current.count += 1;
      continue;
    }

    counts.set(key, {
      expected: mistake.expected,
      actual: mistake.actual,
      count: 1
    });
  }

  return Array.from(counts.values())
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return `${a.expected}${a.actual}`.localeCompare(
        `${b.expected}${b.actual}`
      );
    })
    .slice(0, limit);
}

type DisplayWindowOptions = {
  before?: number;
  after?: number;
};

export function getDisplayCharacters(
  session: TypingSession,
  options: DisplayWindowOptions = {}
): DisplayCharacter[] {
  const currentIndex = session.entries.length;
  const before = Math.max(0, options.before ?? DEFAULT_DISPLAY_BEFORE);
  const after = Math.max(1, options.after ?? DEFAULT_DISPLAY_AFTER);
  const start = Math.max(0, currentIndex - before);
  const end = Math.min(session.text.length, currentIndex + after);

  return session.text.slice(start, end).split("").map((char, offset) => {
    const index = start + offset;
    const entry = session.entries[index];
    const status = entry
      ? entry.correct
        ? "correct"
        : "incorrect"
      : index === currentIndex
        ? "current"
        : "upcoming";

    return {
      id: `${index}-${char}`,
      char,
      status
    };
  });
}

export function getProgress(session: TypingSession, nowMs: number): number {
  if (session.mode === "timed") {
    return session.durationMs === 0
      ? 0
      : getElapsedMs(session, nowMs) / session.durationMs;
  }

  return session.text.length === 0
    ? 0
    : session.entries.length / session.text.length;
}

export function getCurrentExpectedKey(session: TypingSession): string | null {
  return session.text[session.entries.length] ?? null;
}
