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
    expect(url.origin).toBe('https://vidlink.pro');
    expect(url.pathname).toBe('/tv/123/1/2');
    expect(url.searchParams.has('url')).toBe(false);
  });

  test.each(['videasy', 'vidking', null])(
    'migrates retired or default provider %s to VidLink',
    (provider) => {
      expect(normalizeTmdbPlayerProvider(provider)).toBe('vidlink');
      const url = new URL(buildTmdbProviderUrl({ tmdbId: 550, provider }));
      expect(url.origin).toBe('https://vidlink.pro');
      expect(url.pathname).toBe('/movie/550');
      expect(buildTmdbPlayerPageUrl({ tmdbId: 550, provider })).toContain(
        'provider=vidlink',
      );
    },
  );

  it('uses the documented VidLink episode path and color parameter', () => {
    const url = new URL(
      buildTmdbProviderUrl({
        tmdbId: 1399,
        mediaType: 'tv',
        season: 2,
        episode: 3,
        accentColor: '#557efc',
      }),
    );
    expect(url.pathname).toBe('/tv/1399/2/3');
    expect(url.searchParams.get('primaryColor')).toBe('557efc');
    expect(url.searchParams.get('autoplay')).toBe('true');
    expect(url.searchParams.has('overlay')).toBe(false);
  });
});
