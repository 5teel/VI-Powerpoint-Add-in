/**
 * Ambient module declaration for "vega-lite".
 *
 * Shims the package for tsconfig.moduleResolution:"node" which doesn't read
 * package.json "exports" maps. Runtime resolution (webpack, vitest) follows
 * the real exports map → ./build/index.js, which ships with types at
 * ./build/index.d.ts.
 *
 * We re-export the build-path types here so downstream callers see the full
 * vega-lite surface without tsconfig changes. If the tsconfig ever bumps to
 * moduleResolution:"node16" or "bundler", this shim can be deleted.
 */
declare module "vega-lite" {
  export * from "vega-lite/build/index";
}
