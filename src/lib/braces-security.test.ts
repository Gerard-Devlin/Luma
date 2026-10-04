/** @jest-environment node */
import { createRequire } from 'module';

// Exercise the actual patched dependency used by Tailwind's matcher, rather
// than a copy of the patch or a separately installed test-only version.
const tailwindRequire = createRequire(require.resolve('tailwindcss'));
const matcherRequire = createRequire(tailwindRequire.resolve('micromatch'));
const braces = matcherRequire('braces');

describe('braces CVE-2026-93687 mitigation', () => {
  test.each(['parse', 'compile', 'expand', 'stringify'])(
    '%s rejects deeply nested patterns with a controlled syntax error',
    (method) => {
      const nested = '{'.repeat(4_000) + 'a,b' + '}'.repeat(4_000);
      expect(() => braces[method](nested)).toThrow(SyntaxError);
      expect(() => braces[method](nested)).toThrow('maximum depth');
      expect(() => braces[method]('('.repeat(10_000))).toThrow(SyntaxError);
      expect(() => braces[method]('{'.repeat(10_000))).toThrow(SyntaxError);
    },
  );

  test.each(['compile', 'expand', 'stringify'])(
    '%s rejects an excessively deep caller-supplied AST',
    (method) => {
      let ast = { type: 'text', value: 'a', nodes: [] as unknown[] };
      for (let depth = 0; depth < 2_000; depth++) {
        ast = { type: 'root', value: '', nodes: [ast] };
      }
      expect(() => braces[method](ast)).toThrow(SyntaxError);
      expect(() => braces[method](ast)).toThrow('maximum depth');
    },
  );

  it('preserves ordinary brace patterns used by build tools', () => {
    expect(braces.expand('src/**/*.{ts,tsx}')).toEqual([
      'src/**/*.ts',
      'src/**/*.tsx',
    ]);
    expect(braces.compile('a/{b,c}/d')).toBe('a/(b|c)/d');
    expect(braces.expand('a/{b,{c,d}}/e')).toEqual(['a/b/e', 'a/c/e', 'a/d/e']);
    expect(braces.stringify(braces.parse('a/{b,c}/d'))).toBe('a/{b,c}/d');
  });
});
