import type { GlobalDrill } from "../../types";
import { Tooltip } from "./Tooltip";

interface Props {
  label: string;
  value: number;
  tooltip?: string;
  drill?: GlobalDrill;
  className?: string;
  onClick?: (drill: GlobalDrill) => void;
}

export function MetricCard({ label, value, tooltip, drill, className, onClick }: Props) {
  return (
    <div
      className={`metric ${className || ""}`}
      onClick={() => drill && onClick?.(drill)}
      role={drill ? "button" : undefined}
    >
      <div className="value">{Number(value || 0).toLocaleString()}</div>
      <div className="label">
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </div>
    </div>
  );
}
