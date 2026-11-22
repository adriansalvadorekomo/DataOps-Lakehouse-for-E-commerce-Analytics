import type { RefObject } from "react";
import { gsap, ScrollTrigger, useGSAP, withMotion } from "@/lib/motion";

/** Stagger `.reveal` children into view; below-the-fold ones reveal on scroll. */
export function useReveal(scope: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      withMotion(() => {
        const items = gsap.utils.toArray<HTMLElement>(".reveal", scope.current);
        const fold = window.innerHeight;
        const above = items.filter((el) => el.getBoundingClientRect().top < fold);
        const below = items.filter((el) => el.getBoundingClientRect().top >= fold);
        gsap.from(above, { opacity: 0, y: 16, duration: 0.55, stagger: 0.05, delay: 0.05 });
        below.forEach((el) =>
          gsap.from(el, { opacity: 0, y: 20, duration: 0.6, scrollTrigger: { trigger: el, start: "top 92%", once: true } }),
        );
        ScrollTrigger.refresh();
      });
    },
    { scope, dependencies: deps },
  );
}
