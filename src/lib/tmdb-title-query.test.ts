import { hasSourceCodeInTitle } from './tmdb-title-query';

describe('source codes in TMDB query titles', () => {
  test.each(['ABC-123', 'abc_123', 'abc 123', 'abc123', 'abc\t-\n123'])(
    'recognizes %s',
    (title) => {
      expect(hasSourceCodeInTitle(title)).toBe(true);
    },
  );

  test.each(['The Matrix', 'abc-1', 'abcdefgh123', 'abc1234567'])(
    'rejects %s',
    (title) => {
      expect(hasSourceCodeInTitle(title)).toBe(false);
    },
  );

  it('handles long whitespace runs without ambiguous backtracking', () => {
    const padding = ' '.repeat(100_000);
    expect(hasSourceCodeInTitle(`abc${padding}!`)).toBe(false);
    expect(hasSourceCodeInTitle(`abc${padding}123`)).toBe(true);
    expect(hasSourceCodeInTitle(`abc-${padding}123`)).toBe(true);
  });
});
