import { rolldown } from 'rolldown';

const isBare = (id) =>
  !id.startsWith('.') && !id.startsWith('/') && !/^[A-Za-z]:/.test(id) && !id.startsWith('\0');

const stub = {
  name: 'stub-assets',
  resolveId(id) {
    return id.endsWith('.css') ? '\0css' : null;
  },
  load(id) {
    return id === '\0css' ? 'export default {};' : null;
  },
};

const warnings = [];
try {
  const bundle = await rolldown({
    input: 'src/main.jsx',
    external: isBare,
    plugins: [stub],
    onwarn(w) { warnings.push(w.message || String(w)); },
  });
  const { output } = await bundle.generate({ format: 'esm' });
  console.log('PARSE + RESOLVE OK');
  console.log('bundled bytes :', output[0].code.length);
  console.log('modules       :', Object.keys(output[0].modules || {}).length);
} catch (err) {
  console.log('FAILED');
  console.log(err.message);
  process.exitCode = 1;
}
if (warnings.length) {
  console.log('--- warnings (' + warnings.length + ') ---');
  for (const w of warnings.slice(0, 40)) console.log(' *', w);
} else {
  console.log('no warnings');
}
