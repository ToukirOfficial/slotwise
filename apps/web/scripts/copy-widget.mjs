// Copies the built widget into public/ so Next serves it at /widget/v1.js.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const pkg = createRequire(import.meta.url).resolve('@slotwise/widget/package.json');
mkdirSync('public/widget', { recursive: true });
copyFileSync(join(dirname(pkg), 'dist/v1.js'), 'public/widget/v1.js');
console.log('copied widget to public/widget/v1.js');
