// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { describe, expect, it } from 'vitest';

describe('Tailwind migration CSS contract', () => {
  it('compiles the application theme, feedback animation and existing control styles', async () => {
    const from = fileURLToPath(new URL('./index.css', import.meta.url));
    const css = await readFile(from, 'utf8');
    const result = await postcss([tailwindcss()]).process(
      `${css}\n@source inline("bg-primary bg-background animate-time-flash shadow-xs focus:outline-hidden ring");`,
      { from },
    );
    const declarations = new Map<string, string[]>();
    result.root.walkDecls((declaration) => {
      declarations.set(declaration.prop, [
        ...(declarations.get(declaration.prop) ?? []), declaration.value,
      ]);
    });
    expect(declarations.get('background-color')).toContain('#2563eb');
    expect(declarations.get('background-color')).toContain('#9ca3af');
    expect(declarations.get('--color-gray-200')).toContain('#e5e7eb');
    expect(declarations.get('--color-gray-400')).toContain('#9ca3af');
    expect(declarations.get('border-color')).toContain('var(--color-gray-200, currentColor)');
    const selectors: string[] = [];
    result.root.walkRules((rule) => { selectors.push(rule.selector); });
    expect(selectors).toContain('.shadow-xs');
    expect(selectors.some((selector) => selector.includes('.focus\\:outline-hidden'))).toBe(true);
    expect(selectors).toContain('.animate-time-flash');
    const animations: string[] = [];
    result.root.walkAtRules('keyframes', (rule) => { animations.push(rule.params); });
    expect(animations).toContain('time-flash');
  }, 30000);
});
