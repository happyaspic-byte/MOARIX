import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "teal" | "blue" | "amber" | "coral";
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`} aria-hidden="true"><Icon size={20} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
    </article>
  );
}
