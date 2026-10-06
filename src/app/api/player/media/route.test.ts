/** @jest-environment node */
import { GET } from './route';

describe('media relay outbound requests', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });
  const request = (url: string) =>
    new Request(
      `https://luma.example/api/player/media?url=${encodeURIComponent(url)}`,
    );

  it('rejects arbitrary targets before making an outbound request', async () => {
    expect((await GET(request('https://127.0.0.1/secret'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not follow redirects from an allowed media host', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1/secret' },
      }),
    );
    expect(
      (await GET(request('https://futurefocusedentrepreneurs.site/segment')))
        .status,
    ).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });
  it('never serves upstream HTML as executable same-origin content', async () => {
    fetchMock.mockResolvedValue(
      new Response('<script>alert(1)</script>', {
        headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'evil=1' },
      }),
    );
    const response = await GET(
      request('https://futurefocusedentrepreneurs.site/segment'),
    );
    expect(response.headers.get('content-type')).toBe(
      'application/octet-stream',
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.has('set-cookie')).toBe(false);
  });
});
