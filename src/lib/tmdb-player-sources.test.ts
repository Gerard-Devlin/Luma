import {
  buildTmdbPlayerPageUrl,
  buildTmdbProviderUrl,
  normalizePositiveInteger,
  normalizeTmdbId,
  normalizeTmdbPlayerProvider,
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
    expect(url.origin).toBe('https://cinesrc.st');
    expect(url.pathname).toBe('/embed/tv/123');
    expect(url.searchParams.get('s')).toBe('1');
    expect(url.searchParams.get('e')).toBe('2');
    expect(url.searchParams.has('url')).toBe(false);
  });

  test.each(['videasy', 'vidking', 'vidlink', null])(
    'migrates retired or default provider %s to CineSrc',
    (provider) => {
      expect(normalizeTmdbPlayerProvider(provider)).toBe('cinesrc');
      const url = new URL(buildTmdbProviderUrl({ tmdbId: 550, provider }));
      expect(url.origin).toBe('https://cinesrc.st');
      expect(url.pathname).toBe('/embed/movie/550');
      expect(buildTmdbPlayerPageUrl({ tmdbId: 550, provider })).toContain(
        'provider=cinesrc',
      );
    },
  );

  it('uses the documented CineSrc episode path and color parameter', () => {
    const url = new URL(
      buildTmdbProviderUrl({
        tmdbId: 1399,
        mediaType: 'tv',
        season: 2,
        episode: 3,
        accentColor: '#557efc',
      }),
    );
    expect(url.pathname).toBe('/embed/tv/1399');
    expect(url.searchParams.get('s')).toBe('2');
    expect(url.searchParams.get('e')).toBe('3');
    expect(url.searchParams.get('color')).toBe('#557efc');
    expect(url.searchParams.get('autoplay')).toBe('true');
    expect(url.searchParams.get('autonext')).toBe('false');
    expect(url.searchParams.has('overlay')).toBe(false);
  });
});
