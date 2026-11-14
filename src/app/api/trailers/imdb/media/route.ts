const IMDB_VIDEO_ORIGIN = 'https://imdb-video.media-imdb.com';
const MP4_PATH = /^\/vi\d+\/[\w-]+\.mp4$/;
const SIGNATURE_PARAMS = ['Expires', 'Signature', 'Key-Pair-Id'];

function getImdbMp4Target(value: string): URL | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== IMDB_VIDEO_ORIGIN ||
      url.username ||
      url.password ||
      !MP4_PATH.test(url.pathname) ||
      Array.from(url.searchParams.keys()).length !== SIGNATURE_PARAMS.length ||
      !SIGNATURE_PARAMS.every((name) =>
        /^[\w~-]+$/.test(url.searchParams.get(name) || ''),
      )
    ) {
      return null;
    }
    return new URL(`${url.pathname}${url.search}`, IMDB_VIDEO_ORIGIN);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const target = getImdbMp4Target(
    new URL(request.url).searchParams.get('url') || '',
  );
  if (!target) return new Response(null, { status: 400 });

  const range = request.headers.get('Range');
  try {
    const upstream = await fetch(target, {
      headers:
        range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range)
          ? { Range: range }
          : undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: request.signal,
    });

    if (
      (upstream.status !== 200 && upstream.status !== 206) ||
      !upstream.headers.get('Content-Type')?.startsWith('video/mp4') ||
      !upstream.body
    ) {
      await upstream.body?.cancel();
      return new Response(null, {
        status: upstream.status === 416 ? 416 : 502,
      });
    }

    const headers = new Headers({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'video/mp4',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of ['Accept-Ranges', 'Content-Length', 'Content-Range']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
