import {
  buildTmdbProviderUrl,
  normalizePositiveInteger,
  normalizeTmdbId,
} from './tmdb-player-sources';

describe('TMDB player path parameters', () => {
  test.each([
    '1/../../admin',
    '123abc',
    '1e3',
    '0x10',
    '-1',
    '0',
    '9007199254740992',
    'https://localhost',
    '1?url=http://127.0.0.1',
  ])('rejects malformed id %s', (value) => {
    expect(normalizeTmdbId(value)).toBeNull();
    expect(normalizePositiveInteger(value, 2)).toBe(2);
  });

  it('accepts safe positive integers', () => {
    expect(normalizeTmdbId(' 123 ')).toBe(123);
    expect(normalizePositiveInteger('02')).toBe(2);
    expect(normalizeTmdbId(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(normalizeTmdbId(Infinity)).toBeNull();
  });

  it('keeps provider hosts fixed even with malicious provider and query inputs', () => {
    const url = new URL(
      buildTmdbProviderUrl({
        tmdbId: 123,
        mediaType: 'tv',
        provider: 'https://127.0.0.1',
        season: '1/../../admin',
        episode: 2,
        accentColor: 'red&url=https://127.0.0.1',
      }),
    );
    expect(url.origin).toBe('https://player.videasy.to');
    expect(url.pathname).toBe('/tv/123/1/2');
    expect(url.searchParams.has('url')).toBe(false);
  });
});
