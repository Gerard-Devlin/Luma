import {
  rewriteBingrPlaylist,
  validateBingrMediaUrl,
} from '@/lib/bingr-player';

export async function GET(request: Request) {
  let url: URL;
  try {
    url = validateBingrMediaUrl(
      new URL(request.url).searchParams.get('url') || '',
    );
  } catch {
    return new Response('Unsupported media URL', { status: 400 });
  }
  // Construct the outbound origin from constants rather than forwarding a
  // user-supplied URL, even after validation. Only path/query can vary.
  const target =
    url.hostname === 'futurefocusedentrepreneurs.site'
      ? new URL('https://futurefocusedentrepreneurs.site')
      : url.hostname === 'remoteconsultinggroup.site'
        ? new URL('https://remoteconsultinggroup.site')
        : url.hostname === 'digitalassetlaunchpad.site'
          ? new URL('https://digitalassetlaunchpad.site')
          : null;
  if (!target) return new Response('Unsupported media URL', { status: 400 });
  target.pathname = url.pathname;
  target.search = url.search;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const headers: Record<string, string> = {
      Referer: 'https://nextgencloudfabric.com/',
      Origin: 'https://nextgencloudfabric.com',
    };
    const range = request.headers.get('range');
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range;
    const response = await fetch(target, {
      headers,
      signal: controller.signal,
      redirect: 'manual',
    });
    if (!response.ok) return new Response('Media unavailable', { status: 502 });
    const outputHeaders = new Headers({
      'Cache-Control': 'private, max-age=30',
      'X-Content-Type-Options': 'nosniff',
    });
    if (url.pathname.endsWith('.m3u8')) {
      if (Number(response.headers.get('content-length')) > 512000)
        throw new Error('Playlist too large');
      const body = await response.text();
      if (body.length > 512000) throw new Error('Playlist too large');
      outputHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
      return new Response(rewriteBingrPlaylist(body, url), {
        headers: outputHeaders,
      });
    }
    // Some upstreams deliberately give media an HTML MIME type. Never serve it
    // as executable HTML on our own origin.
    outputHeaders.set('Content-Type', 'application/octet-stream');
    for (const name of ['content-range', 'accept-ranges']) {
      const value = response.headers.get(name);
      if (value) outputHeaders.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outputHeaders,
    });
  } catch {
    return new Response('Media unavailable', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
