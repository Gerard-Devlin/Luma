/** @jest-environment node */
import { GET } from './route';

describe('player resolver outbound requests', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TMDB_API_KEY;
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env.TMDB_API_KEY = 'test-key';
    global.fetch = fetchMock;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ episodes: [] }),
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalApiKey;
  });

  it('builds a fixed-origin request with encoded query parameters and no redirects', async () => {
    const response = await GET(
      new Request(
        'https://luma.example/api/player/resolve?tmdbId=123&type=tv&season=2&tmdbLanguage=zh-CN%26url%3Dhttp%3A%2F%2F127.0.0.1',
      ),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.origin).toBe('https://api.themoviedb.org');
    expect(url.pathname).toBe('/3/tv/123/season/2');
    expect(url.searchParams.get('language')).toBe('zh-CN');
    expect(url.searchParams.has('url')).toBe(false);
    expect(options.redirect).toBe('error');
  });

  it('rejects invalid ids before making any outbound request', async () => {
    const response = await GET(
      new Request(
        'https://luma.example/api/player/resolve?tmdbId=1%2F..%2Fadmin&type=tv',
      ),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(['videasy', 'vidking', 'vidlink'])(
    'resolves retired %s links using CineSrc',
    async (provider) => {
      const response = await GET(
        new Request(
          `https://luma.example/api/player/resolve?tmdbId=550&provider=${provider}`,
        ),
      );
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.provider.id).toBe('cinesrc');
      expect(new URL(result.embedUrl).origin).toBe('https://cinesrc.st');
      expect(new URL(result.embedUrl).pathname).toBe('/embed/movie/550');
      expect(result.storageId).toBe('550');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('handles a refused redirect without exposing the destination', async () => {
    fetchMock.mockRejectedValue(new TypeError('redirect rejected'));
    const response = await GET(
      new Request('https://luma.example/api/player/resolve?tmdbId=123&type=tv'),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).seasonDetail).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
