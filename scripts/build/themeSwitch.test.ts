import { describe, expect, test } from 'bun:test';
import postcss from 'postcss';
import { scope, themeSwitch } from './themeSwitch';

const run = (css: string) => postcss([themeSwitch()]).process(css, { from: undefined }).css;

describe('theme switch', () => {
  test('scopes selectors without changing their specificity', () => {
    expect(scope(':root', "[data-theme='night']")).toEqual([":root:where([data-theme='night'])"]);
    expect(scope('body', "[data-theme='night']")).toEqual([":where(:root[data-theme='night']) body"]);
    expect(scope('[data-class="druid"]', "[data-theme='night']")).toEqual([
      `:where(:root[data-theme='night'])[data-class="druid"]`,
      `:where(:root[data-theme='night']) [data-class="druid"]`,
    ]);
  });

  test('a night block applies by system unless Day is chosen, and always when Night is', () => {
    const out = run(`.a { color: black; }\n@media (prefers-color-scheme: dark) { .a, :root { color: white; } }`);
    expect(out).toContain(`@media (prefers-color-scheme: dark) { :where(:root:not([data-theme='day'])).a, :where(:root:not([data-theme='day'])) .a, :root:where(:not([data-theme='day'])) { color: white; } }`);
    expect(out).toContain(`:where(:root[data-theme='night']).a, :where(:root[data-theme='night']) .a, :root:where([data-theme='night']) { color: white; }`);
    expect(out.indexOf(".a { color: black; }")).toBeLessThan(out.indexOf("[data-theme='night']) .a"));
  });

  test('leaves other media queries and keyframes alone', () => {
    const css = `@media (max-width: 600px) { .a { color: red; } }\n@media (prefers-color-scheme: dark) { @keyframes k { from { opacity: 0; } } }`;
    const out = run(css);
    expect(out).toContain('@media (max-width: 600px) { .a { color: red; } }');
    expect(out).toContain('from { opacity: 0; }');
    expect(out).not.toContain(':where(:root[data-theme=\'night\']) from');
  });
});
