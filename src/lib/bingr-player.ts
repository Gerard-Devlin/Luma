// Media URLs discovered through Bingr's public API. Keep the relay bounded to
// known media hosts: it must never become an arbitrary URL proxy.
const MEDIA_HOSTS = new Set([
  'futurefocusedentrepreneurs.site',
  'remoteconsultinggroup.site',
  'digitalassetlaunchpad.site',
]);

export function validateBingrMediaUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !MEDIA_HOSTS.has(url.hostname)
  )
    throw new Error('Unsupported media host');
  url.hash = '';
  return url;
}

export function unwrapBingrMediaUrl(value: string): URL {
  let url = new URL(value);
  for (
    let depth = 0;
    depth < 4 && url.hostname === 'wormhole.filmu.in';
    depth++
  ) {
    const upstream = url.searchParams.get('url');
    if (!upstream) throw new Error('Missing upstream media URL');
    url = new URL(upstream);
  }
  return validateBingrMediaUrl(url.href);
}

export function bingrMediaProxyUrl(value: string): string {
  return `/api/player/media?url=${encodeURIComponent(validateBingrMediaUrl(value).href)}`;
}

export function rewriteBingrPlaylist(body: string, base: URL): string {
  if (!body.trimStart().startsWith('#EXTM3U'))
    throw new Error('Invalid playlist');
  const rewrite = (uri: string) => bingrMediaProxyUrl(new URL(uri, base).href);
  return body
    .split(/\r?\n/)
    .map((line) => {
      if (!line || !line.trim()) return line;
      if (line.startsWith('#')) {
        return line.replace(
          /URI="([^"]+)"/g,
          (_, uri: string) => `URI="${rewrite(uri)}"`,
        );
      }
      return rewrite(line.trim());
    })
    .join('\n');
}
