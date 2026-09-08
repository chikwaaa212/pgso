import { gsap } from "gsap";

export { gsap };

interface GSAPContextLike {
  querySelectorAll(selector: string): Element[];
  revert(): void;
}

export function createGSAPContext(scope: Element | null): GSAPContextLike {
  if (!scope) {
    return {
      querySelectorAll: () => [] as Element[],
      revert: () => {},
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = gsap.context(scope as any, scope as any);
  const selector = ctx.selector as ((selector: string) => Element[]) | undefined;
  return {
    querySelectorAll: (sel: string) => (selector ? selector.call(ctx, sel) : []) as Element[],
    revert: () => ctx.revert(),
  };
}
