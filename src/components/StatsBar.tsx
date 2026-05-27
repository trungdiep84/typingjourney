import { AlertCircle, Gauge, Target, Timer } from "lucide-react";
import type { ReactNode } from "react";
import type { TypingStats } from "../typing/types";

type StatsBarProps = {
  stats: TypingStats;
  timeLabel: string;
};

function StatItem({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="stat-item">
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}

export function StatsBar({ stats, timeLabel }: StatsBarProps) {
  return (
    <section className="stats-bar" aria-label="Typing stats">
      <StatItem icon={<Gauge size={22} />} label="WPM" value={Math.round(stats.wpm).toString()} />
      <StatItem
        icon={<Target size={22} />}
        label="Accuracy"
        value={`${Math.round(stats.accuracy)}%`}
      />
      <StatItem icon={<Timer size={22} />} label="Time" value={timeLabel} />
      <StatItem icon={<AlertCircle size={22} />} label="Errors" value={stats.errors.toString()} />
    </section>
  );
}
