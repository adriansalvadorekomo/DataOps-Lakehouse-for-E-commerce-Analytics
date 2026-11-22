/** Numbers drawn on a dot-matrix display, like the brand mark.
 * A 5×7 glyph per character; lit dots light up in a stagger on mount. */
import { useRef } from "react";
import { gsap, useGSAP, withMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "₹": ["11111", "00100", "11111", "00100", "11000", "00110", "00001"],
};

export function DotMatrix({
  value,
  dot = 6,
  gap = 3,
  className,
  tone = "ink",
  label,
}: {
  value: string;
  dot?: number;
  gap?: number;
  className?: string;
  tone?: "ink" | "signal";
  label?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const chars = [...value].filter((c) => GLYPHS[c]);
  const pitch = dot + gap;
  const charW = 5 * pitch + pitch; // one empty column between glyphs
  const width = chars.length * charW - pitch;
  const height = 7 * pitch - gap;

  useGSAP(
    () => {
      withMotion(() => {
        gsap.from(".lit", {
          opacity: 0,
          scale: 0.2,
          transformOrigin: "50% 50%",
          duration: 0.5,
          stagger: { each: 0.004, from: "random" },
          ease: "back.out(2)",
        });
      });
    },
    { scope: ref, dependencies: [value] },
  );

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label ?? value}
      className={cn("max-w-full h-auto", className)}
    >
      {chars.flatMap((c, i) =>
        GLYPHS[c].flatMap((row, y) =>
          [...row].map((bit, x) => (
            <circle
              key={`${i}-${x}-${y}`}
              className={bit === "1" ? "lit" : undefined}
              cx={i * charW + x * pitch + dot / 2}
              cy={y * pitch + dot / 2}
              r={bit === "1" ? dot / 2 : dot / 4.5}
              fill={bit === "1" ? (tone === "signal" ? "var(--signal)" : "var(--ink)") : "var(--dot-off)"}
            />
          )),
        ),
      )}
    </svg>
  );
}

/** A horizontal meter drawn as a row of dots, lit in proportion to `value` (0–1). */
export function DotBar({
  value,
  dots = 24,
  tone = "ink",
  className,
  fluid = false,
}: {
  value: number;
  dots?: number;
  tone?: "ink" | "signal" | "violet" | "good" | "warn";
  className?: string;
  /** Spread the dots across the available width instead of a fixed run. */
  fluid?: boolean;
}) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * dots);
  const color = { ink: "var(--ink)", signal: "var(--signal)", violet: "var(--violet)", good: "var(--good)", warn: "var(--warn)" }[tone];
  return (
    <span
      className={cn(fluid ? "flex w-full items-center justify-between gap-[2px]" : "inline-flex items-center gap-[3px]", className)}
      aria-hidden="true"
    >
      {Array.from({ length: dots }, (_, i) => (
        <span
          key={i}
          className="size-[5px] rounded-full"
          style={{ background: i < lit ? color : "var(--dot-off)" }}
        />
      ))}
    </span>
  );
}
