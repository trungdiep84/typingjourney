import essays from "./generated/paulGrahamEssays.json";
import type { TypingContent } from "../typing/types";

export function normalizeTypingText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/\n+/g, " ")
        .replace(/[^\S\n]+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export const essayContents = (essays as TypingContent[]).map((essay) => ({
  ...essay,
  text: normalizeTypingText(essay.text)
}));

const ONE_MINUTE_TARGET_CHARS = 1_500;
const THREE_MINUTE_TARGET_CHARS = 4_500;

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function getTargetCharacterCount(durationMs: number) {
  return durationMs >= 180_000
    ? THREE_MINUTE_TARGET_CHARS
    : ONE_MINUTE_TARGET_CHARS;
}

function getSentenceStarts(text: string, maxStart: number) {
  const starts = [0];
  const sentenceBoundary = /[.!?]\s+["'(]?[A-Z0-9]/g;
  let match: RegExpExecArray | null;

  while ((match = sentenceBoundary.exec(text)) !== null) {
    const start = match.index + match[0].length - 1;

    if (start > 0 && start <= maxStart) {
      starts.push(start);
    }
  }

  return starts;
}

function trimToSentence(text: string, targetLength: number) {
  if (text.length <= targetLength) {
    return normalizeTypingText(text);
  }

  const minimumLength = Math.floor(targetLength * 0.72);
  const excerpt = text.slice(0, targetLength);
  const sentenceEnd = Math.max(
    excerpt.lastIndexOf("."),
    excerpt.lastIndexOf("?"),
    excerpt.lastIndexOf("!")
  );

  if (sentenceEnd > minimumLength) {
    return normalizeTypingText(excerpt.slice(0, sentenceEnd + 1));
  }

  const lastSpace = excerpt.lastIndexOf(" ");
  return normalizeTypingText(
    excerpt.slice(0, lastSpace > minimumLength ? lastSpace : targetLength)
  );
}

function buildTimedExcerpt(text: string, targetLength: number) {
  if (text.length <= targetLength) {
    return normalizeTypingText(text);
  }

  const maxStart = text.length - targetLength;
  const starts = getSentenceStarts(text, maxStart);
  const start = randomItem(starts);

  return trimToSentence(text.slice(start), targetLength);
}

export function getRandomTimedContent(
  durationMs: number,
  previousSourceEssayId?: string
): TypingContent {
  const targetLength = getTargetCharacterCount(durationMs);
  const fullLengthEssays = essayContents.filter(
    (essay) => essay.text.length >= targetLength
  );
  const eligibleEssays =
    fullLengthEssays.length > 0
      ? fullLengthEssays
      : essayContents.filter((essay) => essay.text.length > 800);
  const rotatedEssays = eligibleEssays.filter(
    (essay) => essay.id !== previousSourceEssayId
  );
  const source = randomItem(rotatedEssays.length > 0 ? rotatedEssays : eligibleEssays);
  const minuteLabel = durationMs >= 180_000 ? "3-Minute" : "1-Minute";

  return {
    id: `timed-${durationMs}-${source.id}-${Date.now()}-${Math.floor(
      Math.random() * 100_000
    )}`,
    sourceEssayId: source.id,
    title: `${minuteLabel}: ${source.title}`,
    author: source.author,
    sourceUrl: source.sourceUrl,
    description: `Random timed excerpt from "${source.title}".`,
    text: buildTimedExcerpt(source.text, targetLength)
  };
}

export function createCustomContent(text: string): TypingContent {
  const normalizedText = normalizeTypingText(text);
  const hash = createStableHash(normalizedText);
  const firstLine = normalizedText.split("\n")[0] ?? "";
  const titlePreview = firstLine.slice(0, 54).trim();

  return {
    id: `custom-${hash}`,
    title: titlePreview ? `Custom: ${titlePreview}` : "Custom text",
    author: "You",
    description: `${normalizedText.length.toLocaleString()} characters`,
    text: normalizedText
  };
}

function createStableHash(text: string) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
