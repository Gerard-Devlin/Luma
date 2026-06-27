import { NextResponse } from 'next/server';

import { normalizeReleaseDate } from '@/lib/tmdbRelease';


const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const RECOMMENDATION_TIMEOUT_MS = 14000;
const MAX_SEEDS = 8;
const MAX_CANDIDATES_TO_HYDRATE = 18;
const HERO_ITEM_LIMIT = 7;
const MIN_CANDIDATES_BEFORE_DISCOVER = HERO_ITEM_LIMIT + 3;
const MAX_PROFILE_GENRES = 4;
const MAX_PROFILE_KEYWORDS = 8;
const MAX_PROFILE_PEOPLE = 6;
const MAX_DISCOVER_KEYWORD_PLANS = 3;
const MAX_DISCOVER_PEOPLE_PLANS = 2;
const MAX_DISCOVER_PLANS = 4;
const DAILY_RECOMMENDATION_TIME_ZONE = 'Asia/Shanghai';
const DAILY_DISCOVER_VARIATION_WEIGHT = 0.08;
const DAILY_RANK_VARIATION_WEIGHT = 0.045;
const MIN_PROFILE_AFFINITY_FOR_DISCOVER = 0.48;
const SAME_DAY_FAVORITE_WEIGHT_BOOST = 2.6;
const SAME_DAY_PLAY_WEIGHT_BOOST = 1.8;

type TmdbMediaType = 'movie' | 'tv';
type HeroMediaFilter = 'all' | TmdbMediaType;
type CandidateSource =
  | 'recommendation'
  | 'similar'
  | 'discover_genre'
  | 'discover_keyword'
  | 'discover_people';

interface RecommendationRecordInput {
  title?: string;
  search_title?: string;
  year?: string;
  total_episodes?: number;
  index?: number;
  play_time?: number;
  total_time?: number;
  save_time?: number;
  seed_type?: 'play' | 'favorite';
}

interface RecommendationRequestBody {
  records?: RecommendationRecordInput[];
  mediaType?: HeroMediaFilter;
}

interface WeightedSeed {
  title: string;
  titleKey: string;
  year: string;
  preferredMediaType: TmdbMediaType;
  weight: number;
}

interface ResolvedSeed extends WeightedSeed {
  id: number;
  mediaType: TmdbMediaType;
  detail: TmdbDetailRawResponse;
}

interface TmdbHeroItem {
  id: number;
  mediaType: TmdbMediaType;
  title: string;
  overview: string;
  year: string;
  score: string;
  releaseDate: string;
  backdrop: string;
  poster: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  logo?: string;
}

interface TmdbSearchItem {
  id?: number;
  media_type?: 'movie' | 'tv' | 'person' | string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
}

interface TmdbSearchResponse {
  results?: TmdbSearchItem[];
}

interface TmdbGenreItem {
  id?: number;
  name?: string;
}

interface TmdbLogoItem {
  file_path?: string | null;
  iso_639_1?: string | null;
  vote_average?: number;
  width?: number;
}

interface TmdbKeywordItem {
  id?: number;
  name?: string;
}

interface TmdbCreditCastItem {
  id?: number;
  name?: string;
  order?: number;
}

interface TmdbCreditCrewItem {
  id?: number;
  name?: string;
  job?: string;
}

interface TmdbCandidateRawItem {
  id?: number;
  media_type?: 'movie' | 'tv' | string;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
}

interface TmdbListResponse {
  results?: TmdbCandidateRawItem[];
}

interface TmdbDetailRawResponse {
  id?: number;
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  original_language?: string;
  popularity?: number;
  genres?: TmdbGenreItem[];
  images?: {
    logos?: TmdbLogoItem[];
  };
  keywords?: {
    keywords?: TmdbKeywordItem[];
    results?: TmdbKeywordItem[];
  };
  credits?: {
    cast?: TmdbCreditCastItem[];
    crew?: TmdbCreditCrewItem[];
  };
  created_by?: TmdbCreditCrewItem[];
  recommendations?: {
    results?: TmdbCandidateRawItem[];
  };
  similar?: {
    results?: TmdbCandidateRawItem[];
  };
}

interface Candidate {
  id: number;
  mediaType: TmdbMediaType;
  title: string;
  titleKey: string;
  score: number;
  genreIds: number[];
  language: string;
  sourceHits: number;
  sources: CandidateSource[];
}

interface TasteProfile {
  genreWeightsByMedia: Record<TmdbMediaType, Map<number, number>>;
  keywordWeightsByMedia: Record<TmdbMediaType, Map<number, number>>;
  peopleWeightsByMedia: Record<TmdbMediaType, Map<number, number>>;
  decadeWeightsByMedia: Record<TmdbMediaType, Map<number, number>>;
  languageWeights: Map<string, number>;
  mediaWeights: Map<TmdbMediaType, number>;
  watchedIds: Set<string>;
  watchedTitleKeys: Set<string>;
  totalWeight: number;
}

function buildNoStoreHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function getDailyRecommendationKey(date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DAILY_RECOMMENDATION_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function isSameRecommendationDay(left: number, right: number): boolean {
  return (
    getDailyRecommendationKey(new Date(left)) ===
    getDailyRecommendationKey(new Date(right))
  );
}

function hashStringToUnitInterval(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function getDailyRotationScore(dailyKey: string, ...parts: string[]): number {
  return hashStringToUnitInterval([dailyKey, ...parts].join('|'));
}

function normalizeMediaFilter(value?: string): HeroMediaFilter {
  if (value === 'movie' || value === 'tv') return value;
  return 'all';
}

function matchesMediaFilter(
  mediaType: TmdbMediaType,
  mediaFilter: HeroMediaFilter
): boolean {
  return mediaFilter === 'all' || mediaFilter === mediaType;
}

function toYear(value?: string): string {
  const year = (value || '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : '';
}

function toScore(value?: number): string {
  if (typeof value !== 'number') return '';
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(1);
}

function toImageUrl(path?: string | null, size = 'w500'): string {
  return path ? `${TMDB_IMAGE_BASE_URL}/${size}${path}` : '';
}

const ENGLISH_SEASON_HINT_PATTERN = /\b(?:season|series|s)\s*0*\d{1,2}\b/gi;
const CHINESE_SEASON_HINT_PATTERN =
  /\u7b2c\s*[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24\d]+\s*(?:\u5b63|\u90e8|\u8f91)/gi;
const MEDIA_WORD_PATTERN =
  /\b(?:tv|movie|show)\b|(?:\u7535\u89c6\u5267|\u96fb\u8996\u5287|\u7535\u5f71|\u96fb\u5f71|\u5267\u96c6|\u5287\u96c6|\u7efc\u827a|\u7d9c\u85dd)/gi;
const TITLE_PUNCTUATION_PATTERN =
  /[\u3001\uFF0C\u3002\uFF01\uFF1F,.;:!?()[\]{}<>\u300a\u300b\u300c\u300d\u300e\u300f\u3010\u3011/_|\\~@#$%^&*+=`"'\u2018\u2019\u201c\u201d-]+/g;

function cleanTitle(value?: string): string {
  return (value || '')
    .normalize('NFKC')
    .replace(ENGLISH_SEASON_HINT_PATTERN, ' ')
    .replace(CHINESE_SEASON_HINT_PATTERN, ' ')
    .replace(MEDIA_WORD_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitleKey(value?: string): string {
  return cleanTitle(value)
    .toLowerCase()
    .replace(TITLE_PUNCTUATION_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPreferredRecordTitle(record: RecommendationRecordInput): string {
  const searchTitle = cleanTitle(record.search_title);
  if (searchTitle) return searchTitle;

  return cleanTitle(record.title);
}

function inferMediaType(record: RecommendationRecordInput): TmdbMediaType {
  return typeof record.total_episodes === 'number' && record.total_episodes > 1
    ? 'tv'
    : 'movie';
}

function getRecordWeight(record: RecommendationRecordInput, now: number): number {
  const isFavorite = record.seed_type === 'favorite';
  const saveTime =
    typeof record.save_time === 'number' && record.save_time > 0
      ? record.save_time
      : now - 365 * 24 * 60 * 60 * 1000;
  const ageDays = Math.max(0, (now - saveTime) / (24 * 60 * 60 * 1000));
  const recency = Math.exp(-ageDays / 90);
  const sameDayBoost = isSameRecommendationDay(saveTime, now)
    ? isFavorite
      ? SAME_DAY_FAVORITE_WEIGHT_BOOST
      : SAME_DAY_PLAY_WEIGHT_BOOST
    : 0;

  if (isFavorite) {
    return 3.2 + recency * 0.9 + sameDayBoost;
  }

  const progress =
    typeof record.total_time === 'number' && record.total_time > 0
      ? clamp((record.play_time || 0) / record.total_time, 0, 1)
      : 0.35;
  const episodeProgress =
    typeof record.total_episodes === 'number' && record.total_episodes > 1
      ? clamp((record.index || 1) / record.total_episodes, 0, 1)
      : 0.55;

  return (
    1.2 +
    recency * 1 +
    progress * 1.1 +
    episodeProgress * 0.7 +
    sameDayBoost
  );
}

function buildExcludedTitleKeys(records: RecommendationRecordInput[]): Set<string> {
  const keys = new Set<string>();
  records.forEach((record) => {
    [
      normalizeTitleKey(record.search_title),
      normalizeTitleKey(record.title),
      normalizeTitleKey(getPreferredRecordTitle(record)),
    ]
      .filter(Boolean)
      .forEach((key) => keys.add(key));
  });
  return keys;
}

function getRequestBodyRecords(body: unknown): RecommendationRecordInput[] {
  if (!body || typeof body !== 'object') return [];
  const records = (body as { records?: unknown }).records;
  if (!Array.isArray(records)) return [];

  return records
    .filter((item): item is RecommendationRecordInput =>
      Boolean(item && typeof item === 'object')
    );
}

function buildWeightedSeeds(
  records: RecommendationRecordInput[],
  mediaFilter: HeroMediaFilter
): WeightedSeed[] {
  const now = Date.now();
  const seedMap = new Map<string, WeightedSeed>();

  records
    .slice()
    .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
    .forEach((record) => {
      const title = getPreferredRecordTitle(record);
      const titleKey = normalizeTitleKey(title);
      if (!title || titleKey.length < 2) return;

      const preferredMediaType = inferMediaType(record);
      if (!matchesMediaFilter(preferredMediaType, mediaFilter)) return;

      const year = toYear(record.year);
      const weight = getRecordWeight(record, now);
      const key = `${preferredMediaType}:${titleKey}:${year || 'unknown'}`;
      const existing = seedMap.get(key);

      if (existing) {
        existing.weight += weight * 0.35;
        return;
      }

      seedMap.set(key, {
        title,
        titleKey,
        year,
        preferredMediaType,
        weight,
      });
    });

  return Array.from(seedMap.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_SEEDS);
}

function charSetSimilarity(a: string, b: string): number {
  const left = Array.from(a.replace(/\s+/g, ''));
  const right = Array.from(b.replace(/\s+/g, ''));
  if (!left.length || !right.length) return 0;

  const rightSet = new Set(right);
  const overlap = new Set(left.filter((char) => rightSet.has(char))).size;
  return (overlap * 2) / (new Set(left).size + rightSet.size);
}

function getTitleSimilarity(queryKey: string, candidateKey: string): number {
  if (!queryKey || !candidateKey) return 0;
  if (queryKey === candidateKey) return 1;
  if (
    queryKey.length >= 2 &&
    candidateKey.length >= 2 &&
    (queryKey.includes(candidateKey) || candidateKey.includes(queryKey))
  ) {
    return 0.82;
  }
  return charSetSimilarity(queryKey, candidateKey);
}

function getCandidateTitleKeys(candidate: TmdbSearchItem): string[] {
  return Array.from(
    new Set(
      [
        candidate.title,
        candidate.name,
        candidate.original_title,
        candidate.original_name,
      ]
        .map((value) => normalizeTitleKey(value))
        .filter(Boolean)
    )
  );
}

async function resolveSeedToTmdb(
  seed: WeightedSeed,
  apiKey: string,
  signal: AbortSignal,
  mediaFilter: HeroMediaFilter
): Promise<{ id: number; mediaType: TmdbMediaType } | null> {
  const endpointOrder: Array<TmdbMediaType | 'multi'> =
    seed.preferredMediaType === 'tv'
      ? ['tv', 'movie', 'multi']
      : ['movie', 'tv', 'multi'];
  let best: { id: number; mediaType: TmdbMediaType; score: number } | null = null;

  for (const endpoint of endpointOrder) {
    const params = new URLSearchParams({
      api_key: apiKey,
      language: 'en-US',
      include_adult: 'false',
      query: seed.title,
      page: '1',
    });

    if (seed.year && endpoint !== 'multi') {
      params.set(endpoint === 'movie' ? 'year' : 'first_air_date_year', seed.year);
    }

    try {
      const response = await fetch(
        `${TMDB_API_BASE_URL}/search/${endpoint}?${params.toString()}`,
        {
          signal,
          headers: {
            Accept: 'application/json',
          },
        }
      );
      if (!response.ok) continue;

      const payload = (await response.json()) as TmdbSearchResponse;
      for (const item of (payload.results || []).slice(0, 8)) {
        const id = Number(item.id);
        if (!Number.isInteger(id) || id <= 0) continue;

        const mediaType: TmdbMediaType | null =
          endpoint === 'multi'
            ? item.media_type === 'movie' || item.media_type === 'tv'
              ? item.media_type
              : null
            : endpoint;
        if (!mediaType || !matchesMediaFilter(mediaType, mediaFilter)) continue;

        const titleKeys = getCandidateTitleKeys(item);
        const titleScore = Math.max(
          ...titleKeys.map((key) => getTitleSimilarity(seed.titleKey, key)),
          0
        );
        if (titleScore < 0.48) continue;

        const candidateYear = toYear(item.release_date || item.first_air_date);
        const yearScore = seed.year && candidateYear === seed.year ? 0.2 : 0;
        const mediaScore = mediaType === seed.preferredMediaType ? 0.08 : 0;
        const finalScore = titleScore + yearScore + mediaScore;

        if (!best || finalScore > best.score) {
          best = {
            id,
            mediaType,
            score: finalScore,
          };
        }
      }
    } catch {
      continue;
    }

    if (best && best.score >= 0.9) break;
  }

  return best ? { id: best.id, mediaType: best.mediaType } : null;
}

async function fetchTmdbDetailRaw(
  mediaType: TmdbMediaType,
  id: number,
  apiKey: string,
  signal: AbortSignal,
  appendToResponse: string
): Promise<TmdbDetailRawResponse | null> {
  const params = new URLSearchParams({
    api_key: apiKey,
    language: 'en-US',
  });

  if (appendToResponse) {
    params.set('append_to_response', appendToResponse);
  }
  if (appendToResponse.includes('images')) {
    params.set('include_image_language', 'en,null');
  }

  try {
    const response = await fetch(
      `${TMDB_API_BASE_URL}/${mediaType}/${id}?${params.toString()}`,
      {
        signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );
    if (!response.ok) return null;
    return (await response.json()) as TmdbDetailRawResponse;
  } catch {
    return null;
  }
}

async function resolveSeedDetail(
  seed: WeightedSeed,
  apiKey: string,
  signal: AbortSignal,
  mediaFilter: HeroMediaFilter
): Promise<ResolvedSeed | null> {
  const resolved = await resolveSeedToTmdb(seed, apiKey, signal, mediaFilter);
  if (!resolved) return null;

  const detail = await fetchTmdbDetailRaw(
    resolved.mediaType,
    resolved.id,
    apiKey,
    signal,
    'recommendations,similar,keywords,credits'
  );
  if (!detail) return null;

  return {
    ...seed,
    id: resolved.id,
    mediaType: resolved.mediaType,
    detail,
  };
}

function selectBestLogoPath(logos: TmdbLogoItem[]): string {
  const getLanguagePriority = (lang?: string | null): number => {
    if (lang === 'en') return 4;
    if (lang === 'zh') return 3;
    if (lang === null || lang === undefined) return 2;
    return 1;
  };

  return (
    logos
      .filter((logo) => logo.file_path)
      .sort((a, b) => {
        const langDelta =
          getLanguagePriority(b.iso_639_1) - getLanguagePriority(a.iso_639_1);
        if (langDelta !== 0) return langDelta;

        const voteDelta = (b.vote_average || 0) - (a.vote_average || 0);
        if (voteDelta !== 0) return voteDelta;

        return (b.width || 0) - (a.width || 0);
      })[0]?.file_path || ''
  );
}

function addMapWeight(map: Map<number, number>, id: number, weight: number): void {
  if (!Number.isInteger(id) || id <= 0) return;
  map.set(id, (map.get(id) || 0) + weight);
}

function addStringMapWeight(
  map: Map<string, number>,
  key: string,
  weight: number
): void {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) || 0) + weight);
}

function getTopMapEntries<T>(map: Map<T, number>, limit: number): Array<[T, number]> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function getRawGenreIds(raw: TmdbCandidateRawItem): number[] {
  return Array.from(
    new Set(
      (raw.genre_ids || []).filter(
        (id) => typeof id === 'number' && Number.isInteger(id) && id > 0
      )
    )
  );
}

function getDetailKeywordItems(detail: TmdbDetailRawResponse): TmdbKeywordItem[] {
  return detail.keywords?.keywords || detail.keywords?.results || [];
}

function getDetailYear(detail: TmdbDetailRawResponse): number | null {
  const year = Number(toYear(detail.release_date || detail.first_air_date));
  return Number.isInteger(year) && year > 0 ? year : null;
}

function getRawYear(raw: TmdbCandidateRawItem): number | null {
  const year = Number(toYear(raw.release_date || raw.first_air_date));
  return Number.isInteger(year) && year > 0 ? year : null;
}

function getDecade(year: number | null): number | null {
  if (!year) return null;
  return Math.floor(year / 10) * 10;
}

function getCandidateViabilityScore(raw: TmdbCandidateRawItem): number {
  const rating = typeof raw.vote_average === 'number' ? raw.vote_average : 0;
  const voteCount = typeof raw.vote_count === 'number' ? raw.vote_count : 0;
  const popularity = typeof raw.popularity === 'number' ? raw.popularity : 0;

  const ratingScore = clamp((rating - 6) / 2.8, 0, 1);
  const enoughVotesScore = clamp(Math.log10(voteCount + 1) / 4.5, 0, 1);
  const logPopularity = Math.log10(popularity + 1);
  const midPopularityScore = clamp(1 - Math.abs(logPopularity - 1.45) / 2.2, 0, 1);
  const blockbusterPenalty =
    popularity > 600 ? 0.1 : popularity > 300 ? 0.05 : 0;

  return (
    ratingScore * 0.14 +
    enoughVotesScore * 0.08 +
    midPopularityScore * 0.07 -
    blockbusterPenalty
  );
}

function getMinimumCandidateSignals(
  mediaType: TmdbMediaType,
  source: CandidateSource
): { voteCount: number; popularity: number } {
  const isDiscover = source.startsWith('discover_');
  if (mediaType === 'movie') {
    return {
      voteCount: isDiscover ? 180 : 110,
      popularity: isDiscover ? 14 : 9,
    };
  }

  return {
    voteCount: isDiscover ? 85 : 50,
    popularity: isDiscover ? 16 : 10,
  };
}

function passesCandidateQualityGate(
  raw: TmdbCandidateRawItem,
  mediaType: TmdbMediaType,
  source: CandidateSource
): boolean {
  const rating = typeof raw.vote_average === 'number' ? raw.vote_average : 0;
  const voteCount = typeof raw.vote_count === 'number' ? raw.vote_count : 0;
  const popularity = typeof raw.popularity === 'number' ? raw.popularity : 0;
  const minimum = getMinimumCandidateSignals(mediaType, source);

  if (rating > 0 && rating < 5.9 && voteCount >= 25) return false;
  return voteCount >= minimum.voteCount || popularity >= minimum.popularity;
}

function addCandidate(
  candidates: Map<string, Candidate>,
  raw: TmdbCandidateRawItem,
  fallbackMediaType: TmdbMediaType,
  score: number,
  mediaFilter: HeroMediaFilter,
  watchedIds: Set<string>,
  watchedTitleKeys: Set<string>,
  source: CandidateSource
): void {
  const id = Number(raw.id);
  if (!Number.isInteger(id) || id <= 0) return;

  const mediaType: TmdbMediaType =
    raw.media_type === 'movie' || raw.media_type === 'tv'
      ? raw.media_type
      : fallbackMediaType;
  if (!matchesMediaFilter(mediaType, mediaFilter)) return;
  if (watchedIds.has(`${mediaType}:${id}`)) return;
  if (!passesCandidateQualityGate(raw, mediaType, source)) return;

  const title = (raw.title || raw.name || '').trim();
  const titleKey = normalizeTitleKey(title);
  if (!title || !titleKey) return;
  if (watchedTitleKeys.has(titleKey)) return;

  const finalScore = score + getCandidateViabilityScore(raw);
  const key = `${mediaType}:${id}`;
  const existing = candidates.get(key);
  const genreIds = getRawGenreIds(raw);
  const language = (raw.original_language || '').trim().toLowerCase();

  if (existing) {
    existing.score += finalScore * 0.65;
    existing.sourceHits += 1;
    existing.genreIds = Array.from(new Set([...existing.genreIds, ...genreIds]));
    if (!existing.language && language) {
      existing.language = language;
    }
    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }
    return;
  }

  candidates.set(key, {
    id,
    mediaType,
    title,
    titleKey,
    score: finalScore,
    genreIds,
    language,
    sourceHits: 1,
    sources: [source],
  });
}

function createMediaWeightMaps(): Record<TmdbMediaType, Map<number, number>> {
  return {
    movie: new Map(),
    tv: new Map(),
  };
}

function collectTasteProfile(
  seeds: ResolvedSeed[],
  mediaFilter: HeroMediaFilter
): TasteProfile {
  const genreWeightsByMedia: Record<TmdbMediaType, Map<number, number>> = {
    movie: new Map(),
    tv: new Map(),
  };
  const keywordWeightsByMedia = createMediaWeightMaps();
  const peopleWeightsByMedia = createMediaWeightMaps();
  const decadeWeightsByMedia = createMediaWeightMaps();
  const languageWeights = new Map<string, number>();
  const mediaWeights = new Map<TmdbMediaType, number>();
  const watchedIds = new Set<string>();
  const watchedTitleKeys = new Set<string>();
  let totalWeight = 0;

  seeds.forEach((seed) => {
    watchedIds.add(`${seed.mediaType}:${seed.id}`);
    watchedTitleKeys.add(seed.titleKey);
    addStringMapWeight(languageWeights, seed.detail.original_language || '', seed.weight);
    mediaWeights.set(seed.mediaType, (mediaWeights.get(seed.mediaType) || 0) + seed.weight);
    totalWeight += seed.weight;

    if (!matchesMediaFilter(seed.mediaType, mediaFilter)) return;

    (seed.detail.genres || []).forEach((genre) => {
      if (typeof genre.id === 'number') {
        addMapWeight(genreWeightsByMedia[seed.mediaType], genre.id, seed.weight);
      }
    });

    getDetailKeywordItems(seed.detail)
      .slice(0, MAX_PROFILE_KEYWORDS)
      .forEach((keyword, index) => {
        if (typeof keyword.id !== 'number') return;
        addMapWeight(
          keywordWeightsByMedia[seed.mediaType],
          keyword.id,
          seed.weight * Math.max(0.35, 1 - index * 0.08)
        );
      });

    (seed.detail.credits?.cast || [])
      .slice()
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .slice(0, MAX_PROFILE_PEOPLE)
      .forEach((person, index) => {
        if (typeof person.id !== 'number') return;
        addMapWeight(
          peopleWeightsByMedia[seed.mediaType],
          person.id,
          seed.weight * Math.max(0.25, 0.85 - index * 0.08)
        );
      });

    const crewJobs = new Set([
      'director',
      'creator',
      'writer',
      'screenplay',
      'story',
      'showrunner',
    ]);
    [
      ...(seed.detail.created_by || []),
      ...(seed.detail.credits?.crew || []).filter((person) =>
        crewJobs.has((person.job || '').toLowerCase())
      ),
    ]
      .slice(0, MAX_PROFILE_PEOPLE)
      .forEach((person, index) => {
        if (typeof person.id !== 'number') return;
        addMapWeight(
          peopleWeightsByMedia[seed.mediaType],
          person.id,
          seed.weight * Math.max(0.35, 0.75 - index * 0.07)
        );
      });

    const decade = getDecade(getDetailYear(seed.detail));
    if (typeof decade === 'number') {
      addMapWeight(decadeWeightsByMedia[seed.mediaType], decade, seed.weight * 0.55);
    }
  });

  return {
    genreWeightsByMedia,
    keywordWeightsByMedia,
    peopleWeightsByMedia,
    decadeWeightsByMedia,
    languageWeights,
    mediaWeights,
    watchedIds,
    watchedTitleKeys,
    totalWeight,
  };
}

function getSeedAffinityScore(raw: TmdbCandidateRawItem, seed: ResolvedSeed): number {
  const seedGenreIds = new Set(
    (seed.detail.genres || [])
      .map((genre) => genre.id)
      .filter((id): id is number => typeof id === 'number' && id > 0)
  );
  const rawGenreIds = getRawGenreIds(raw);
  const genreOverlap = rawGenreIds.filter((id) => seedGenreIds.has(id)).length;
  const genreScore = Math.min(genreOverlap * 0.18, 0.48);
  const languageScore =
    raw.original_language &&
    seed.detail.original_language &&
    raw.original_language === seed.detail.original_language
      ? 0.28
      : 0;

  return genreScore + languageScore;
}

function getProfileAffinityScore(
  raw: TmdbCandidateRawItem,
  mediaType: TmdbMediaType,
  profile: TasteProfile
): number {
  const totalWeight = Math.max(1, profile.totalWeight);
  const rawGenreIds = getRawGenreIds(raw);
  const genreWeight = rawGenreIds.reduce(
    (sum, id) => sum + (profile.genreWeightsByMedia[mediaType].get(id) || 0),
    0
  );
  const language = (raw.original_language || '').trim().toLowerCase();
  const languageWeight = language ? profile.languageWeights.get(language) || 0 : 0;
  const decade = getDecade(getRawYear(raw));
  const decadeWeight =
    typeof decade === 'number'
      ? profile.decadeWeightsByMedia[mediaType].get(decade) || 0
      : 0;

  return (
    clamp(genreWeight / totalWeight, 0, 1) * 1.45 +
    clamp(languageWeight / totalWeight, 0, 1) * 0.55 +
    clamp(decadeWeight / totalWeight, 0, 1) * 0.18
  );
}

function buildCandidatePool(
  seeds: ResolvedSeed[],
  mediaFilter: HeroMediaFilter,
  profile: TasteProfile
): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();

  seeds.forEach((seed) => {
    (seed.detail.recommendations?.results || [])
      .slice(0, 24)
      .forEach((item, index) => {
        const seedAffinityScore = getSeedAffinityScore(item, seed);
        const profileAffinityScore = getProfileAffinityScore(
          item,
          seed.mediaType,
          profile
        );
        if (index > 8 && seedAffinityScore + profileAffinityScore < 0.52) {
          return;
        }

        const rankScore =
          Math.max(0.7, 2.8 - index * 0.075) +
          seedAffinityScore * 1.35 +
          profileAffinityScore * 1.65;
        addCandidate(
          candidates,
          item,
          seed.mediaType,
          seed.weight * rankScore,
          mediaFilter,
          profile.watchedIds,
          profile.watchedTitleKeys,
          'recommendation'
        );
      });

    (seed.detail.similar?.results || [])
      .slice(0, 24)
      .forEach((item, index) => {
        const seedAffinityScore = getSeedAffinityScore(item, seed);
        const profileAffinityScore = getProfileAffinityScore(
          item,
          seed.mediaType,
          profile
        );
        if (index > 10 && seedAffinityScore + profileAffinityScore < 0.48) {
          return;
        }

        const rankScore =
          Math.max(0.55, 2.35 - index * 0.065) +
          seedAffinityScore * 1.3 +
          profileAffinityScore * 1.5;
        addCandidate(
          candidates,
          item,
          seed.mediaType,
          seed.weight * rankScore,
          mediaFilter,
          profile.watchedIds,
          profile.watchedTitleKeys,
          'similar'
        );
      });
  });

  return candidates;
}

async function addDiscoverCandidates(
  candidates: Map<string, Candidate>,
  apiKey: string,
  signal: AbortSignal,
  mediaFilter: HeroMediaFilter,
  profile: TasteProfile,
  dailyKey: string
): Promise<void> {
  const mediaTypes: TmdbMediaType[] =
    mediaFilter === 'all' ? ['movie', 'tv'] : [mediaFilter];
  const topLanguage = getTopMapEntries(profile.languageWeights, 1)[0]?.[0] || '';
  const totalSignalWeight = Math.max(1, profile.totalWeight);

  const plans = mediaTypes.flatMap((mediaType) => {
    const topGenres = getTopMapEntries(
      profile.genreWeightsByMedia[mediaType],
      MAX_PROFILE_GENRES
    );
    const topKeywords = getTopMapEntries(
      profile.keywordWeightsByMedia[mediaType],
      MAX_DISCOVER_KEYWORD_PLANS
    );
    const topPeople = getTopMapEntries(
      profile.peopleWeightsByMedia[mediaType],
      MAX_DISCOVER_PEOPLE_PLANS
    );
    const genreQuery = topGenres
      .slice(0, 2)
      .map(([id]) => String(id))
      .join(',');
    const strongestGenre = topGenres[0]?.[0];
    const basePlans: Array<{
      mediaType: TmdbMediaType;
      source: CandidateSource;
      signalScore: number;
      params: URLSearchParams;
    }> = [];

    const createParams = () => {
      const params = new URLSearchParams({
        api_key: apiKey,
        language: 'en-US',
        page: '1',
        sort_by: 'popularity.desc',
        include_adult: 'false',
        'vote_average.gte': '6.2',
        'vote_count.gte': mediaType === 'movie' ? '120' : '60',
      });
      if (topLanguage) {
        params.set('with_original_language', topLanguage);
      }
      return params;
    };

    if (genreQuery) {
      const params = createParams();
      params.set('with_genres', genreQuery);
      const genreScore =
        topGenres.reduce((sum, [, weight]) => sum + weight, 0) / totalSignalWeight;
      basePlans.push({
        mediaType,
        source: 'discover_genre',
        signalScore: genreScore * 0.72,
        params,
      });
    }

    topKeywords.forEach(([keywordId, weight]) => {
      const params = createParams();
      params.set('with_keywords', String(keywordId));
      if (typeof strongestGenre === 'number') {
        params.set('with_genres', String(strongestGenre));
      }
      basePlans.push({
        mediaType,
        source: 'discover_keyword',
        signalScore: (weight / totalSignalWeight) * 0.72,
        params,
      });
    });

    topPeople.forEach(([personId, weight]) => {
      const params = createParams();
      params.set('with_people', String(personId));
      if (typeof strongestGenre === 'number') {
        params.set('with_genres', String(strongestGenre));
      }
      basePlans.push({
        mediaType,
        source: 'discover_people',
        signalScore: (weight / totalSignalWeight) * 0.62,
        params,
      });
    });

    return basePlans;
  });

  const selectedPlans = plans
    .sort((a, b) => {
      const aDailyScore =
        getDailyRotationScore(
          dailyKey,
          a.mediaType,
          a.source,
          a.params.toString()
        ) * DAILY_DISCOVER_VARIATION_WEIGHT;
      const bDailyScore =
        getDailyRotationScore(
          dailyKey,
          b.mediaType,
          b.source,
          b.params.toString()
        ) * DAILY_DISCOVER_VARIATION_WEIGHT;
      return b.signalScore + bDailyScore - (a.signalScore + aDailyScore);
    })
    .slice(0, MAX_DISCOVER_PLANS);

  await Promise.all(
    selectedPlans.map(async ({ mediaType, params, signalScore, source }) => {
      try {
        const response = await fetch(
          `${TMDB_API_BASE_URL}/discover/${mediaType}?${params.toString()}`,
          {
            signal,
            headers: {
              Accept: 'application/json',
            },
          }
        );
        if (!response.ok) return;

        const payload = (await response.json()) as TmdbListResponse;
        const mediaScore = profile.mediaWeights.get(mediaType) || 0;
        const languageScore = topLanguage ? 0.12 : 0;

        (payload.results || []).slice(0, 20).forEach((item, index) => {
          const profileAffinityScore = getProfileAffinityScore(
            item,
            mediaType,
            profile
          );
          if (profileAffinityScore < MIN_PROFILE_AFFINITY_FOR_DISCOVER) {
            return;
          }

          addCandidate(
            candidates,
            item,
            mediaType,
            signalScore +
              (mediaScore / totalSignalWeight) * 0.35 +
              profileAffinityScore * 1.35 +
              languageScore -
              index * 0.025,
            mediaFilter,
            profile.watchedIds,
            profile.watchedTitleKeys,
            source
          );
        });
      } catch {
        return;
      }
    })
  );
}

function rankCandidates(
  candidates: Candidate[],
  limit: number,
  dailyKey: string
): Candidate[] {
  const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(sortedCandidates[0]?.score || 1, 1);

  return sortedCandidates
    .map((candidate) => {
      const relevanceScore = candidate.score / maxScore;
      const multiSourceBonus = Math.min(candidate.sourceHits - 1, 3) * 0.03;
      const dailyVariation =
        getDailyRotationScore(
          dailyKey,
          candidate.mediaType,
          String(candidate.id),
          candidate.titleKey
        ) - 0.5;

      return {
        candidate,
        rankScore:
          relevanceScore +
          multiSourceBonus +
          dailyVariation * DAILY_RANK_VARIATION_WEIGHT,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .map(({ candidate }) => candidate)
    .slice(0, limit);
}

async function hydrateCandidate(
  candidate: Candidate,
  apiKey: string,
  signal: AbortSignal
): Promise<TmdbHeroItem | null> {
  const raw = await fetchTmdbDetailRaw(
    candidate.mediaType,
    candidate.id,
    apiKey,
    signal,
    'images'
  );
  if (!raw) return null;

  const title = (raw.title || raw.name || candidate.title || '').trim();
  const backdrop = toImageUrl(raw.backdrop_path, 'original');
  const poster = toImageUrl(raw.poster_path, 'w500');
  if (!title || !backdrop || !poster) return null;

  const logoPath = selectBestLogoPath(raw.images?.logos || []);
  if (!logoPath) return null;

  const runtime =
    candidate.mediaType === 'movie'
      ? raw.runtime
      : raw.episode_run_time?.[0];

  return {
    id: raw.id || candidate.id,
    mediaType: candidate.mediaType,
    title,
    overview: (raw.overview || '').trim() || 'No overview available.',
    year: toYear(raw.release_date || raw.first_air_date),
    score: toScore(raw.vote_average),
    releaseDate: normalizeReleaseDate(raw.release_date || raw.first_air_date),
    backdrop,
    poster,
    runtime:
      typeof runtime === 'number' && runtime > 0 ? runtime : null,
    seasons:
      candidate.mediaType === 'tv' &&
      typeof raw.number_of_seasons === 'number' &&
      raw.number_of_seasons > 0
        ? raw.number_of_seasons
        : null,
    episodes:
      candidate.mediaType === 'tv' &&
      typeof raw.number_of_episodes === 'number' &&
      raw.number_of_episodes > 0
        ? raw.number_of_episodes
        : null,
    logo: `${TMDB_IMAGE_BASE_URL}/w500${logoPath}`,
  };
}

export async function POST(request: Request) {
  const apiKey =
    process.env.TMDB_API_KEY ||
    process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { results: [] },
      { status: 200, headers: buildNoStoreHeaders() }
    );
  }

  let body: RecommendationRequestBody | null = null;
  try {
    body = (await request.json()) as RecommendationRequestBody;
  } catch {
    body = null;
  }

  const mediaFilter = normalizeMediaFilter(body?.mediaType);
  const records = getRequestBodyRecords(body);
  const excludedTitleKeys = buildExcludedTitleKeys(records);
  const seeds = buildWeightedSeeds(records, mediaFilter);
  const dailyKey = getDailyRecommendationKey();
  if (seeds.length === 0) {
    return NextResponse.json(
      { results: [] },
      { status: 200, headers: buildNoStoreHeaders() }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RECOMMENDATION_TIMEOUT_MS);

  try {
    const resolvedResults = await Promise.allSettled(
      seeds.map((seed) =>
        resolveSeedDetail(seed, apiKey, controller.signal, mediaFilter)
      )
    );
    const resolvedSeeds = resolvedResults
      .map((result) => (result.status === 'fulfilled' ? result.value : null))
      .filter((seed): seed is ResolvedSeed => Boolean(seed));

    if (resolvedSeeds.length === 0) {
      return NextResponse.json(
        { results: [] },
        { status: 200, headers: buildNoStoreHeaders() }
      );
    }

    const profile = collectTasteProfile(resolvedSeeds, mediaFilter);
    excludedTitleKeys.forEach((key) => profile.watchedTitleKeys.add(key));
    const candidates = buildCandidatePool(resolvedSeeds, mediaFilter, profile);

    if (candidates.size < MIN_CANDIDATES_BEFORE_DISCOVER) {
      await addDiscoverCandidates(
        candidates,
        apiKey,
        controller.signal,
        mediaFilter,
        profile,
        dailyKey
      );
    }

    const sortedCandidates = rankCandidates(
      Array.from(candidates.values()),
      MAX_CANDIDATES_TO_HYDRATE,
      dailyKey
    );

    const hydratedResults = await Promise.allSettled(
      sortedCandidates.map((candidate) =>
        hydrateCandidate(candidate, apiKey, controller.signal)
      )
    );
    const results = hydratedResults
      .map((result) => (result.status === 'fulfilled' ? result.value : null))
      .filter((item): item is TmdbHeroItem => Boolean(item))
      .slice(0, HERO_ITEM_LIMIT);

    return NextResponse.json(
      { results },
      {
        headers: buildNoStoreHeaders(),
      }
    );
  } catch {
    return NextResponse.json(
      { results: [] },
      { status: 200, headers: buildNoStoreHeaders() }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
