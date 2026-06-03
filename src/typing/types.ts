export type ChallengeMode = "timed" | "essay" | "custom";

export type TypingContent = {
  id: string;
  sourceEssayId?: string;
  title: string;
  author: string;
  sourceUrl?: string;
  description: string;
  text: string;
};

export type TypingStats = {
  wpm: number;
  accuracy: number;
  typos: number;
  typedChars: number;
  inputChars: number;
  correctInputChars: number;
  elapsedMs: number;
  completed: boolean;
};

export type TypedCharacter = {
  expected: string;
  actual: string;
  correct: boolean;
};

export type MistakeHotspot = {
  expected: string;
  actual: string;
  count: number;
};

export type TypingSession = {
  mode: ChallengeMode;
  text: string;
  durationMs: number;
  entries: TypedCharacter[];
  mistakes: TypedCharacter[];
  inputChars: number;
  correctInputChars: number;
  startedAt: number | null;
  pausedAt: number | null;
  finishedAt: number | null;
};

export type CharacterStatus = "correct" | "incorrect" | "current" | "upcoming";

export type DisplayCharacter = {
  id: string;
  char: string;
  status: CharacterStatus;
};
