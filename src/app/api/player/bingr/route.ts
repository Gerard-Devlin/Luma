import { NextResponse } from 'next/server';

import { bingrMediaProxyUrl, unwrapBingrMediaUrl } from '@/lib/bingr-player';
import {
  normalizePositiveInteger,
  normalizeTmdbId,
  normalizeTmdbPlayerMediaType,
} from '@/lib/tmdb-player-sources';

const API = 'https://api.bingr.one/api';
const HEADERS = {
  Accept: 'application/json',
  Origin: 'https://bingr.one',
  Referer: 'https://bingr.one/',
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const tmdbId = normalizeTmdbId(params.get('tmdbId'));
  if (!tmdbId)
    return NextResponse.json({ error: 'Invalid TMDB ID' }, { status: 400 });
  const mediaType = normalizeTmdbPlayerMediaType(params.get('type'));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const options = {
    signal: controller.signal,
    redirect: 'manual' as const,
    headers: HEADERS,
  };
  try {
    const detailsResponse = await fetch(
      `${API}/details/${mediaType}/${tmdbId}`,
      options,
    );
    if (!detailsResponse.ok) throw new Error('Metadata unavailable');
    const details = (await detailsResponse.json()) as {
      title?: string;
      year?: string;
      imdb_id?: string;
    };
    const query: Record<string, string | number> = {};
    if (typeof details.title === 'string')
      query.title = details.title.slice(0, 300);
    if (typeof details.year === 'string')
      query.year = details.year.slice(0, 10);
    if (typeof details.imdb_id === 'string')
      query.imdb_id = details.imdb_id.slice(0, 30);
    if (mediaType === 'tv') {
      query.season = normalizePositiveInteger(params.get('season'));
      query.episode = normalizePositiveInteger(params.get('episode'));
    }
    const response = await fetch(`${API}/stream`, {
      ...options,
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        srv: 's3',
        t: mediaType,
        id: String(tmdbId),
        query,
      }),
    });
    if (!response.ok) throw new Error('Stream unavailable');
    const payload = (await response.json()) as {
      sources?: Array<{ url?: string; type?: string }>;
    };
    for (const source of (payload.sources || []).slice(0, 8)) {
      if (
        typeof source.url !== 'string' ||
        !/mpegurl|hls/i.test(source.type || '')
      )
        continue;
      try {
        const url = unwrapBingrMediaUrl(source.url);
        return NextResponse.json(
          { streamUrl: bingrMediaProxyUrl(url.href), title: details.title },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      } catch {
        /* Try another supported source. */
      }
    }
    throw new Error('No supported stream');
  } catch {
    return NextResponse.json(
      { error: 'Bingr is unavailable for this title' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
