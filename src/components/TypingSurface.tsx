import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type {
  CharacterStatus,
  TypedCharacter
} from "../typing/types";

type TypingSurfaceProps = {
  text: string;
  entries: TypedCharacter[];
  completed: boolean;
  onFocusRequest: () => void;
};

type LineRange = {
  id: string;
  start: number;
  end: number;
};

type RenderedCharacter = {
  id: string;
  char: string;
  status: CharacterStatus;
};

const DEFAULT_LINE_CAPACITY = 48;
const MIN_LINE_CAPACITY = 28;
const MAX_LINE_CAPACITY = 64;
const VISIBLE_LINE_COUNT = 11;
const MEASURE_SAMPLE = "mmmmmmmmmmmmmmmmmmmm";

export function TypingSurface({
  text,
  entries,
  completed,
  onFocusRequest
}: TypingSurfaceProps) {
  const copyRef = useRef<HTMLSpanElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previousLineIndexRef = useRef(0);
  const hasSyncedScrollRef = useRef(false);
  const [lineCapacity, setLineCapacity] = useState(DEFAULT_LINE_CAPACITY);
  const currentIndex = entries.length;
  const hasCurrentCharacter = currentIndex < text.length && !completed;

  const lineRanges = useMemo(
    () => buildLineRanges(text, lineCapacity),
    [lineCapacity, text]
  );
  const currentLineIndex = useMemo(
    () => findLineIndex(lineRanges, currentIndex),
    [currentIndex, lineRanges]
  );
  const firstRenderedLineIndex =
    currentLineIndex > 0 ? currentLineIndex - 1 : 0;
  const renderedLineRanges = lineRanges.slice(
    firstRenderedLineIndex,
    firstRenderedLineIndex + VISIBLE_LINE_COUNT
  );
  const renderedLines = useMemo(
    () =>
      renderedLineRanges.map((lineRange, offset) => {
        const lineIndex = firstRenderedLineIndex + offset;

        return {
          ...lineRange,
          lineIndex,
          hasCurrent:
            hasCurrentCharacter &&
            currentIndex >= lineRange.start &&
            currentIndex < lineRange.end,
          characters: getRenderedCharacters({
            entries,
            currentIndex,
            lineRange,
            text
          })
        };
      }),
    [
      currentIndex,
      entries,
      firstRenderedLineIndex,
      hasCurrentCharacter,
      renderedLineRanges,
      text
    ]
  );

  useLayoutEffect(() => {
    const container = copyRef.current;
    const measure = measureRef.current;

    if (!container || !measure) {
      return;
    }

    const updateLineCapacity = () => {
      const computedStyle = window.getComputedStyle(container);
      const horizontalPadding =
        Number.parseFloat(computedStyle.paddingLeft) +
        Number.parseFloat(computedStyle.paddingRight);
      const availableWidth = Math.max(0, container.clientWidth - horizontalPadding);
      const characterWidth =
        measure.getBoundingClientRect().width / MEASURE_SAMPLE.length;

      if (characterWidth <= 0) {
        return;
      }

      const nextCapacity = clamp(
        Math.floor((availableWidth - 4) / characterWidth),
        MIN_LINE_CAPACITY,
        MAX_LINE_CAPACITY
      );

      setLineCapacity((currentCapacity) =>
        currentCapacity === nextCapacity ? currentCapacity : nextCapacity
      );
    };

    updateLineCapacity();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateLineCapacity);
      return () => window.removeEventListener("resize", updateLineCapacity);
    }

    const resizeObserver = new ResizeObserver(updateLineCapacity);
    resizeObserver.observe(container);
    window.addEventListener("resize", updateLineCapacity);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateLineCapacity);
    };
  }, []);

  useLayoutEffect(() => {
    const container = copyRef.current;
    const activeLine = container?.querySelector<HTMLElement>(
      ".typing-line-current"
    );
    const firstLine = container?.querySelector<HTMLElement>(".typing-line");

    if (!container || !activeLine || !firstLine) {
      return;
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const targetTop = Math.max(0, activeLine.offsetTop - firstLine.offsetTop);
    const previousLineIndex = previousLineIndexRef.current;
    const movedToNextLine = currentLineIndex === previousLineIndex + 1;
    const shouldReduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (!hasSyncedScrollRef.current || !movedToNextLine || shouldReduceMotion) {
      container.scrollTop = targetTop;
      hasSyncedScrollRef.current = true;
      previousLineIndexRef.current = currentLineIndex;
      return;
    }

    container.scrollTop = 0;
    animateScrollTop(container, targetTop, 190, animationFrameRef);
    previousLineIndexRef.current = currentLineIndex;
  }, [currentLineIndex, lineCapacity, completed, firstRenderedLineIndex]);

  return (
    <button
      className="typing-surface"
      type="button"
      onClick={onFocusRequest}
      aria-label="Typing area"
      data-completed={completed}
    >
      <span className="typing-copy" ref={copyRef}>
        <span aria-hidden="true" className="typing-measure" ref={measureRef}>
          {MEASURE_SAMPLE}
        </span>

        {renderedLines.map((line) => (
          <span
            className={[
              "typing-line",
              line.hasCurrent ? "typing-line-current" : "",
              line.lineIndex < currentLineIndex ? "typing-line-complete" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            key={line.id}
          >
            {line.characters.map((character) => (
              <span
                className={[
                  "typing-char",
                  /\s/.test(character.char) ? "typing-char-space" : "",
                  character.char === "\n" ? "typing-char-newline" : "",
                  `typing-char-${character.status}`
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={character.id}
              >
                {getVisibleCharacter(character)}
              </span>
            ))}
          </span>
        ))}

        {completed || hasCurrentCharacter ? null : <span className="cursor-end" />}
        <span aria-hidden="true" className="typing-scroll-spacer" />
      </span>
    </button>
  );
}

function getVisibleCharacter(character: RenderedCharacter) {
  if (character.char !== "\n") {
    return character.char;
  }

  return character.status === "upcoming" ? " " : "\u21b5";
}

function buildLineRanges(text: string, lineCapacity: number): LineRange[] {
  if (text.length === 0) {
    return [{ id: "line-empty", start: 0, end: 0 }];
  }

  const lineRanges: LineRange[] = [];
  let lineStart = 0;
  let lastBreakIndex = -1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === "\n") {
      pushLineRange(lineRanges, lineStart, index + 1);
      lineStart = index + 1;
      lastBreakIndex = -1;
      continue;
    }

    if (isSoftBreak(character)) {
      lastBreakIndex = index;
    }

    if (index + 1 - lineStart <= lineCapacity) {
      continue;
    }

    const breakAfter =
      lastBreakIndex >= lineStart
        ? lastBreakIndex + 1
        : lineStart + lineCapacity;

    pushLineRange(lineRanges, lineStart, breakAfter);
    lineStart = breakAfter;
    lastBreakIndex = findLastSoftBreak(text, lineStart, index);
  }

  if (lineStart < text.length) {
    pushLineRange(lineRanges, lineStart, text.length);
  }

  return lineRanges;
}

function getRenderedCharacters({
  entries,
  currentIndex,
  lineRange,
  text
}: {
  entries: TypedCharacter[];
  currentIndex: number;
  lineRange: LineRange;
  text: string;
}): RenderedCharacter[] {
  const characters: RenderedCharacter[] = [];

  for (let index = lineRange.start; index < lineRange.end; index += 1) {
    const entry = entries[index];
    const status: CharacterStatus = entry
      ? entry.correct
        ? "correct"
        : "incorrect"
      : index === currentIndex
        ? "current"
        : "upcoming";

    characters.push({
      id: `${index}-${text[index]}`,
      char: text[index],
      status
    });
  }

  return characters;
}

function pushLineRange(
  lineRanges: LineRange[],
  start: number,
  end: number
) {
  lineRanges.push({
    id: `line-${start}-${end}`,
    start,
    end
  });
}

function findLineIndex(lineRanges: LineRange[], characterIndex: number) {
  if (lineRanges.length === 0) {
    return 0;
  }

  let low = 0;
  let high = lineRanges.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineRange = lineRanges[middle];

    if (characterIndex < lineRange.start) {
      high = middle - 1;
      continue;
    }

    if (characterIndex >= lineRange.end) {
      low = middle + 1;
      continue;
    }

    return middle;
  }

  return characterIndex >= lineRanges[lineRanges.length - 1].end
    ? lineRanges.length - 1
    : 0;
}

function findLastSoftBreak(text: string, start: number, end: number) {
  for (let index = end; index >= start; index -= 1) {
    if (isSoftBreak(text[index])) {
      return index;
    }
  }

  return -1;
}

function isSoftBreak(character: string) {
  return character === " " || character === "\t";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function animateScrollTop(
  element: HTMLElement,
  targetTop: number,
  durationMs: number,
  animationFrameRef: MutableRefObject<number | null>
) {
  const startTop = element.scrollTop;
  const distance = targetTop - startTop;
  const startTime = performance.now();

  const tick = (currentTime: number) => {
    const progress = clamp((currentTime - startTime) / durationMs, 0, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    element.scrollTop = startTop + distance * easedProgress;

    if (progress < 1) {
      animationFrameRef.current = window.requestAnimationFrame(tick);
      return;
    }

    animationFrameRef.current = null;
  };

  animationFrameRef.current = window.requestAnimationFrame(tick);
}
