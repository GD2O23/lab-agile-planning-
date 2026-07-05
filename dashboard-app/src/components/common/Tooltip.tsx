import { useState } from "react";

interface Props {
  text: string;
}

export function Tooltip({ text }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="tooltip-anchor"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      tabIndex={0}
      aria-label={text}
    >
      ?
      {visible && <span className="tooltip-bubble" role="tooltip">{text}</span>}
    </span>
  );
}
