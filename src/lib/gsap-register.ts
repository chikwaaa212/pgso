import { gsap } from "gsap";
import { ScrollTrigger, ScrollToPlugin } from "gsap/all";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
}

export { gsap, ScrollTrigger };
