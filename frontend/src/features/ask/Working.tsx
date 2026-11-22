import { useEffect, useRef, useState } from "react";
import type { AskMode } from "@/lib/api";
import { gsap, useGSAP, withMotion } from "@/lib/motion";

const STEPS: Record<AskMode, string[]> = {
  data: ["Reading the order book", "Counting orders", "Comparing periods", "Checking the numbers", "Writing the answer"],
  docs: ["Searching your documents", "Reading the relevant passages", "Checking every claim", "Writing the answer"],
};

/** A 3×3 dot-matrix that keeps lighting up — the brand's display, thinking. */
function MatrixSpinner() {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(
    () => {
      const dots = gsap.utils.toArray<SVGCircleElement>(".m", ref.current);
      withMotion(() => {
        gsap.to(dots, {
          opacity: 1,
          scale: 1,
          duration: 0.28,
          ease: "power2.out",
          repeat: -1,
          yoyo: true,
          transformOrigin: "50% 50%",
          stagger: { each: 0.09, from: "random", repeat: -1, yoyo: true },
        });
      });
    },
    { scope: ref },
  );
  return (
    <svg ref={ref} viewBox="0 0 22 22" width={22} height={22} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <circle
          key={i}
          className="m"
          cx={3 + (i % 3) * 8}
          cy={3 + Math.floor(i / 3) * 8}
          r={2.4}
          fill={i === 7 ? "var(--signal)" : "var(--ink)"}
          opacity={0.25}
          style={{ transform: "scale(0.7)" }}
        />
      ))}
    </svg>
  );
}

/** "Working…" state, in the spirit of Claude Code: a live glyph, a shimmering
 * verb that moves through the steps, and the elapsed time. */
export function Working({ mode }: { mode: AskMode }) {
  const [step, setStep] = useState(0);
  const [secs, setSecs] = useState(0);
  const label = useRef<HTMLSpanElement>(null);
  const steps = STEPS[mode];

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setSecs(Math.floor((Date.now() - started) / 1000)), 250);
    const next = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 1400);
    return () => { clearInterval(tick); clearInterval(next); };
  }, [steps.length]);

  useGSAP(
    () => {
      withMotion(() => {
        gsap.fromTo(label.current, { y: 6, opacity: 0, filter: "blur(3px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.35 });
      });
    },
    { dependencies: [step] },
  );

  return (
    <div className="flex items-center gap-3 py-1" role="status" aria-live="polite">
      <MatrixSpinner />
      <span ref={label} className="shimmer-text text-[14.5px] font-medium">{steps[step]}…</span>
      <span className="num text-[12px] text-ink-3">{secs}s · esc to stop</span>
    </div>
  );
}
