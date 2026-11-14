/** @jest-environment node */
import { GET } from './route';

const upstream =
  'https://imdb-video.media-imdb.com/vi123/trailer.mp4?Expires=123&Signature=example~&Key-Pair-Id=abc';

const request = (source: string) =>
  new Request(
    `https://luma.example/api/trailers/imdb/media?url=${encodeURIComponent(source)}`,
    { headers: { Range: 'bytes=0-1' } },
  );

describe('IMDb trailer media fallback', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([
    upstream.replace('imdb-video.media-imdb.com', '127.0.0.1'),
    upstream.replace('trailer.mp4', 'manifest.m3u8'),
    `${upstream}&redirect=https://example.com`,
  ])('rejects unexpected upstream URLs before fetching', async (url) => {
    expect((await GET(request(url))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not follow an upstream redirect', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1/private' },
      }),
    );

    expect((await GET(request(upstream))).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it('passes through a video range without forwarding upstream cookies', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([0, 1]), {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': 'bytes 0-1/100',
          'Set-Cookie': 'upstream=example',
        },
      }),
    );

    const response = await GET(request(upstream));
    expect(String(fetchMock.mock.calls[0][0])).toBe(upstream);
    expect(fetchMock.mock.calls[0][1].headers.Range).toBe('bytes=0-1');
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-1/100');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.arrayBuffer()).toEqual(new Uint8Array([0, 1]).buffer);
  });
});
