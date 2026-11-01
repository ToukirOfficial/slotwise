import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Form } from '../src/components/form';

// Every form is submitted by JavaScript. If the browser ever submitted one natively (a click before
// hydration, a script error), a GET would put the fields, passwords included, in the URL and the access logs.

const SRC = join(import.meta.dirname, '../src');
const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
  );
const source = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('forms can never submit as GET', () => {
  it('<Form> renders method="post" with every control disabled until hydrated', () => {
    // renderToString is what the server sends: the HTML a browser has before React hydrates.
    const html = renderToString(
      createElement(
        Form,
        { onSubmit: () => {} },
        createElement('input', { name: 'password', type: 'password', defaultValue: 'secret-123' }),
        createElement('button', { type: 'submit' }, 'Log in'),
      ),
    );
    expect(html).toMatch(/<form[^>]* method="post"/);
    expect(html).not.toMatch(/method="get"/i);
    expect(html).toMatch(/<fieldset[^>]* disabled=""/);
    // The button and the password field sit inside the disabled fieldset, so neither can submit.
    expect(html.indexOf('<fieldset')).toBeLessThan(html.indexOf('type="submit"'));
    expect(html.indexOf('</fieldset>')).toBeGreaterThan(html.indexOf('type="submit"'));
  });

  it('no page uses a bare <form>: every form goes through <Form>', () => {
    const bare = tsxFiles(SRC)
      .map((f) => relative(SRC, f))
      .filter((f) => f !== join('components', 'form.tsx') && /<form[\s>]/.test(source(f)));
    expect(bare).toEqual([]);
  });

  it('the login form uses <Form>, and its button stays disabled until hydrated', () => {
    const login = source('app/(auth)/login/page.tsx');
    expect(login).toMatch(/<Form onSubmit=\{submit\}/);
    expect(login).toMatch(/disabled=\{!hydrated \|\| pending\}/);
  });
});
