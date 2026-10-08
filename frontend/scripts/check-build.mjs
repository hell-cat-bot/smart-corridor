#!/usr/bin/env node
/**
 * Fast whole-app parse and import check.
 *
 *   node scripts/check-build.mjs
 *
 * Runs the project's own bundler over src/main.jsx without emitting anything:
 * every module is parsed (JSX included) and every import resolved, so syntax
 * errors, missing files and missing named exports all surface. Takes about a
 * second, where a full `vite build` takes a minute.
 *
 * Third-party packages are left external — this checks your code, not theirs.
 */
import { rolldown } from 'rolldown';

const isBare = (id) =>
  !id.startsWith('.') && !id.startsWith('/') && !/^[A-Za-z]:/.test(id) && !id.startsWith('\0');

/** CSS has no bearing on module correctness, so it is stubbed out. */
const stubAssets = {
  name: 'stub-assets',
  resolveId: (id) => (id.endsWith('.css') ? '\0css' : null),
  load: (id) => (id === '\0css' ? 'export default {};' : null),
};

const warnings = [];

try {
  const bundle = await rolldown({
    input: 'src/main.jsx',
    external: isBare,
    plugins: [stubAssets],
    onwarn: (w) => warnings.push(w.message || String(w)),
  });
  const { output } = await bundle.generate({ format: 'esm' });
  console.log('PARSE + RESOLVE OK');
  console.log('  modules :', Object.keys(output[0].modules || {}).length);
  console.log('  bytes   :', output[0].code.length);
} catch (err) {
  console.error('FAILED\n');
  console.error(err.message);
  process.exit(1);
}

// The plugin-timing note is about the stub above, not about your code.
const real = warnings.filter((w) => !/PLUGIN_TIMINGS/.test(w));
if (real.length) {
  console.log(`\n${real.length} warning(s):`);
  for (const w of real) console.log(' *', w);
} else {
  console.log('  warnings: none');
}
