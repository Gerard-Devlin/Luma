export type TmdbPlayerMediaType = 'movie' | 'tv';
export type TmdbPlayerProviderId = 'videasy' | 'vidsrc' | 'vidking';
export type TmdbPlayerPlaybackType = 'embed' | 'direct';

export interface TmdbPlayerProvider {
  id: TmdbPlayerProviderId;
  label: string;
  playbackType: TmdbPlayerPlaybackType;
  colorParam?: string;
  subtitleLangParam?: string;
  defaultParams?: Record<string, string>;
}

export interface TmdbProviderUrlInput {
  provider?: string | null;
  mediaType?: string | null;
  tmdbId: number | string;
  season?: number | string | null;
  episode?: number | string | null;
  accentColor?: string | null;
  subtitleLang?: string | null;
}

export interface TmdbPlayerPageUrlInput extends TmdbProviderUrlInput {
  title?: string | null;
  year?: string | null;
  poster?: string | null;
  score?: string | null;
}

export const DEFAULT_TMDB_PLAYER_PROVIDER: TmdbPlayerProviderId = 'videasy';

export const TMDB_PLAYER_PROVIDERS: TmdbPlayerProvider[] = [
  {
    id: 'videasy',
    label: 'Videasy',
    playbackType: 'embed',
    colorParam: 'color',
    defaultParams: {
      overlay: 'true',
    },
  },
  {
    id: 'vidsrc',
    label: 'VidSrc',
    playbackType: 'embed',
    subtitleLangParam: 'ds_lang',
  },
  {
    id: 'vidking',
    label: 'Vidking',
    playbackType: 'embed',
    colorParam: 'color',
    defaultParams: {
      autoPlay: 'true',
    },
  },
];

const PROVIDER_BY_ID = new Map<TmdbPlayerProviderId, TmdbPlayerProvider>(
  TMDB_PLAYER_PROVIDERS.map((provider) => [provider.id, provider])
);

export function normalizeTmdbPlayerMediaType(
  value?: string | null
): TmdbPlayerMediaType {
  return value === 'tv' || value === 'show' ? 'tv' : 'movie';
}

export function normalizeTmdbPlayerProvider(
  value?: string | null
): TmdbPlayerProviderId {
  const normalized = (value || '').trim().toLowerCase();
  return TMDB_PLAYER_PROVIDERS.some((provider) => provider.id === normalized)
    ? (normalized as TmdbPlayerProviderId)
    : DEFAULT_TMDB_PLAYER_PROVIDER;
}

export function normalizePositiveInteger(
  value?: number | string | null,
  fallback = 1
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt((value || '').toString(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function normalizeTmdbId(value?: number | string | null): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt((value || '').toString().trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function getProviderBaseUrl(
  provider: TmdbPlayerProviderId,
  mediaType: TmdbPlayerMediaType,
  tmdbId: number,
  season: number,
  episode: number
): string {
  if (provider === 'vidsrc') {
    return mediaType === 'movie'
      ? `https://vsembed.su/embed/movie/${tmdbId}`
      : `https://vsembed.su/embed/tv/${tmdbId}/${season}/${episode}`;
  }

  if (provider === 'vidking') {
    return mediaType === 'movie'
      ? `https://www.vidking.net/embed/movie/${tmdbId}`
      : `https://www.vidking.net/embed/tv/${tmdbId}/${season}/${episode}`;
  }

  return mediaType === 'movie'
    ? `https://player.videasy.to/movie/${tmdbId}`
    : `https://player.videasy.to/tv/${tmdbId}/${season}/${episode}`;
}

export function getTmdbPlayerProvider(
  value?: string | null
): TmdbPlayerProvider {
  const providerId = normalizeTmdbPlayerProvider(value);
  return PROVIDER_BY_ID.get(providerId) || PROVIDER_BY_ID.get(DEFAULT_TMDB_PLAYER_PROVIDER)!;
}

export function buildTmdbProviderUrl(input: TmdbProviderUrlInput): string {
  const tmdbId = normalizeTmdbId(input.tmdbId);
  if (!tmdbId) {
    throw new Error('missing tmdb id');
  }

  const mediaType = normalizeTmdbPlayerMediaType(input.mediaType);
  const provider = getTmdbPlayerProvider(input.provider);
  const season = normalizePositiveInteger(input.season, 1);
  const episode = normalizePositiveInteger(input.episode, 1);
  const url = new URL(
    getProviderBaseUrl(provider.id, mediaType, tmdbId, season, episode)
  );

  Object.entries(provider.defaultParams || {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const accentColor = (input.accentColor || '').trim().replace(/^#/, '');
  if (accentColor && provider.colorParam) {
    url.searchParams.set(provider.colorParam, accentColor);
  }

  const subtitleLang = (input.subtitleLang || '').trim();
  if (subtitleLang && provider.subtitleLangParam) {
    url.searchParams.set(provider.subtitleLangParam, subtitleLang);
  }

  return url.toString();
}

export function buildTmdbPlayerPageUrl(input: TmdbPlayerPageUrlInput): string {
  const params = new URLSearchParams();
  const tmdbId = normalizeTmdbId(input.tmdbId);
  if (tmdbId) params.set('tmdbId', String(tmdbId));

  const mediaType = normalizeTmdbPlayerMediaType(input.mediaType);
  params.set('type', mediaType);
  params.set('provider', normalizeTmdbPlayerProvider(input.provider));

  const title = (input.title || '').trim();
  const year = (input.year || '').trim();
  const poster = (input.poster || '').trim();
  const score = (input.score || '').trim();

  if (title) params.set('title', title);
  if (year) params.set('year', year);
  if (poster) params.set('poster', poster);
  if (score) params.set('score', score);

  if (mediaType === 'tv') {
    params.set('season', String(normalizePositiveInteger(input.season, 1)));
    params.set('episode', String(normalizePositiveInteger(input.episode, 1)));
  }

  return `/play?${params.toString()}`;
}

export function buildTmdbProviderStorageId(input: {
  tmdbId: number | string;
  mediaType: TmdbPlayerMediaType;
  season?: number | string | null;
}): string {
  const tmdbId = normalizeTmdbId(input.tmdbId) || 0;
  const season = normalizePositiveInteger(input.season, 1);
  return input.mediaType === 'tv' ? `${tmdbId}:s${season}` : String(tmdbId);
}
