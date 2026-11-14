import { NextResponse } from 'next/server';

import { fetchImdbTrailerStreams } from '@/lib/imdb-trailer';
import {
  pickBestHlsTrailerStream,
  pickBestMp4TrailerStream,
} from '@/lib/trailer-stream';

const IMDB_ID_PATTERN = /^tt\d+$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imdbId = searchParams.get('imdbId')?.trim() ?? '';

  if (!IMDB_ID_PATTERN.test(imdbId)) {
    return NextResponse.json(
      { url: null, hlsUrl: null, error: 'invalid_imdb_id' },
      { status: 400 },
    );
  }

  try {
    const streams = await fetchImdbTrailerStreams(imdbId);
    const url = pickBestMp4TrailerStream(streams);
    const hlsUrl = pickBestHlsTrailerStream(streams);

    if (!url && !hlsUrl) {
      return NextResponse.json(
        { url: null, hlsUrl: null, error: 'no_stream' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { url: url ?? null, hlsUrl: hlsUrl ?? null },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json(
      { url: null, hlsUrl: null, error: 'fetch_failed' },
      { status: 502 },
    );
  }
}
