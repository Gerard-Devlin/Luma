import { NextResponse } from 'next/server';

import {
  TMDB_PLAYER_PROVIDERS,
  buildTmdbProviderStorageId,
  buildTmdbProviderUrl,
  getTmdbPlayerProvider,
  normalizePositiveInteger,
  normalizeTmdbId,
  normalizeTmdbPlayerMediaType,
} from '@/lib/tmdb-player-sources';


const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const PLAYER_RESOLVE_TIMEOUT_MS = 8000;

interface TmdbSeasonRawEpisode {
  id?: number;
  name?: string;
  overview?: string;
  episode_number?: number;
  season_number?: number;
  still_path?: string | null;
  air_date?: string;
  runtime?: number | null;
}

interface TmdbSeasonRawResponse {
  id?: number;
  name?: string;
  overview?: string;
  season_number?: number;
  episodes?: TmdbSeasonRawEpisode[];
}

function buildNoStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store, max-age=0',
  };
}

function toImageUrl(path?: string | null, size = 'w300'): string {
  if (!path) return '';
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

async function fetchTmdbSeason(
  tmdbId: number,
  season: number,
  signal: AbortSignal
) {
  const apiKey =
    process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    api_key: apiKey,
    language: 'en-US',
  });

  try {
    const response = await fetch(
      `${TMDB_API_BASE_URL}/tv/${tmdbId}/season/${season}?${params.toString()}`,
      {
        signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );
    if (!response.ok) return null;
    const raw = (await response.json()) as TmdbSeasonRawResponse;
    const episodes = (raw.episodes || [])
      .map((episode) => {
        const episodeNumber = Number(episode.episode_number);
        if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
          return null;
        }

        return {
          id: Number(episode.id) || episodeNumber,
          seasonNumber: Number(episode.season_number) || season,
          episodeNumber,
          title: (episode.name || '').trim() || `Episode ${episodeNumber}`,
          overview: (episode.overview || '').trim(),
          still: toImageUrl(episode.still_path, 'w300'),
          airDate: (episode.air_date || '').trim(),
          runtime:
            typeof episode.runtime === 'number' && episode.runtime > 0
              ? episode.runtime
              : null,
        };
      })
      .filter(Boolean);

    return {
      seasonNumber: Number(raw.season_number) || season,
      title: (raw.name || '').trim() || `Season ${season}`,
      overview: (raw.overview || '').trim(),
      episodeCount: episodes.length,
      episodes,
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = normalizeTmdbId(
    searchParams.get('tmdbId') ||
      searchParams.get('tmdb_id') ||
      searchParams.get('id')
  );
  if (!tmdbId) {
    return NextResponse.json(
      { error: 'missing tmdbId parameter' },
      { status: 400, headers: buildNoStoreHeaders() }
    );
  }

  const mediaType = normalizeTmdbPlayerMediaType(
    searchParams.get('type') || searchParams.get('mediaType')
  );
  const provider = getTmdbPlayerProvider(searchParams.get('provider'));
  const season = mediaType === 'tv'
    ? normalizePositiveInteger(searchParams.get('season'), 1)
    : 1;
  const episode = mediaType === 'tv'
    ? normalizePositiveInteger(searchParams.get('episode'), 1)
    : 1;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PLAYER_RESOLVE_TIMEOUT_MS
  );

  try {
    const seasonDetail =
      mediaType === 'tv'
        ? await fetchTmdbSeason(tmdbId, season, controller.signal)
        : null;
    const embedUrl = buildTmdbProviderUrl({
      tmdbId,
      mediaType,
      provider: provider.id,
      season,
      episode,
      accentColor: searchParams.get('color') || '557efc',
      subtitleLang: searchParams.get('subtitleLang') || 'en',
    });

    return NextResponse.json(
      {
        provider,
        providers: TMDB_PLAYER_PROVIDERS,
        embedUrl,
        tmdbId,
        mediaType,
        season,
        episode,
        source: provider.id,
        sourceName: provider.label,
        storageId: buildTmdbProviderStorageId({
          tmdbId,
          mediaType,
          season,
        }),
        episodeCount:
          mediaType === 'movie' ? 1 : seasonDetail?.episodeCount || episode,
        seasonDetail,
      },
      { headers: buildNoStoreHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: 'failed to resolve player source' },
      { status: 502, headers: buildNoStoreHeaders() }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
