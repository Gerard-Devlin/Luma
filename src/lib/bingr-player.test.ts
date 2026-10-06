import {
  bingrMediaProxyUrl,
  rewriteBingrPlaylist,
  unwrapBingrMediaUrl,
  validateBingrMediaUrl,
} from './bingr-player';

const media = 'https://futurefocusedentrepreneurs.site/video/master.m3u8';

describe('bounded Bingr media relay', () => {
  it('supports the verified episode-specific CDN without accepting lookalikes', () => {
    expect(
      validateBingrMediaUrl('https://digitalassetlaunchpad.site/master.m3u8')
        .hostname,
    ).toBe('digitalassetlaunchpad.site');
    expect(() =>
      validateBingrMediaUrl(
        'https://digitalassetlaunchpad.site.evil.example/master.m3u8',
      ),
    ).toThrow();
  });
  test.each([
    'http://futurefocusedentrepreneurs.site/video',
    'https://futurefocusedentrepreneurs.site:8443/video',
    'https://user:password@futurefocusedentrepreneurs.site/video',
    'https://futurefocusedentrepreneurs.site.evil.example/video',
    'https://127.0.0.1/video',
    'https://[::1]/video',
    'https://localhost/video',
    'https://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd',
  ])('rejects unsafe media URL %s', (value) => {
    expect(() => validateBingrMediaUrl(value)).toThrow();
  });

  it('unwraps only the known provider proxy and then validates its target', () => {
    expect(
      unwrapBingrMediaUrl(
        `https://wormhole.filmu.in/proxy/m3u8?url=${encodeURIComponent(media)}`,
      ).href,
    ).toBe(media);
    expect(() =>
      unwrapBingrMediaUrl(
        `https://wormhole.filmu.in/proxy/m3u8?url=${encodeURIComponent('https://127.0.0.1/')}`,
      ),
    ).toThrow();
    expect(() =>
      unwrapBingrMediaUrl(
        `https://evil.example/?url=${encodeURIComponent(media)}`,
      ),
    ).toThrow();
  });

  it('relays variants, segments, encryption keys and initialization maps', () => {
    const result = rewriteBingrPlaylist(
      '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n720/index.m3u8\nsegment.ts',
      new URL(media),
    );
    for (const path of [
      'init.mp4',
      'key.bin',
      '720/index.m3u8',
      'segment.ts',
    ]) {
      expect(result).toContain(bingrMediaProxyUrl(new URL(path, media).href));
    }
    expect(() =>
      rewriteBingrPlaylist('#EXTM3U\nhttps://127.0.0.1/secret', new URL(media)),
    ).toThrow();
    expect(() =>
      rewriteBingrPlaylist(
        '#EXTM3U\n#EXT-X-KEY:URI="https://evil.example/key"',
        new URL(media),
      ),
    ).toThrow();
    expect(() =>
      rewriteBingrPlaylist('<html>blocked</html>', new URL(media)),
    ).toThrow();
  });
});
