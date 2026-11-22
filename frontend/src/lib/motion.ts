/** GSAP setup. Every animation goes through `withMotion`, so users who prefer
 * reduced motion get the final state immediately (gsap.matchMedia). */
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, Flip, ScrollTrigger);
gsap.defaults({ ease: "power3.out", duration: 0.6 });

export const REDUCED = "(prefers-reduced-motion: reduce)";
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(REDUCED).matches === true;
}

/** Run `fn` only when motion is allowed; returns the matchMedia for cleanup. */
export function withMotion(fn: () => void) {
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, fn);
  return mm;
}

export { gsap, Flip, ScrollTrigger, useGSAP };
