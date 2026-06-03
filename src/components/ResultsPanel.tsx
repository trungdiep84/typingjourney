import { ArrowLeft, RotateCcw, Sparkles, Target, Trophy } from "lucide-react";
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
  resultComparison: string;
  coachingNotes: string[];
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

export function ResultsPanel({
  mode,
  stats,
  hotspots,
  title,
  durationLabel,
  resultBadge,
  resultComparison,
  coachingNotes,
  onChooseAnother,
  onRetry
}: ResultsPanelProps) {
  return (
    <section className="results-screen" aria-label="Challenge results">
      <div className="results-hero">
        <div className="results-icon">
          <Trophy size={28} />
        </div>
        <p className="results-kicker">
          {mode === "timed"
            ? "Time complete"
            : mode === "custom"
              ? "Custom complete"
              : "Essay complete"}
        </p>
        <h2>{Math.round(stats.wpm)} WPM</h2>
        <p>{title}</p>
        <span className="result-badge">{resultBadge}</span>
      </div>

      <div className="results-grid" aria-label="Typing summary">
        <div className="result-stat">
          <span>{Math.round(stats.accuracy)}%</span>
          <small>accuracy</small>
        </div>
        <div className="result-stat">
          <span>{durationLabel}</span>
          <small>{mode === "timed" ? "duration" : "time"}</small>
        </div>
        <div className="result-stat">
          <span>{stats.typedChars}</span>
          <small>characters</small>
        </div>
        <div className="result-stat">
          <span>{stats.typos} chars</span>
          <small>typos</small>
        </div>
      </div>

      <section className="coach-panel" aria-label="Result coaching">
        <div className="hotspots-heading">
          <Sparkles size={19} />
          <div>
            <p className="results-kicker">Coach notes</p>
            <h3>{resultComparison}</h3>
          </div>
        </div>

        <div className="coach-list">
          {coachingNotes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </section>

      <section className="hotspots-panel" aria-label="Mistake hotspots">
        <div className="hotspots-heading">
          <Target size={19} />
          <div>
            <p className="results-kicker">Mistake hotspots</p>
            <h3>What to watch next time</h3>
          </div>
        </div>

        {hotspots.length > 0 ? (
          <div className="hotspots-list">
            {hotspots.map((hotspot) => (
              <div
                className="hotspot-row"
                key={`${hotspot.expected}-${hotspot.actual}`}
              >
                <span>
                  <kbd>{formatCharacter(hotspot.expected)}</kbd>
                  <small>typed</small>
                  <kbd>{formatCharacter(hotspot.actual)}</kbd>
                </span>
                <strong>{hotspot.count}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="hotspot-empty">No missed keys in this run.</p>
        )}
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
