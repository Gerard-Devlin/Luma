/** @jest-environment node */
import { GET } from './route';

describe('Bingr resolver', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('rejects invalid content IDs before querying a provider', async () => {
    const response = await GET(
      new Request(
        'https://luma.example/api/player/bingr?tmdbId=1%2F..%2Fadmin',
      ),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('resolves only allowlisted media URLs through fixed API endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ title: 'Westworld', year: '2016' })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sources: [
              {
                url: 'https://futurefocusedentrepreneurs.site/master.m3u8',
                type: 'application/x-mpegurl',
              },
            ],
          }),
        ),
      );
    const response = await GET(
      new Request(
        'https://luma.example/api/player/bingr?tmdbId=63247&type=tv&season=2&episode=1',
      ),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).streamUrl).toContain(
      '/api/player/media?url=',
    );
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://api.bingr.one/api/details/tv/63247',
      'https://api.bingr.one/api/stream',
    ]);
    expect(
      fetchMock.mock.calls.every((call) => call[1].redirect === 'manual'),
    ).toBe(true);
    const requestBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(requestBody.query).toMatchObject({ season: 2, episode: 1 });
  });
  it('rejects provider results that point to private or unknown hosts', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: 'Test' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sources: [{ url: 'https://127.0.0.1/master.m3u8', type: 'hls' }],
          }),
        ),
      );
    expect(
      (
        await GET(
          new Request('https://luma.example/api/player/bingr?tmdbId=550'),
        )
      ).status,
    ).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
