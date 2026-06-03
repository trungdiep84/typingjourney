import { ArrowLeft, RotateCcw, Target } from "lucide-react";
import type {
  ChallengeMode,
  MistakeHotspot,
  TypingStats
} from "../typing/types";

type ResultsPanelProps = {
  mode: ChallengeMode;
  stats: TypingStats;
  hotspots: MistakeHotspot[];
  title: string;
  durationLabel: string;
  resultBadge: string;
  onChooseAnother: () => void;
  onRetry: () => void;
};

function formatCharacter(char: string) {
  if (char === " ") {
    return "space";
  }

  if (char === "\n") {
    return "return";
  }

  if (char === "\t") {
    return "tab";
  }

  return char;
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function ResultStat({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="result-stat" role="group" aria-label={`${label}: ${value}`}>
      <span>{value}</span>
      <small>{label}</small>
    </div>
  );
}

export function ResultsPanel({
  mode,
  stats,
  hotspots,
  title,
  durationLabel,
  resultBadge,
  onChooseAnother,
  onRetry
}: ResultsPanelProps) {
  const mistypedKeys = Math.max(0, stats.inputChars - stats.correctInputChars);
  const totalTypedLabel = `${formatCount(stats.inputChars, "char", "chars")} typed`;
  const topHotspot = hotspots[0];
  const focusText = topHotspot
    ? `Focus next: ${formatCharacter(topHotspot.expected)} -> ${formatCharacter(
        topHotspot.actual
      )}, ${formatCount(topHotspot.count, "time", "times")}`
    : "No missed keys this run.";

  return (
    <section className="results-screen" aria-label="Challenge results">
      <div className="results-hero">
        <div>
          <p className="results-kicker">
            {mode === "timed"
              ? "Time complete"
              : mode === "custom"
                ? "Custom complete"
                : "Essay complete"}
          </p>
          <h2>{Math.round(stats.wpm)} WPM</h2>
          <p className="results-typed">{totalTypedLabel}</p>
          <p>{title}</p>
        </div>
        <span className="result-badge">{resultBadge}</span>
      </div>

      <div className="results-grid" role="group" aria-label="Typing summary">
        <ResultStat label="accuracy" value={`${Math.round(stats.accuracy)}%`} />
        <ResultStat
          label="mistyped"
          value={formatCount(mistypedKeys, "key", "keys")}
        />
        <ResultStat
          label="typos"
          value={formatCount(stats.typos, "char", "chars")}
        />
        <ResultStat
          label={mode === "timed" ? "duration" : "time"}
          value={durationLabel}
        />
      </div>

      <section className="result-focus" aria-label="Next focus">
        <span>
          <Target size={19} />
          <strong>{focusText}</strong>
        </span>
      </section>

      <div className="results-actions">
        <button className="primary-action" type="button" onClick={onRetry}>
          <RotateCcw size={18} />
          Retry
        </button>
        <button className="secondary-action" type="button" onClick={onChooseAnother}>
          <ArrowLeft size={18} />
          Choose another practice
        </button>
      </div>
    </section>
  );
}
