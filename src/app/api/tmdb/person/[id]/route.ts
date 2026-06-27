import { NextResponse } from 'next/server';


const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_REQUEST_TIMEOUT_MS = 10000;

interface TmdbCreditRaw {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  character?: string;
  job?: string;
  department?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  vote_average?: number;
  overview?: string;
}

interface TmdbPersonRaw {
  id?: number;
  name?: string;
  profile_path?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  known_for_department?: string | null;
  biography?: string | null;
  popularity?: number;
  homepage?: string | null;
  imdb_id?: string | null;
  combined_credits?: {
    cast?: TmdbCreditRaw[];
    crew?: TmdbCreditRaw[];
  };
}

interface PersonCredit {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster: string;
  year: string;
  releaseDate: string;
  role: string;
  department: string;
  score: string;
  overview: string;
  popularity: number;
}

interface PersonDetailPayload {
  id: number;
  name: string;
  profile: string;
  birthday: string;
  deathday: string;
  placeOfBirth: string;
  knownForDepartment: string;
  biography: string;
  popularity: number;
  homepage: string;
  imdbId: string;
  credits: PersonCredit[];
}

function buildNoStoreHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
  };
}

function normalizeText(value?: string | null): string {
  return (value || '').trim();
}

function toYear(value?: string | null): string {
  const year = normalizeText(value).slice(0, 4);
  return /^\d{4}$/.test(year) ? year : 'unknown';
}

function toScore(value?: number): string {
  if (typeof value !== 'number') return '';
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(1);
}

function toTimestamp(value?: string): number {
  const normalized = normalizeText(value);
  if (!normalized) return 0;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mapCredit(raw: TmdbCreditRaw): PersonCredit | null {
  if (!Number.isInteger(raw.id) || !raw.id) return null;
  const mediaType = raw.media_type === 'movie' || raw.media_type === 'tv'
    ? raw.media_type
    : null;
  if (!mediaType) return null;

  const title = normalizeText(
    raw.title || raw.name || raw.original_title || raw.original_name
  );
  if (!title) return null;

  const posterPath = raw.poster_path || raw.backdrop_path || '';

  return {
    id: raw.id,
    mediaType,
    title,
    poster: posterPath ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : '',
    year: toYear(raw.release_date || raw.first_air_date),
    releaseDate: normalizeText(raw.release_date || raw.first_air_date),
    role: normalizeText(raw.character || raw.job),
    department: normalizeText(raw.department),
    score: toScore(raw.vote_average),
    overview: normalizeText(raw.overview),
    popularity: raw.popularity || 0,
  };
}

function mergeAndSortCredits(raw: TmdbPersonRaw): PersonCredit[] {
  const cast = (raw.combined_credits?.cast || [])
    .map((item) => mapCredit(item))
    .filter((item): item is PersonCredit => Boolean(item));

  const crew = (raw.combined_credits?.crew || [])
    .map((item) => mapCredit(item))
    .filter((item): item is PersonCredit => Boolean(item));

  const mergedMap = new Map<string, PersonCredit>();
  for (const item of [...cast, ...crew]) {
    const roleKey = normalizeText(item.role).toLowerCase() || '-';
    const key = `${item.mediaType}-${item.id}-${roleKey}`;
    const existing = mergedMap.get(key);
    if (!existing) {
      mergedMap.set(key, item);
      continue;
    }

    const popularityDiff = item.popularity - existing.popularity;
    if (popularityDiff > 0) {
      mergedMap.set(key, item);
      continue;
    }
    if (
      popularityDiff === 0 &&
      toTimestamp(item.releaseDate) > toTimestamp(existing.releaseDate)
    ) {
      mergedMap.set(key, item);
    }
  }

  return Array.from(mergedMap.values())
    .sort((a, b) => {
      const popularityDiff = b.popularity - a.popularity;
      if (popularityDiff !== 0) return popularityDiff;
      const dateDiff = toTimestamp(b.releaseDate) - toTimestamp(a.releaseDate);
      if (dateDiff !== 0) return dateDiff;
      return b.id - a.id;
    });
}

export async function GET(
  _request: Request,
  context: { params: { id: string } }
) {
  const rawId = Number(context.params.id);
  const id = Number.isInteger(rawId) && rawId > 0 ? rawId : 0;

  if (!id) {
    return NextResponse.json(
      { error: 'invalid person id' },
      { status: 400, headers: buildNoStoreHeaders() }
    );
  }

  const apiKey =
    process.env.TMDB_API_KEY ||
    process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'tmdb api key missing' },
      { status: 500, headers: buildNoStoreHeaders() }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TMDB_REQUEST_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      language: 'en-US',
      append_to_response: 'combined_credits,external_ids',
    });
    const response = await fetch(
      `${TMDB_API_BASE_URL}/person/${id}?${params.toString()}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'tmdb person request failed' },
        { status: response.status, headers: buildNoStoreHeaders() }
      );
    }

    const raw = (await response.json()) as TmdbPersonRaw;
    const name = normalizeText(raw.name);
    if (!name) {
      return NextResponse.json(
        { error: 'person not found' },
        { status: 404, headers: buildNoStoreHeaders() }
      );
    }

    const payload: PersonDetailPayload = {
      id,
      name,
      profile: raw.profile_path ? `${TMDB_IMAGE_BASE_URL}${raw.profile_path}` : '',
      birthday: normalizeText(raw.birthday),
      deathday: normalizeText(raw.deathday),
      placeOfBirth: normalizeText(raw.place_of_birth),
      knownForDepartment: normalizeText(raw.known_for_department),
      biography: normalizeText(raw.biography),
      popularity: raw.popularity || 0,
      homepage: normalizeText(raw.homepage),
      imdbId: normalizeText(raw.imdb_id),
      credits: mergeAndSortCredits(raw),
    };

    return NextResponse.json(payload, {
      headers: buildNoStoreHeaders(),
    });
  } catch {
    return NextResponse.json(
      { error: 'tmdb person request failed' },
      { status: 500, headers: buildNoStoreHeaders() }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
