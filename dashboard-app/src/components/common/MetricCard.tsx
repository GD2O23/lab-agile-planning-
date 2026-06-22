import type { GlobalDrill } from "../../types";

interface Props {
  label: string;
  value: number;
  drill?: GlobalDrill;
  className?: string;
  onClick?: (drill: GlobalDrill) => void;
}

export function MetricCard({ label, value, drill, className, onClick }: Props) {
  return (
    <div
      className={`metric ${className || ""}`}
      onClick={() => drill && onClick?.(drill)}
      role={drill ? "button" : undefined}
    >
      <div className="value">{Number(value || 0).toLocaleString()}</div>
      <div className="label">{label}</div>
    </div>
  );
}
