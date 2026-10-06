import {
  buildTmdbPlayerPageUrl,
  buildTmdbProviderUrl,
  getTmdbPlayerSandbox,
  normalizePositiveInteger,
  normalizeTmdbId,
  normalizeTmdbPlayerProvider,
} from './tmdb-player-sources';

describe('TMDB player path parameters', () => {
  test.each([
    [
      'vidsrc-buzz',
      'https://vidsrc.buzz',
      '/embed/movie/550',
      '/embed/tv/63247/2/1',
    ],
    ['vidfast', 'https://vidfast.vc', '/movie/550', '/tv/63247/2/1'],
    ['vidsrc-wtf', 'https://vidsrc.wtf', '/1/movie/550', '/1/tv/63247/2/1'],
  ])(
    'builds fixed movie and episode endpoints for %s',
    (provider, origin, movie, tv) => {
      const movieUrl = new URL(buildTmdbProviderUrl({ tmdbId: 550, provider }));
      const tvUrl = new URL(
        buildTmdbProviderUrl({
          tmdbId: 63247,
          mediaType: 'tv',
          season: 2,
          episode: 1,
          provider,
        }),
      );
      expect(movieUrl.origin).toBe(origin);
      expect(movieUrl.pathname).toBe(movie);
      expect(tvUrl.origin).toBe(origin);
      expect(tvUrl.pathname).toBe(tv);
      expect(getTmdbPlayerSandbox(provider)).toBeUndefined();
    },
  );

  test.each(['cinesrc', 'bingr', 'https://evil.example', null])(
    'keeps popup and top navigation restrictions for %s',
    (provider) => {
      expect(getTmdbPlayerSandbox(provider)).toBe(
        'allow-scripts allow-same-origin allow-presentation',
      );
    },
  );
  it('uses an authenticated local player for Bingr without exposing arbitrary iframe hosts', () => {
    const url = buildTmdbProviderUrl({
      tmdbId: 63247,
      mediaType: 'tv',
      provider: 'bingr',
      season: 2,
      episode: 1,
    });
    expect(url).toBe('/player/direct?tmdbId=63247&type=tv&season=2&episode=1');
    expect(
      buildTmdbPlayerPageUrl({ tmdbId: 63247, provider: 'bingr' }),
    ).toContain('provider=bingr');
  });
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
