// A PostCSS plugin that lets the user's theme choice override the system's.
//
// Stylesheets keep writing night rules the natural way, inside `@media (prefers-color-scheme: dark) { … }`. This
// rewrites each such block into two:
//   - the media block stays, but only applies while the user hasn't chosen Day:  :root:not([data-theme='day']) …
//   - a copy outside it applies whenever the user has chosen Night:              :root[data-theme='night'] …
// The added parts are wrapped in :where(), so every rule keeps the specificity it had and the cascade is unchanged.
import type { AtRule, PluginCreator, Rule } from 'postcss';

const DARK = /^\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/;

/** Scopes one selector to the given root condition, e.g. "[data-theme='night']". */
export function scope(selector: string, cond: string): string[] {
  const s = selector.trim();
  // :root itself (the tokens): keep it as :root so it beats the plain :root rules by order, as before.
  if (/^:root\b/.test(s)) return [s.replace(/^:root/, `:root:where(${cond})`)];
  if (/^html\b/.test(s)) return [s.replace(/^html/, `html:where(${cond})`)];
  const root = `:where(:root${cond})`;
  // A type selector (body, a, h2…) can only follow the root as a descendant.
  if (/^[a-z*]/i.test(s)) return [`${root} ${s}`];
  // Classes, attributes and pseudo-classes may sit on the root itself ([data-class] does) or below it.
  return [`${root}${s}`, `${root} ${s}`];
}

const scopeRule = (rule: Rule, cond: string) => {
  // Keyframe steps (from, 50%) aren't selectors.
  if (rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as AtRule).name)) return;
  rule.selectors = rule.selectors.flatMap((sel) => scope(sel, cond));
};

export const themeSwitch: PluginCreator<void> = () => ({
  postcssPlugin: 'aj-theme-switch',
  OnceExit(root) {
    root.walkAtRules('media', (media) => {
      if (!DARK.test(media.params.trim()) || media.raws.ajTheme) return;
      media.raws.ajTheme = true;
      const forced = media.clone();
      media.walkRules((r) => scopeRule(r, ":not([data-theme='day'])"));
      forced.walkRules((r) => scopeRule(r, "[data-theme='night']"));
      // The forced copy: the media block's contents, unconditionally, right after it.
      media.after(forced.nodes ?? []);
    });
  },
});
themeSwitch.postcss = true;
