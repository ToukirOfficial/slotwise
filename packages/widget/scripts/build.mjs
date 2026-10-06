// Bundles the widget into one self-contained IIFE: dist/v1.js (served by the web app at /widget/v1.js).
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

const MAX_GZIP_BYTES = 30 * 1024; // PRD F8 target

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/v1.js',
  legalComments: 'none',
};

if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('widget: watching');
} else {
  await esbuild.build(options);
  const gz = gzipSync(readFileSync('dist/v1.js')).length;
  console.log(`widget: dist/v1.js ${(gz / 1024).toFixed(1)} KB gzipped`);
  if (gz > MAX_GZIP_BYTES) {
    console.error(`widget is over the ${MAX_GZIP_BYTES / 1024} KB budget`);
    process.exit(1);
  }
}
