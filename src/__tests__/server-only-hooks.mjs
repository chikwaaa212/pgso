// Test-only resolver for `node --test`:
// 1. Stubs the `server-only` package (which throws on import outside React
//    Server Components) so deterministic lib modules can be unit-tested.
// 2. Resolves extensionless relative imports to their `.ts` source files
//    (repo convention; Next/TS bundler style). Production builds are
//    unaffected — this file only loads via the `test` script's --import.
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {};",
      shortCircuit: true,
    };
  }
  // Map the `@/*` tsconfig alias to `./src/*` (test-only; production
  // builds resolve it via the bundler). Falls back to `.ts` like the
  // extensionless-relative branch below.
  if (specifier.startsWith("@/")) {
    const rewritten = new URL(specifier.slice(2), new URL("../", import.meta.url)).href;
    try {
      return await next(rewritten, context);
    } catch (e) {
      if (e?.code === "ERR_MODULE_NOT_FOUND") {
        return await next(`${rewritten}.ts`, context);
      }
      throw e;
    }
  }
  try {
    return await next(specifier, context);
  } catch (e) {
    if (
      (e?.code === "ERR_MODULE_NOT_FOUND" || e?.code === "ERR_UNSUPPORTED_DIR_IMPORT") &&
      (specifier.startsWith("./") || specifier.startsWith("../"))
    ) {
      return await next(`${specifier}.ts`, context);
    }
    throw e;
  }
}
