/**
 * Brand mark of Adrián Salvador Ekomo: a cloud lit on a dot-matrix display,
 * drawn from data points; below it a record rises toward the cloud, the orange
 * dot in transit. Ported from the portfolio (src/components/BrandMark.tsx);
 * same drawing as public/brand/mark.svg.
 *
 *   tile = true  → the full mark: dark display tile with unlit dots
 *   tile = false → lit dots only, cloud in currentColor so it follows the theme
 */
const CLOUD = [
  "......###..",
  "..##.#####.",
  ".##########",
  "###########",
  "###########",
  ".#########.",
  "...........",
  ".....w.....",
  "...........",
  ".....X.....",
];
const PITCH = 4.4;
const R = 1.85;
const COLS = CLOUD[0].length;
const ROWS = CLOUD.length;
const OX = (64 - (COLS - 1) * PITCH) / 2;
const OY = (64 - (ROWS - 1) * PITCH) / 2 + 0.6;
const ORANGE = "#ff4f00";

export function BrandMark({
  tile = false,
  size = 20,
  className,
  recordId,
}: {
  tile?: boolean;
  size?: number;
  className?: string;
  /** DOM id on the orange record dot, so motion can start from it. */
  recordId?: string;
}) {
  const pad = R + 0.6;
  const w = (COLS - 1) * PITCH + 2 * pad;
  const h = (ROWS - 1) * PITCH + 2 * pad;
  const side = Math.max(w, h);
  const viewBox = tile
    ? "0 0 64 64"
    : `${(OX - pad - (side - w) / 2).toFixed(2)} ${(OY - pad - (side - h) / 2).toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}`;

  return (
    <svg viewBox={viewBox} width={size} height={size} aria-hidden="true" className={className}>
      {tile ? <rect width="64" height="64" rx="14" fill="#121212" /> : null}
      {CLOUD.flatMap((row, y) =>
        [...row].map((c, x) => {
          const cx = OX + x * PITCH;
          const cy = OY + y * PITCH;
          if (c === ".") {
            return tile ? <circle key={`${x}-${y}`} cx={cx} cy={cy} r={R * 0.55} fill="#2b2b2b" /> : null;
          }
          const fill = c === "X" ? ORANGE : tile ? "#ebe9e4" : "currentColor";
          return (
            <circle
              key={`${x}-${y}`}
              id={c === "X" ? recordId : undefined}
              cx={cx}
              cy={cy}
              r={tile ? R : R + 0.25}
              fill={fill}
            />
          );
        }),
      )}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-semibold tracking-[-0.03em]">Smart-ERP</span>
    </span>
  );
}
