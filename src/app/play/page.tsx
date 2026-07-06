/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bookmark,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Film,
  Info,
  RefreshCw,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import type { PlayRecord } from '@/lib/db.client';
import {
  deleteFavorite,
  generateStorageKey,
  getAllPlayRecords,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { buildTmdbDetailPageUrl } from '@/lib/tmdb-detail-url';
import {
  type TmdbPlayerMediaType,
  type TmdbPlayerProvider,
  buildTmdbPlayerPageUrl,
  normalizePositiveInteger,
  normalizeTmdbId,
  normalizeTmdbPlayerMediaType,
  normalizeTmdbPlayerProvider,
} from '@/lib/tmdb-player-sources';
import { SearchResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';
import TmdbDetailModal from '@/components/TmdbDetailModal';

import { getCurrentTmdbLanguage } from '@/i18n/client';

interface TmdbPlayDetail {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  logo?: string;
  overview: string;
  backdrop: string;
  poster: string;
  score: string;
  voteCount: number;
  year: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  contentRating: string;
  genres: string[];
  language: string;
  popularity: number | null;
  cast: Array<{
    id: number;
    name: string;
    character: string;
    profile?: string;
  }>;
  collection?: {
    id: number;
    name: string;
    overview: string;
    poster: string;
    backdrop: string;
    parts: Array<{
      id: number;
      mediaType: 'movie';
      title: string;
      poster: string;
      backdrop: string;
      year: string;
      score: string;
      voteCount: number;
    }>;
  };
  recommendations?: Array<{
    id: number;
    mediaType: 'movie' | 'tv';
    title: string;
    poster: string;
    backdrop: string;
    year: string;
    score: string;
    voteCount: number;
  }>;
  trailerUrl: string;
}

interface TmdbEpisodeItem {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview: string;
  still: string;
  airDate: string;
  runtime: number | null;
}

interface TmdbSeasonDetail {
  seasonNumber: number;
  title: string;
  overview: string;
  episodeCount: number;
  episodes: TmdbEpisodeItem[];
}

interface PlayerResolveResponse {
  provider: TmdbPlayerProvider;
  providers: TmdbPlayerProvider[];
  embedUrl: string;
  tmdbId: number;
  mediaType: TmdbPlayerMediaType;
  season: number;
  episode: number;
  source: string;
  sourceName: string;
  storageId: string;
  episodeCount: number;
  seasonDetail: TmdbSeasonDetail | null;
}

interface TmdbEmbedProgressState {
  storageId: string;
  episode: number;
  playTime: number;
  totalTime: number;
  hasExactTime: boolean;
  startedAt: number | null;
  lastSavedPlayTime: number;
  lastSavedAt: number;
  origin: string;
}

interface TmdbEmbedProgressMessage {
  kind: string;
  currentTime: number | null;
  duration: number | null;
}

const TMDB_EMBED_PROGRESS_EVENT_NAMES = new Set([
  'durationchange',
  'play',
  'playing',
  'pause',
  'paused',
  'progress',
  'ready',
  'seeked',
  'time',
  'timeupdate',
  'video:timeupdate',
  'player:timeupdate',
  'update',
  'ended',
  'complete',
]);

const TMDB_EMBED_TIME_KEYS = [
  'currentTime',
  'current_time',
  'playTime',
  'play_time',
  'position',
  'seconds',
  'time',
  'timestamp',
];

const TMDB_EMBED_DURATION_KEYS = [
  'duration',
  'totalTime',
  'total_time',
  'length',
];

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseMessagePayload(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  const trimmed = data.trim();
  if (!trimmed) return data;
  try {
    return JSON.parse(trimmed);
  } catch {
    return data;
  }
}

function findNestedNumber(
  input: unknown,
  keys: string[],
  depth = 0
): number | null {
  if (depth > 4 || input === null || input === undefined) return null;
  const direct = normalizeNumber(input);
  if (direct !== null && depth > 0) return direct;
  if (typeof input !== 'object') return null;

  const record = input as Record<string, unknown>;
  for (const key of keys) {
    const value = normalizeNumber(record[key]);
    if (value !== null) return value;
  }

  for (const key of ['value', 'payload', 'data', 'detail', 'state', 'player']) {
    const value = findNestedNumber(record[key], keys, depth + 1);
    if (value !== null) return value;
  }

  const args = record.args;
  if (Array.isArray(args)) {
    for (const item of args) {
      const value = findNestedNumber(item, keys, depth + 1);
      if (value !== null) return value;
    }
  }

  return null;
}

function findNestedString(input: unknown, depth = 0): string {
  if (depth > 3 || input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  if (typeof input !== 'object') return '';

  const record = input as Record<string, unknown>;
  for (const key of ['event', 'type', 'action', 'name', 'method']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }

  for (const key of ['value', 'payload', 'data', 'detail', 'state']) {
    const value = findNestedString(record[key], depth + 1);
    if (value) return value;
  }

  return '';
}

function extractTmdbEmbedProgressMessage(
  rawData: unknown
): TmdbEmbedProgressMessage | null {
  const data = parseMessagePayload(rawData);
  const eventName = findNestedString(data).toLowerCase();
  const currentTime = findNestedNumber(data, TMDB_EMBED_TIME_KEYS);
  const duration = findNestedNumber(data, TMDB_EMBED_DURATION_KEYS);

  if (!eventName && currentTime === null && duration === null) {
    return null;
  }

  if (
    eventName &&
    !TMDB_EMBED_PROGRESS_EVENT_NAMES.has(eventName) &&
    currentTime === null &&
    duration === null
  ) {
    return null;
  }

  return {
    kind: eventName || 'timeupdate',
    currentTime,
    duration,
  };
}

function getUrlOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function addResumeParamsToEmbedUrl(url: string, resumeTime: number): string {
  if (!url || !Number.isFinite(resumeTime) || resumeTime < 2) return url;
  try {
    const nextUrl = new URL(url);
    const seconds = String(Math.floor(resumeTime));
    // Different embed providers use different names; unknown params are ignored.
    ['start', 'startAt', 't', 'time', 'resume', 'resumeTime'].forEach((key) => {
      nextUrl.searchParams.set(key, seconds);
    });
    return nextUrl.toString();
  } catch {
    return url;
  }
}

function PlayPageClient() {
  const { i18n, t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasTmdbPlayerParams = Boolean(
    searchParams.get('tmdbId') || searchParams.get('tmdb_id')
  );
  const initialTmdbId = normalizeTmdbId(
    searchParams.get('tmdbId') || searchParams.get('tmdb_id')
  );
  const initialTmdbMediaType = normalizeTmdbPlayerMediaType(
    searchParams.get('type') ||
      searchParams.get('mediaType') ||
      searchParams.get('stype')
  );
  const initialTmdbProvider = normalizeTmdbPlayerProvider('videasy');
  const initialTmdbSeason = normalizePositiveInteger(
    searchParams.get('season'),
    1
  );
  const initialTmdbEpisode =
    initialTmdbMediaType === 'tv'
      ? normalizePositiveInteger(searchParams.get('episode'), 1)
      : 1;
  const hasExplicitTmdbEpisodeParam = Boolean(searchParams.get('episode'));

  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'preferring' | 'fetching' | 'ready'
  >('searching');
  const [loadingMessage, setLoadingMessage] = useState(
    t('play.searchingPlaybackSources')
  );
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);
  const [tmdbDetail, setTmdbDetail] = useState<TmdbPlayDetail | null>(null);
  const [tmdbMode, setTmdbMode] = useState(
    Boolean(hasTmdbPlayerParams && initialTmdbId)
  );
  const [tmdbPlayerId, setTmdbPlayerId] = useState<number | null>(
    initialTmdbId
  );
  const [tmdbMediaType, setTmdbMediaType] =
    useState<TmdbPlayerMediaType>(initialTmdbMediaType);
  const [currentSeason, setCurrentSeason] = useState(initialTmdbSeason);
  const [playerProvider, setPlayerProvider] = useState(initialTmdbProvider);
  const [playerEmbedUrl, setPlayerEmbedUrl] = useState('');
  const [tmdbEpisodes, setTmdbEpisodes] = useState<TmdbEpisodeItem[]>([]);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [seasonMenuRect, setSeasonMenuRect] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const seasonMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const seasonMenuRef = useRef<HTMLDivElement | null>(null);
  const episodeListRef = useRef<HTMLDivElement | null>(null);
  const [episodePanelOpen, setEpisodePanelOpen] = useState(false);
  const castRailRef = useRef<HTMLDivElement | null>(null);
  const [canScrollCastLeft, setCanScrollCastLeft] = useState(false);
  const [canScrollCastRight, setCanScrollCastRight] = useState(false);
  const [castRailHovered, setCastRailHovered] = useState(false);
  const collectionRailRef = useRef<HTMLDivElement | null>(null);
  const [canScrollCollectionLeft, setCanScrollCollectionLeft] = useState(false);
  const [canScrollCollectionRight, setCanScrollCollectionRight] =
    useState(false);
  const [collectionRailHovered, setCollectionRailHovered] = useState(false);
  const recommendedRailRef = useRef<HTMLDivElement | null>(null);
  const [canScrollRecommendedLeft, setCanScrollRecommendedLeft] =
    useState(false);
  const [canScrollRecommendedRight, setCanScrollRecommendedRight] =
    useState(false);
  const [recommendedRailHovered, setRecommendedRailHovered] = useState(false);
  const [recommendedDetailOpen, setRecommendedDetailOpen] = useState(false);
  const [recommendedDetailLoading, setRecommendedDetailLoading] =
    useState(false);
  const [recommendedDetailError, setRecommendedDetailError] = useState<
    string | null
  >(null);
  const [recommendedDetailData, setRecommendedDetailData] =
    useState<TmdbPlayDetail | null>(null);
  const [recommendedDetailTarget, setRecommendedDetailTarget] = useState<{
    id: number;
    mediaType: 'movie' | 'tv';
    title: string;
    year?: string;
  } | null>(null);
  const recommendedDetailRequestIdRef = useRef(0);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);
  const [favoriteBurstKey, setFavoriteBurstKey] = useState(0);

  // 视频基本信息
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  // 当前源和ID
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  // 搜索所需信息
  const [searchTitle] = useState(searchParams.get('stitle') || '');
  const [searchType] = useState(searchParams.get('stype') || '');

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  // 集数相关
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(
    Math.max(0, initialTmdbEpisode - 1)
  );

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const videoCoverRef = useRef(videoCover);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);
  const tmdbModeRef = useRef(tmdbMode);
  const tmdbPlayerIdRef = useRef(tmdbPlayerId);
  const tmdbMediaTypeRef = useRef(tmdbMediaType);
  const currentSeasonRef = useRef(currentSeason);
  const playerProviderRef = useRef(playerProvider);
  const playerEmbedUrlRef = useRef(playerEmbedUrl);
  const tmdbEmbedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const tmdbEmbedProgressRef = useRef<TmdbEmbedProgressState | null>(null);
  const historyResumeKeysRef = useRef<Set<string>>(new Set());

  // 同步最新值到 refs
  useEffect(() => {
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
    videoCoverRef.current = videoCover;
    tmdbModeRef.current = tmdbMode;
    tmdbPlayerIdRef.current = tmdbPlayerId;
    tmdbMediaTypeRef.current = tmdbMediaType;
    currentSeasonRef.current = currentSeason;
    playerProviderRef.current = playerProvider;
    playerEmbedUrlRef.current = playerEmbedUrl;
  }, [
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
    videoCover,
    tmdbMode,
    tmdbPlayerId,
    tmdbMediaType,
    currentSeason,
    playerProvider,
    playerEmbedUrl,
  ]);

  // 总集数
  const totalEpisodes = detail?.episodes?.length || 0;

  // 用于记录是否需要在播放器 ready 后跳转到指定进度
  const resumeTimeRef = useRef<number | null>(null);

  // 换源加载状态
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

  const lastSaveTimeRef = useRef<number>(0);

  const tmdbDetailCacheRef = useRef<Map<string, TmdbPlayDetail | null>>(
    new Map()
  );
  const tmdbDetailRequestIdRef = useRef(0);

  const normalizeCompareText = (value: string): string =>
    (value || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(
        /[·?:：\-_.()[\]【】「」『』"'"'`~!@#$%^&*+={}\\/|<>?,;，。！？、]/g,
        ''
      );

  const toChineseNumeral = (value: number): string => {
    if (!Number.isInteger(value) || value <= 0 || value >= 100) {
      return String(value);
    }
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (value < 10) return digits[value];
    if (value === 10) return '十';
    if (value < 20) return `十${digits[value - 10]}`;
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${digits[tens]}十${ones > 0 ? digits[ones] : ''}`;
  };

  const normalizeYear = (value?: string): string => {
    const year = (value || '').trim();
    return /^\d{4}$/.test(year) ? year : '';
  };

  const parseChineseNumeral = (value: string): number => {
    const text = (value || '').trim().replace(/两/g, '二');
    if (!text) return 0;
    const map: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };
    if (text === '十') return 10;
    if (text.includes('十')) {
      const [left, right] = text.split('十');
      const tens = left ? map[left] || 0 : 1;
      const ones = right ? map[right] || 0 : 0;
      return tens * 10 + ones;
    }
    return map[text] || 0;
  };

  const stripSeasonTokens = (value: string): string => {
    const normalized = normalizeCompareText(value);
    return normalized
      .replace(/第[一二三四五六七八九十百千万两\d]+季/g, '')
      .replace(/第\d+部/g, '')
      .replace(/(?:season|series|s)\s*0*\d{1,2}/g, '')
      .replace(/s0*\d{1,2}/g, '')
      .replace(/第[一二三四五六七八九十百千万两\d]+辑/g, '');
  };

  const stripSeasonTokensForQuery = (value: string): string =>
    (value || '')
      .replace(/第\s*[一二三四五六七八九十百千万两\d]+\s*季/gi, ' ')
      .replace(/第\s*\d+\s*部/gi, ' ')
      .replace(/(?:season|series|s)\s*0*\d{1,2}/gi, ' ')
      .replace(/第\s*[一二三四五六七八九十百千万两\d]+\s*辑/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const stripSpecialTokensForQuery = (value: string): string =>
    (value || '')
      .replace(
        /(?:制作)?特辑|特别篇|特别节目|幕后(?:花絮|纪录)?|花絮|纪录片|番外|衍生|先导片|访谈|彩蛋|制作幕后|制作花絮/gi,
        ' '
      )
      .replace(
        /\b(?:special|featurette|behind\s*the\s*scenes|making\s*of|extra|bonus|interview|documentary)\b/gi,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim();

  const isLikelySpecialTitle = (value: string): boolean => {
    const normalized = normalizeCompareText(value);
    if (!normalized) return false;
    return [
      '特辑',
      '特别篇',
      '特别节目',
      '幕后',
      '花絮',
      '纪录片',
      '番外',
      '衍生',
      '先导片',
      '访谈',
      '彩蛋',
      'special',
      'featurette',
      'behindthescenes',
      'makingof',
      'extra',
      'bonus',
      'interview',
      'documentary',
    ].some((token) => normalized.includes(normalizeCompareText(token)));
  };

  const normalizeQueryText = (value: string): string =>
    (value || '').replace(/\s+/g, ' ').trim();

  const expandQueryVariants = (value: string): string[] => {
    const base = normalizeQueryText(value);
    if (!base) return [];

    const variants = new Set<string>();
    const pushVariant = (input: string) => {
      const normalized = normalizeQueryText(input);
      if (!normalized) return;
      variants.add(normalized);
    };

    pushVariant(base);
    pushVariant(base.replace(/\s+/g, ''));

    pushVariant(base.replace(/\s*[：:]\s*/g, ':'));
    pushVariant(base.replace(/\s*[：:]\s*/g, '：'));
    pushVariant(base.replace(/\s*[：:]\s*/g, ' '));
    pushVariant(base.replace(/\s*[：:]\s*/g, ''));

    pushVariant(base.replace(/\s*[-‐??–—]\s*/g, ' '));
    pushVariant(base.replace(/\s*[-‐??–—]\s*/g, ''));
    pushVariant(base.replace(/[·?]/g, ' '));
    pushVariant(base.replace(/[·?]/g, ''));

    pushVariant(
      base
        .replace(/\s*[：:]\s*/g, '')
        .replace(/\s*[-‐??–—]\s*/g, '')
        .replace(/[·?]/g, '')
    );

    return Array.from(variants);
  };

  const extractSeasonHints = (value: string): string[] => {
    const text = value || '';
    const hints = new Set<string>();
    const addSeasonHints = (seasonNumber: number) => {
      if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) return;
      hints.add(`第${seasonNumber}季`);
      hints.add(`第${toChineseNumeral(seasonNumber)}季`);
      hints.add(`S${String(seasonNumber).padStart(2, '0')}`);
      hints.add(`Season ${seasonNumber}`);
    };

    const arabicMatches = text.match(/第\s*(\d{1,2})\s*季/gi) || [];
    arabicMatches.forEach((raw) => {
      const m = raw.match(/(\d{1,2})/);
      if (!m) return;
      const n = Number(m[1]);
      addSeasonHints(n);
    });

    const seasonMatches =
      text.match(/(?:season|series|s)\s*0*(\d{1,2})/gi) || [];
    seasonMatches.forEach((raw) => {
      const m = raw.match(/(\d{1,2})/);
      if (!m) return;
      const n = Number(m[1]);
      addSeasonHints(n);
    });

    const chineseMatches =
      text.match(/第\s*([一二三四五六七八九十两]{1,3})\s*季/g) || [];
    chineseMatches.forEach((raw) => {
      const m = raw.match(/([一二三四五六七八九十两]{1,3})/);
      if (!m) return;
      addSeasonHints(parseChineseNumeral(m[1]));
    });

    return Array.from(hints);
  };

  const extractSeasonNumbers = (value: string): number[] => {
    const text = value || '';
    const numbers = new Set<number>();
    const pushNumber = (input: number) => {
      if (!Number.isFinite(input) || input <= 0) return;
      numbers.add(Math.floor(input));
    };

    const arabicMatches = text.match(/第\s*(\d{1,2})\s*季/gi) || [];
    arabicMatches.forEach((raw) => {
      const m = raw.match(/(\d{1,2})/);
      if (!m) return;
      pushNumber(Number(m[1]));
    });

    const seasonMatches =
      text.match(/(?:season|series|s)\s*0*(\d{1,2})/gi) || [];
    seasonMatches.forEach((raw) => {
      const m = raw.match(/(\d{1,2})/);
      if (!m) return;
      pushNumber(Number(m[1]));
    });

    const chineseMatches =
      text.match(/第\s*([一二三四五六七八九十两]{1,3})\s*季/g) || [];
    chineseMatches.forEach((raw) => {
      const m = raw.match(/([一二三四五六七八九十两]{1,3})/);
      if (!m) return;
      pushNumber(parseChineseNumeral(m[1]));
    });

    return Array.from(numbers);
  };

  const inferTmdbMediaType = (
    sourceDetail: SearchResult | null
  ): 'movie' | 'tv' => {
    const normalizedType = (searchType || '').trim().toLowerCase();
    if (normalizedType === 'tv') return 'tv';
    if (normalizedType === 'movie') return 'movie';
    if ((sourceDetail?.episodes?.length || 0) > 1) return 'tv';
    return 'movie';
  };

  const buildTmdbTitleCandidates = (
    sourceDetail: SearchResult | null,
    mediaType: 'movie' | 'tv'
  ): string[] => {
    const dedupe = new Set<string>();
    const candidates: string[] = [];

    const push = (value: string) => {
      const variants = expandQueryVariants(value);
      variants.forEach((variant) => {
        const key = variant.toLowerCase();
        if (dedupe.has(key)) return;
        dedupe.add(key);
        candidates.push(variant);
      });
    };

    const baseTitles = [
      sourceDetail?.title || '',
      videoTitleRef.current || '',
      searchTitle || '',
    ];

    if (mediaType === 'tv') {
      // 电视剧优先用主标题（去季数/去特辑词）查询，避免命中“第二季制作特辑”这类条目
      baseTitles.forEach((title) => {
        const strippedSeason = stripSeasonTokensForQuery(title);
        const strippedCore = stripSpecialTokensForQuery(
          strippedSeason || title
        );
        if (strippedCore) {
          push(strippedCore);
        }
        if (strippedSeason && strippedSeason !== strippedCore) {
          push(strippedSeason);
        }
      });
    }

    // 兜底再尝试原始标题
    baseTitles.forEach((title) => {
      if (!title) return;
      push(title);
      if (mediaType === 'tv') {
        const stripped = stripSpecialTokensForQuery(title);
        if (stripped && stripped !== normalizeQueryText(title)) {
          push(stripped);
        }
      }
    });

    return candidates;
  };

  const fetchTmdbDetailByParams = async (
    params: URLSearchParams
  ): Promise<TmdbPlayDetail | null> => {
    try {
      params.set('tmdbLanguage', getCurrentTmdbLanguage());
      const response = await fetch(`/api/tmdb/detail?${params.toString()}`);
      if (!response.ok) return null;
      return (await response.json()) as TmdbPlayDetail;
    } catch {
      return null;
    }
  };

  const fetchTmdbPlayerResolve = async (input: {
    tmdbId: number;
    mediaType: TmdbPlayerMediaType;
    season?: number;
    episode?: number;
    provider?: string;
  }): Promise<PlayerResolveResponse> => {
    const params = new URLSearchParams({
      tmdbId: String(input.tmdbId),
      type: input.mediaType,
      provider: normalizeTmdbPlayerProvider(input.provider),
      tmdbLanguage: getCurrentTmdbLanguage(),
    });

    if (input.mediaType === 'tv') {
      params.set('season', String(normalizePositiveInteger(input.season, 1)));
      params.set('episode', String(normalizePositiveInteger(input.episode, 1)));
    }

    const response = await fetch(`/api/player/resolve?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      let message = t('play.failedToResolvePlaybackSource');
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {
        // ignore malformed error payloads
      }
      throw new Error(message);
    }

    return (await response.json()) as PlayerResolveResponse;
  };

  const createSyntheticTmdbDetail = (
    resolved: PlayerResolveResponse,
    detailData: TmdbPlayDetail | null
  ): SearchResult => {
    const title =
      detailData?.title ||
      searchParams.get('title') ||
      videoTitleRef.current ||
      `TMDB ${resolved.tmdbId}`;
    const poster =
      detailData?.poster ||
      detailData?.backdrop ||
      searchParams.get('poster') ||
      videoCoverRef.current ||
      '';
    const year =
      detailData?.year ||
      searchParams.get('year') ||
      videoYearRef.current ||
      '';
    const episodeCount =
      resolved.mediaType === 'movie'
        ? 1
        : Math.max(
            1,
            resolved.seasonDetail?.episodeCount || resolved.episodeCount
          );
    return {
      id: resolved.storageId,
      title,
      poster,
      episodes: Array.from({ length: episodeCount }, (_, index) =>
        index + 1 === resolved.episode ? resolved.embedUrl : ''
      ),
      total_episodes: episodeCount,
      source: 'tmdb',
      source_name: resolved.sourceName,
      year,
      score: detailData?.score || searchParams.get('score') || '',
      desc: detailData?.overview || '',
      type_name:
        resolved.mediaType === 'tv' ? t('common.series') : t('common.movie'),
    };
  };

  const syncTmdbPlayerUrl = (
    resolved: PlayerResolveResponse,
    detailData: TmdbPlayDetail | null
  ) => {
    if (typeof window === 'undefined') return;

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('tmdbId', String(resolved.tmdbId));
    newUrl.searchParams.set('type', resolved.mediaType);
    newUrl.searchParams.set('provider', resolved.provider.id);
    newUrl.searchParams.set(
      'title',
      detailData?.title || videoTitleRef.current || ''
    );
    if (detailData?.year || videoYearRef.current) {
      newUrl.searchParams.set('year', detailData?.year || videoYearRef.current);
    }
    if (detailData?.poster || videoCoverRef.current) {
      newUrl.searchParams.set(
        'poster',
        detailData?.poster || videoCoverRef.current
      );
    }
    if (detailData?.score) {
      newUrl.searchParams.set('score', detailData.score);
    }
    if (resolved.mediaType === 'tv') {
      newUrl.searchParams.set('season', String(resolved.season));
      newUrl.searchParams.set('episode', String(resolved.episode));
    } else {
      newUrl.searchParams.delete('season');
      newUrl.searchParams.delete('episode');
    }
    newUrl.searchParams.delete('source');
    newUrl.searchParams.delete('id');
    newUrl.searchParams.delete('prefer');
    newUrl.searchParams.delete('stitle');
    newUrl.searchParams.delete('stype');
    window.history.replaceState({}, '', newUrl.toString());
  };

  const getTmdbResolvedRuntimeSeconds = (
    resolved: PlayerResolveResponse,
    detailData: TmdbPlayDetail | null
  ): number => {
    const episodeRuntime = resolved.seasonDetail?.episodes?.find(
      (episode) => episode.episodeNumber === resolved.episode
    )?.runtime;
    const runtimeMinutes =
      resolved.mediaType === 'tv'
        ? episodeRuntime || detailData?.runtime || 0
        : detailData?.runtime || 0;
    return runtimeMinutes > 0 ? Math.floor(runtimeMinutes * 60) : 0;
  };

  const getTmdbResolvedHistoryImage = (
    resolved: PlayerResolveResponse,
    detailData: TmdbPlayDetail | null
  ): string => {
    return (
      detailData?.backdrop || detailData?.poster || videoCoverRef.current || ''
    );
  };

  const buildTmdbPlaybackRecord = (
    resolved: PlayerResolveResponse,
    detailData: TmdbPlayDetail | null,
    progress: { playTime?: number; totalTime?: number } = {}
  ): PlayRecord | null => {
    const title = (
      detailData?.title ||
      videoTitleRef.current ||
      searchParams.get('title') ||
      `TMDB ${resolved.tmdbId}`
    ).trim();
    if (!title) return null;

    const runtimeSeconds = getTmdbResolvedRuntimeSeconds(resolved, detailData);
    const playTime = Math.max(0, Math.floor(progress.playTime || 0));
    const totalTime = Math.max(
      0,
      Math.floor(progress.totalTime || runtimeSeconds || 0)
    );

    return {
      title,
      source_name: resolved.sourceName || resolved.provider.label,
      year: detailData?.year || videoYearRef.current || '',
      cover: getTmdbResolvedHistoryImage(resolved, detailData),
      index: resolved.mediaType === 'tv' ? resolved.episode : 1,
      total_episodes:
        resolved.mediaType === 'tv'
          ? Math.max(
              1,
              resolved.seasonDetail?.episodeCount ||
                resolved.episodeCount ||
                resolved.episode
            )
          : 1,
      play_time: playTime,
      total_time: totalTime,
      save_time: Date.now(),
      search_title: title,
    };
  };

  const saveTmdbEmbedPlayProgress = async (force = false) => {
    const state = tmdbEmbedProgressRef.current;
    if (!state || !tmdbModeRef.current || !currentIdRef.current) return;

    const now = Date.now();
    let playTime = state.playTime;
    if (
      !state.hasExactTime &&
      state.startedAt !== null &&
      !Number.isNaN(state.startedAt)
    ) {
      playTime += Math.max(0, (now - state.startedAt) / 1000);
    }

    const flooredPlayTime = Math.max(0, Math.floor(playTime));
    const flooredTotalTime = Math.max(0, Math.floor(state.totalTime || 0));
    if (
      !force &&
      flooredPlayTime <= state.lastSavedPlayTime &&
      now - state.lastSavedAt < 15000
    ) {
      return;
    }
    if (flooredPlayTime < 1 && flooredTotalTime < 1) return;

    const recordTitle =
      (tmdbModeRef.current ? tmdbDetail?.title : '') ||
      videoTitleRef.current ||
      detailRef.current?.title ||
      '';
    if (!recordTitle || !detailRef.current?.source_name) return;

    try {
      await savePlayRecord('tmdb', state.storageId, {
        title: recordTitle,
        source_name: detailRef.current.source_name,
        year: detailRef.current.year || videoYearRef.current || '',
        cover: detailRef.current.poster || videoCoverRef.current || '',
        index: state.episode,
        total_episodes: detailRef.current.episodes.length || 1,
        play_time: flooredPlayTime,
        total_time: flooredTotalTime,
        save_time: Date.now(),
        search_title: recordTitle,
      });
      state.playTime = flooredPlayTime;
      state.startedAt = state.hasExactTime ? null : now;
      state.lastSavedPlayTime = flooredPlayTime;
      state.lastSavedAt = now;
      lastSaveTimeRef.current = now;
    } catch (err) {
      console.error('Failed to save TMDB embed playback progress:', err);
    }
  };

  const postTmdbEmbedResume = () => {
    const iframeWindow = tmdbEmbedIframeRef.current?.contentWindow;
    const state = tmdbEmbedProgressRef.current;
    if (!iframeWindow || !state || state.playTime < 2) return;

    const targetOrigin = state.origin || '*';
    const seconds = Math.floor(state.playTime);
    [
      { type: 'seek', time: seconds },
      { type: 'seekTo', time: seconds },
      { event: 'seek', currentTime: seconds },
      { method: 'setCurrentTime', value: seconds },
      { method: 'seekTo', value: seconds },
      { command: 'seek', seconds },
      { action: 'seek', currentTime: seconds },
      { name: 'setCurrentTime', args: [seconds] },
      { event: 'player:seek', data: { currentTime: seconds } },
      {
        context: 'player.js',
        version: '0.0.11',
        method: 'setCurrentTime',
        value: seconds,
      },
      {
        context: 'player.js',
        version: '0.0.11',
        method: 'seekTo',
        value: seconds,
      },
    ].forEach((message) => {
      try {
        iframeWindow.postMessage(message, targetOrigin);
      } catch {
        // Ignore providers that reject a message shape.
      }
    });
  };

  const saveTmdbPlaybackSnapshot = async (
    resolved: PlayerResolveResponse,
    detailData: TmdbPlayDetail | null,
    options: { preserveExistingEpisode?: boolean } = {}
  ) => {
    const storageId = resolved.storageId;
    if (!storageId) return;

    const title = (
      detailData?.title ||
      videoTitleRef.current ||
      searchParams.get('title') ||
      `TMDB ${resolved.tmdbId}`
    ).trim();
    if (!title) return;

    const key = generateStorageKey('tmdb', storageId);
    let existingRecord:
      | Awaited<ReturnType<typeof getAllPlayRecords>>[string]
      | undefined;
    try {
      const records = await getAllPlayRecords();
      existingRecord = records[key];
      if (
        options.preserveExistingEpisode &&
        existingRecord &&
        existingRecord.index !== resolved.episode
      ) {
        return;
      }
    } catch {
      // Snapshot saving should never block playback.
    }

    const existingSameEpisode =
      existingRecord && existingRecord.index === resolved.episode
        ? existingRecord
        : null;
    const nextRecord = buildTmdbPlaybackRecord(resolved, detailData, {
      playTime: existingSameEpisode?.play_time || 0,
      totalTime: existingSameEpisode?.total_time || undefined,
    });
    if (!nextRecord) return;

    try {
      await savePlayRecord('tmdb', storageId, nextRecord);
      if (resolved.embedUrl) {
        tmdbEmbedProgressRef.current = {
          storageId,
          episode: nextRecord.index,
          playTime: nextRecord.play_time,
          totalTime: nextRecord.total_time,
          hasExactTime: false,
          startedAt: null,
          lastSavedPlayTime: nextRecord.play_time,
          lastSavedAt: Date.now(),
          origin: getUrlOrigin(resolved.embedUrl),
        };
        resumeTimeRef.current = nextRecord.play_time;
        if (nextRecord.play_time > 1) {
          window.setTimeout(postTmdbEmbedResume, 0);
        }
      }
    } catch (err) {
      console.error('Failed to save TMDB watch snapshot:', err);
    }
  };

  const applyTmdbPlayback = (
    resolved: PlayerResolveResponse,
    detailData: TmdbPlayDetail | null,
    options: { preserveExistingEpisode?: boolean } = {}
  ) => {
    const syntheticDetail = createSyntheticTmdbDetail(resolved, detailData);
    const nextEpisodeIndex = Math.max(0, resolved.episode - 1);

    setTmdbMode(true);
    setTmdbPlayerId(resolved.tmdbId);
    setTmdbMediaType(resolved.mediaType);
    setCurrentSeason(resolved.season);
    setPlayerProvider(resolved.provider.id);
    setTmdbEpisodes(
      resolved.mediaType === 'tv' ? resolved.seasonDetail?.episodes || [] : []
    );
    setCurrentSource('tmdb');
    setCurrentId(resolved.storageId);
    setVideoTitle(syntheticDetail.title);
    setVideoYear(syntheticDetail.year);
    setVideoCover(syntheticDetail.poster);
    setDetail(syntheticDetail);
    setCurrentEpisodeIndex(nextEpisodeIndex);
    setPlayerEmbedUrl(
      addResumeParamsToEmbedUrl(
        resolved.embedUrl || '',
        resumeTimeRef.current || 0
      )
    );
    setNeedPrefer(false);
    syncTmdbPlayerUrl(resolved, detailData);
    void saveTmdbPlaybackSnapshot(resolved, detailData, options);
    setIsVideoLoading(true);
  };

  const switchTmdbPlayback = async (input: {
    season?: number;
    episode?: number;
    provider?: string;
  }) => {
    const tmdbId = tmdbPlayerIdRef.current;
    if (!tmdbId) return;

    const nextMediaType = tmdbMediaTypeRef.current;
    const nextSeason = normalizePositiveInteger(
      input.season ?? currentSeasonRef.current,
      1
    );
    const nextEpisode =
      nextMediaType === 'tv'
        ? normalizePositiveInteger(
            input.episode ?? currentEpisodeIndexRef.current + 1,
            1
          )
        : 1;
    const nextProvider = normalizeTmdbPlayerProvider(
      input.provider ?? playerProviderRef.current
    );

    setVideoLoadingStage('sourceChanging');
    setIsVideoLoading(true);
    setError(null);

    try {
      const resolved = await fetchTmdbPlayerResolve({
        tmdbId,
        mediaType: nextMediaType,
        season: nextSeason,
        episode: nextEpisode,
        provider: nextProvider,
      });
      applyTmdbPlayback(resolved, tmdbDetail || null);
    } catch (err) {
      setIsVideoLoading(false);
      setError(
        err instanceof Error
          ? err.message
          : t('play.failedToSwitchPlaybackSource')
      );
    }
  };

  const resolveTmdbDetailForCurrent = useCallback(
    async (
      sourceDetail: SearchResult | null
    ): Promise<TmdbPlayDetail | null> => {
      const mediaType = inferTmdbMediaType(sourceDetail);
      const resolvedYear = normalizeYear(
        sourceDetail?.year || videoYearRef.current
      );
      const normalizedTitle = normalizeQueryText(
        sourceDetail?.title || videoTitleRef.current || searchTitle || ''
      );

      if (
        !normalizedTitle &&
        !(sourceDetail?.source === 'tmdb' && sourceDetail.id)
      ) {
        return null;
      }

      const cacheKey = [
        sourceDetail?.source || '',
        sourceDetail?.id || '',
        mediaType,
        resolvedYear,
        normalizedTitle,
      ].join('|');

      if (tmdbDetailCacheRef.current.has(cacheKey)) {
        return tmdbDetailCacheRef.current.get(cacheKey) || null;
      }

      const fallbackPoster = sourceDetail?.poster || videoCover || '';

      if (
        sourceDetail?.source === 'tmdb' &&
        /^\d+$/.test(sourceDetail.id || '')
      ) {
        const byIdParams = new URLSearchParams({
          id: sourceDetail.id,
          mediaType,
        });
        if (resolvedYear) byIdParams.set('year', resolvedYear);
        if (fallbackPoster) byIdParams.set('poster', fallbackPoster);
        const byIdResult = await fetchTmdbDetailByParams(byIdParams);
        if (byIdResult) {
          tmdbDetailCacheRef.current.set(cacheKey, byIdResult);
          return byIdResult;
        }
      }

      const titleCandidates = buildTmdbTitleCandidates(
        sourceDetail,
        mediaType
      ).slice(0, 14);
      const yearCandidates = resolvedYear ? [resolvedYear, ''] : [''];
      const expectedTvTitle = normalizeCompareText(
        stripSpecialTokensForQuery(
          stripSeasonTokensForQuery(
            sourceDetail?.title || videoTitleRef.current || searchTitle || ''
          )
        )
      );
      const wantsSpecialTitle = isLikelySpecialTitle(
        sourceDetail?.title || videoTitleRef.current || searchTitle || ''
      );
      let fallbackSpecialResult: TmdbPlayDetail | null = null;

      for (const titleCandidate of titleCandidates) {
        for (const yearCandidate of yearCandidates) {
          const params = new URLSearchParams({
            title: titleCandidate,
            mediaType,
          });
          if (yearCandidate) params.set('year', yearCandidate);
          if (fallbackPoster) params.set('poster', fallbackPoster);
          const result = await fetchTmdbDetailByParams(params);
          if (result) {
            if (mediaType === 'tv' && !wantsSpecialTitle) {
              const resultTitle = result.title || '';
              const resultBase = normalizeCompareText(
                stripSpecialTokensForQuery(
                  stripSeasonTokensForQuery(resultTitle)
                ) || resultTitle
              );
              const baseMatched =
                Boolean(expectedTvTitle) &&
                Boolean(resultBase) &&
                (resultBase === expectedTvTitle ||
                  resultBase.includes(expectedTvTitle) ||
                  expectedTvTitle.includes(resultBase));
              if (isLikelySpecialTitle(resultTitle)) {
                if (baseMatched && !fallbackSpecialResult) {
                  fallbackSpecialResult = result;
                }
                continue;
              }
            }
            tmdbDetailCacheRef.current.set(cacheKey, result);
            return result;
          }
        }
      }

      if (fallbackSpecialResult) {
        tmdbDetailCacheRef.current.set(cacheKey, fallbackSpecialResult);
        return fallbackSpecialResult;
      }

      tmdbDetailCacheRef.current.set(cacheKey, null);
      return null;
    },
    [searchTitle, searchType, videoCover]
  );

  // Initialize playback from TMDB id. The old title aggregation flow is no longer used.
  useEffect(() => {
    const initAll = async () => {
      if (!initialTmdbId) {
        setError(t('play.missingTmdbPlaybackId'));
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadingStage('fetching');
      setLoadingMessage(t('play.resolvingPlaybackSource'));
      setVideoLoadingStage('initing');
      setIsVideoLoading(true);

      const detailParams = new URLSearchParams({
        id: String(initialTmdbId),
        mediaType: initialTmdbMediaType,
      });
      const titleParam = searchParams.get('title');
      const yearParam = searchParams.get('year');
      const posterParam = searchParams.get('poster');
      const scoreParam = searchParams.get('score');
      if (titleParam) detailParams.set('title', titleParam);
      if (yearParam) detailParams.set('year', yearParam);
      if (posterParam) detailParams.set('poster', posterParam);
      if (scoreParam) detailParams.set('score', scoreParam);

      try {
        const [detailData, resolved] = await Promise.all([
          fetchTmdbDetailByParams(detailParams),
          fetchTmdbPlayerResolve({
            tmdbId: initialTmdbId,
            mediaType: initialTmdbMediaType,
            season: initialTmdbSeason,
            episode: initialTmdbEpisode,
            provider: initialTmdbProvider,
          }),
        ]);

        setTmdbDetail(detailData);
        applyTmdbPlayback(resolved, detailData, {
          preserveExistingEpisode: true,
        });
        setLoadingStage('ready');
        setLoadingMessage(t('play.readyStartingPlayback'));
        setLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('play.failedToResolvePlayback')
        );
        setLoading(false);
        setIsVideoLoading(false);
      }
    };

    void initAll();
  }, []);

  // 播放记录处理
  useEffect(() => {
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;

      const key = generateStorageKey(currentSource, currentId);
      if (historyResumeKeysRef.current.has(key)) return;
      historyResumeKeysRef.current.add(key);

      try {
        const allRecords = await getAllPlayRecords();
        const record = allRecords[key];

        if (record) {
          const targetIndex = record.index - 1;
          const targetTime = record.play_time;

          if (tmdbModeRef.current) {
            if (hasExplicitTmdbEpisodeParam) {
              resumeTimeRef.current =
                targetIndex === currentEpisodeIndexRef.current ? targetTime : 0;
              return;
            }

            if (
              targetIndex >= 0 &&
              targetIndex !== currentEpisodeIndexRef.current
            ) {
              resumeTimeRef.current = targetTime;
              void switchTmdbPlayback({ episode: targetIndex + 1 });
              return;
            }
          } else if (targetIndex !== currentEpisodeIndexRef.current) {
            setCurrentEpisodeIndex(targetIndex);
          }

          resumeTimeRef.current = targetTime;
        }
      } catch (err) {
        console.error('Failed to read play history:', err);
      }
    };

    void initFromHistory();
  }, [currentSource, currentId]);

  useEffect(() => {
    if (tmdbModeRef.current) return;

    const requestId = ++tmdbDetailRequestIdRef.current;
    setTmdbDetail(null);

    const run = async () => {
      const resolved = await resolveTmdbDetailForCurrent(detailRef.current);
      if (tmdbDetailRequestIdRef.current !== requestId) return;
      setTmdbDetail(resolved);
    };

    void run();
  }, [
    detail?.source,
    detail?.id,
    detail?.title,
    detail?.year,
    detail?.episodes?.length,
    resolveTmdbDetailForCurrent,
  ]);

  // ---------------------------------------------------------------------------
  // 集数切换
  // ---------------------------------------------------------------------------
  // 处理集数切换
  const handleEpisodeChange = (episodeNumber: number) => {
    const nextEpisode = Math.max(1, episodeNumber + 1);
    if (currentEpisodeIndexRef.current + 1 === nextEpisode) return;
    saveTmdbEmbedPlayProgress(true);
    void switchTmdbPlayback({ episode: nextEpisode });
  };

  const handlePreviousEpisode = () => {
    const idx = currentEpisodeIndexRef.current;
    if (idx > 0) {
      saveTmdbEmbedPlayProgress(true);
      void switchTmdbPlayback({ episode: idx });
    }
  };

  const handleNextEpisode = () => {
    const idx = currentEpisodeIndexRef.current;
    const total = tmdbEpisodes.length || totalEpisodes || 1;
    if (idx < total - 1) {
      saveTmdbEmbedPlayProgress(true);
      void switchTmdbPlayback({ episode: idx + 2 });
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        !tmdbEmbedIframeRef.current ||
        event.source !== tmdbEmbedIframeRef.current.contentWindow
      ) {
        return;
      }

      const parsed = extractTmdbEmbedProgressMessage(event.data);
      if (!parsed) return;

      const state = tmdbEmbedProgressRef.current;
      if (!state) return;

      if (parsed.duration !== null && parsed.duration > 0) {
        state.totalTime = Math.floor(parsed.duration);
      }

      if (parsed.currentTime !== null && parsed.currentTime >= 0) {
        state.playTime = parsed.currentTime;
        state.hasExactTime = true;
        state.startedAt = null;
      } else if (
        ['play', 'playing', 'ready'].includes(parsed.kind) &&
        state.startedAt === null
      ) {
        state.startedAt = Date.now();
      } else if (
        ['pause', 'paused', 'ended', 'complete'].includes(parsed.kind)
      ) {
        saveTmdbEmbedPlayProgress(true);
        state.startedAt = null;
      }

      if (
        parsed.currentTime !== null ||
        parsed.duration !== null ||
        ['pause', 'paused', 'ended', 'complete'].includes(parsed.kind)
      ) {
        const now = Date.now();
        const interval =
          process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash'
            ? 20000
            : process.env.NEXT_PUBLIC_STORAGE_TYPE === 'd1'
            ? 10000
            : 5000;
        if (now - lastSaveTimeRef.current > interval) {
          saveTmdbEmbedPlayProgress(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [tmdbDetail]);

  useEffect(() => {
    if (!playerEmbedUrl) return;

    const interval = window.setInterval(
      () => {
        saveTmdbEmbedPlayProgress(false);
      },
      process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash' ? 20000 : 10000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [playerEmbedUrl, tmdbDetail]);

  useEffect(() => {
    // 页面即将卸载时保存播放进度
    const handleBeforeUnload = () => {
      saveTmdbEmbedPlayProgress(true);
    };

    // 页面可见性变化时保存播放进度
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveTmdbEmbedPlayProgress(true);
      }
    };

    // 添加事件监听器
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // 清理事件监听器
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentEpisodeIndex, detail]);

  // ---------------------------------------------------------------------------
  // 收藏相关
  // ---------------------------------------------------------------------------
  // 每当 source 或 id 变化时检查收藏状态
  useEffect(() => {
    if (!currentSource || !currentId) return;
    (async () => {
      try {
        const fav = await isFavorited(currentSource, currentId);
        setFavorited(fav);
      } catch (err) {
        console.error('Failed to check favorite status:', err);
      }
    })();
  }, [currentSource, currentId]);

  // 监听收藏数据更新事件
  useEffect(() => {
    if (!currentSource || !currentId) return;

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, any>) => {
        const key = generateStorageKey(currentSource, currentId);
        const isFav = !!favorites[key];
        setFavorited(isFav);
      }
    );

    return unsubscribe;
  }, [currentSource, currentId]);

  // 切换收藏
  const handleToggleFavorite = async () => {
    if (
      !videoTitleRef.current ||
      !detailRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current
    )
      return;

    try {
      if (favorited) {
        // 如果已收藏，删除收藏
        await deleteFavorite(currentSourceRef.current, currentIdRef.current);
        setFavorited(false);
      } else {
        // 如果未收藏，添加收藏
        await saveFavorite(currentSourceRef.current, currentIdRef.current, {
          title: videoTitleRef.current,
          source_name: detailRef.current?.source_name || '',
          year: detailRef.current?.year,
          cover: detailRef.current?.poster || '',
          total_episodes: detailRef.current?.episodes.length || 1,
          save_time: Date.now(),
          search_title: searchTitle,
        });
        setFavorited(true);
        setFavoriteBurstKey((prev) => prev + 1);
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const updateCastScrollState = useCallback(() => {
    const rail = castRailRef.current;
    if (!rail) {
      setCanScrollCastLeft(false);
      setCanScrollCastRight(false);
      return;
    }
    setCanScrollCastLeft(rail.scrollLeft > 10);
    const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
    setCanScrollCastRight(remaining > 10);
  }, []);

  const scrollCastLeft = useCallback(() => {
    const rail = castRailRef.current;
    if (!rail) return;
    const distance = Math.max(Math.floor(rail.clientWidth * 0.72), 280);
    rail.scrollBy({ left: -distance, behavior: 'smooth' });
  }, []);

  const scrollCastRight = useCallback(() => {
    const rail = castRailRef.current;
    if (!rail) return;
    const distance = Math.max(Math.floor(rail.clientWidth * 0.72), 280);
    rail.scrollBy({ left: distance, behavior: 'smooth' });
  }, []);

  const updateCollectionScrollState = useCallback(() => {
    const rail = collectionRailRef.current;
    if (!rail) {
      setCanScrollCollectionLeft(false);
      setCanScrollCollectionRight(false);
      return;
    }
    setCanScrollCollectionLeft(rail.scrollLeft > 10);
    const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
    setCanScrollCollectionRight(remaining > 10);
  }, []);

  const scrollCollectionLeft = useCallback(() => {
    const rail = collectionRailRef.current;
    if (!rail) return;
    const distance = Math.max(Math.floor(rail.clientWidth * 0.72), 280);
    rail.scrollBy({ left: -distance, behavior: 'smooth' });
  }, []);

  const scrollCollectionRight = useCallback(() => {
    const rail = collectionRailRef.current;
    if (!rail) return;
    const distance = Math.max(Math.floor(rail.clientWidth * 0.72), 280);
    rail.scrollBy({ left: distance, behavior: 'smooth' });
  }, []);

  const updateRecommendedScrollState = useCallback(() => {
    const rail = recommendedRailRef.current;
    if (!rail) {
      setCanScrollRecommendedLeft(false);
      setCanScrollRecommendedRight(false);
      return;
    }
    setCanScrollRecommendedLeft(rail.scrollLeft > 10);
    const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
    setCanScrollRecommendedRight(remaining > 10);
  }, []);

  const scrollRecommendedLeft = useCallback(() => {
    const rail = recommendedRailRef.current;
    if (!rail) return;
    const distance = Math.max(Math.floor(rail.clientWidth * 0.72), 280);
    rail.scrollBy({ left: -distance, behavior: 'smooth' });
  }, []);

  const scrollRecommendedRight = useCallback(() => {
    const rail = recommendedRailRef.current;
    if (!rail) return;
    const distance = Math.max(Math.floor(rail.clientWidth * 0.72), 280);
    rail.scrollBy({ left: distance, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      updateCastScrollState();
    });
    return () => cancelAnimationFrame(frame);
  }, [tmdbDetail?.id, tmdbDetail?.cast?.length, updateCastScrollState]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      updateRecommendedScrollState();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    tmdbDetail?.id,
    tmdbDetail?.recommendations?.length,
    updateRecommendedScrollState,
  ]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      updateCollectionScrollState();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    tmdbDetail?.id,
    tmdbDetail?.collection?.parts?.length,
    updateCollectionScrollState,
  ]);

  useEffect(() => {
    const handleResize = () => {
      updateCastScrollState();
      updateCollectionScrollState();
      updateRecommendedScrollState();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [
    updateCastScrollState,
    updateCollectionScrollState,
    updateRecommendedScrollState,
  ]);

  const closeSeasonMenu = useCallback(() => {
    setSeasonMenuOpen(false);
    setSeasonMenuRect(null);
  }, []);
  const toggleSeasonMenu = useCallback(() => {
    const button = seasonMenuButtonRef.current;
    if (!button) {
      setSeasonMenuOpen((open) => !open);
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    const firstEpisodeRow = episodeListRef.current?.querySelector<HTMLElement>(
      '[data-episode-row="true"]'
    );
    const rowRect = firstEpisodeRow?.getBoundingClientRect();
    const listRect = episodeListRef.current?.getBoundingClientRect();
    const rect =
      rowRect && rowRect.width > 0
        ? rowRect
        : listRect && listRect.width > 0
        ? listRect
        : buttonRect;
    setSeasonMenuRect({
      left: rect.left,
      top: buttonRect.bottom,
      width: rect.width,
    });
    setSeasonMenuOpen((open) => !open);
  }, []);
  useEffect(() => {
    if (!seasonMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (seasonMenuButtonRef.current?.contains(target)) return;
      if (seasonMenuRef.current?.contains(target)) return;
      closeSeasonMenu();
    };
    const onCloseByViewportChange = () => {
      closeSeasonMenu();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onCloseByViewportChange);
    window.addEventListener('scroll', onCloseByViewportChange, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onCloseByViewportChange);
      window.removeEventListener('scroll', onCloseByViewportChange, true);
    };
  }, [closeSeasonMenu, seasonMenuOpen]);

  const LoadingIcon =
    loadingStage === 'preferring'
      ? Zap
      : loadingStage === 'fetching'
      ? Film
      : loadingStage === 'ready'
      ? Sparkles
      : Film;
  const VideoLoadingIcon = RefreshCw;

  if (loading) {
    return (
      <PageLayout activePath='/play' showDesktopTopSearch>
        <div className='relative flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6 w-full'>
            <div className='flex justify-center mb-8'>
              {/* From Uiverse.io by jaykdoe */}
              <div className='stack' aria-hidden='true'>
                <div className='stack__card'></div>
                <div className='stack__card'></div>
                <div className='stack__card'></div>
                <div className='stack__card'></div>
                <div className='stack__card'></div>
              </div>
            </div>

            {/* 加载消息 */}
            <div className='space-y-2'>
              <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
                <span className='inline-flex items-center gap-2'>
                  <LoadingIcon className='h-5 w-5' />
                  {loadingMessage}
                </span>
              </p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play' showDesktopTopSearch>
        <div className='flex min-h-screen items-center justify-center px-5 py-20 text-center'>
          <div className='max-w-md space-y-4'>
            <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500'>
              <Info className='h-5 w-5' />
            </div>
            <h1 className='text-xl font-semibold text-zinc-900 dark:text-zinc-100'>
              {t('play.noPlayableSourceFound')}
            </h1>
            <p className='text-sm leading-6 text-zinc-600 dark:text-zinc-400'>
              {error || t('play.sourceUnavailable')}
            </p>
            <button
              type='button'
              onClick={() => router.back()}
              className='ui-glass-control inline-flex items-center gap-2 px-4 py-2 text-sm font-medium'
            >
              <ArrowLeft className='h-4 w-4' />
              {t('common.back')}
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  const displayTitle =
    tmdbDetail?.title || videoTitle || detail?.title || t('common.untitled');
  const displayYear = tmdbDetail?.year || detail?.year || videoYear;
  const displayOverview = tmdbDetail?.overview || detail?.desc || '';
  const displayPoster =
    tmdbDetail?.poster || tmdbDetail?.backdrop || videoCover;
  const displayType =
    tmdbDetail?.mediaType === 'tv'
      ? t('common.series')
      : tmdbDetail?.mediaType === 'movie'
      ? t('common.movie')
      : detail?.type_name || '';
  const displayGenres = tmdbDetail?.genres || [];
  const displayCast = tmdbDetail?.cast || [];
  const displayCollection = tmdbDetail?.collection;
  const displayRecommendations =
    (tmdbDetail?.recommendations || []).filter(
      (item) =>
        !(
          item.id === tmdbDetail?.id && item.mediaType === tmdbDetail?.mediaType
        )
    ) || [];
  const playBackground = tmdbDetail?.backdrop || tmdbDetail?.poster || '';
  const seasonOptions =
    tmdbMode && tmdbMediaType === 'tv'
      ? Array.from(
          { length: Math.max(1, tmdbDetail?.seasons || currentSeason || 1) },
          (_, index) => index + 1
        )
      : [];
  const visibleTmdbEpisodes = [...tmdbEpisodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );
  const currentTmdbEpisodeNumber = currentEpisodeIndex + 1;
  const formatEpisodeMeta = (episode: TmdbEpisodeItem): string => {
    const chunks: string[] = [];
    if (episode.runtime) {
      chunks.push(t('play.runtimeMinutes', { count: episode.runtime }));
    }
    if (episode.airDate) {
      const date = new Date(`${episode.airDate}T00:00:00`);
      chunks.push(
        Number.isNaN(date.getTime())
          ? episode.airDate
          : date.toLocaleDateString(
              i18n.language === 'zh' ? 'zh-CN' : 'en-US',
              {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }
            )
      );
    }
    return chunks.join(' · ');
  };
  const buildRecommendedPlayUrl = (item: {
    id?: number;
    title: string;
    mediaType: 'movie' | 'tv';
    year?: string;
    poster?: string;
    score?: string;
  }): string => {
    if (item.id) {
      return buildTmdbPlayerPageUrl({
        tmdbId: item.id,
        mediaType: item.mediaType,
        title: item.title,
        year: item.year,
        poster: item.poster,
        score: item.score,
      });
    }

    return buildTmdbPlayerPageUrl({
      tmdbId: '',
      mediaType: item.mediaType,
      title: item.title,
      year: item.year,
    });
  };
  const closeRecommendedDetailModal = () => {
    recommendedDetailRequestIdRef.current += 1;
    setRecommendedDetailOpen(false);
    setRecommendedDetailLoading(false);
    setRecommendedDetailError(null);
    setRecommendedDetailData(null);
    setRecommendedDetailTarget(null);
  };
  const openRecommendedDetailModal = async (item: {
    id: number;
    mediaType: 'movie' | 'tv';
    title: string;
    year?: string;
  }) => {
    const requestId = ++recommendedDetailRequestIdRef.current;
    setRecommendedDetailTarget(item);
    setRecommendedDetailOpen(true);
    setRecommendedDetailLoading(true);
    setRecommendedDetailError(null);
    setRecommendedDetailData(null);

    const params = new URLSearchParams({
      id: String(item.id),
      mediaType: item.mediaType,
    });
    if (item.year) {
      params.set('year', item.year);
    }

    const resolved = await fetchTmdbDetailByParams(params);
    if (recommendedDetailRequestIdRef.current !== requestId) {
      return;
    }

    if (!resolved) {
      setRecommendedDetailError(t('play.failedToLoadDetailsLater'));
      setRecommendedDetailLoading(false);
      return;
    }

    setRecommendedDetailData(resolved);
    setRecommendedDetailLoading(false);
  };
  const retryOpenRecommendedDetailModal = () => {
    if (!recommendedDetailTarget) return;
    void openRecommendedDetailModal(recommendedDetailTarget);
  };
  const handleRecommendedPlayFromDetail = () => {
    const playTarget = recommendedDetailData || recommendedDetailTarget;
    if (!playTarget?.title || !playTarget?.mediaType) return;
    const targetUrl = buildRecommendedPlayUrl({
      id: playTarget.id,
      title: playTarget.title,
      mediaType: playTarget.mediaType,
      year: playTarget.year || '',
      poster:
        recommendedDetailData?.poster || recommendedDetailData?.backdrop || '',
      score: recommendedDetailData?.score || '',
    });
    window.location.assign(targetUrl);
  };
  const episodePanel =
    tmdbMode && tmdbMediaType === 'tv' ? (
      <div className='pointer-events-none absolute bottom-0 left-0 right-0 z-[720] flex flex-col items-end gap-2 md:left-auto'>
        <div
          className={`pointer-events-auto absolute right-0 top-[calc(100%+0.5rem)] w-full origin-top-right transition-all duration-200 ease-out md:static md:w-[430px] md:origin-bottom-right ${
            episodePanelOpen
              ? 'translate-y-0 scale-100 opacity-100'
              : 'pointer-events-none -translate-y-2 scale-[0.98] opacity-0 md:translate-y-3'
          }`}
        >
          <section
            aria-hidden={!episodePanelOpen}
            className={`ui-glass-panel max-h-[min(58vh,520px)] flex-col overflow-hidden p-2.5 ${
              episodePanelOpen ? 'flex' : 'hidden'
            }`}
          >
            {seasonOptions.length > 1 ? (
              <div className='relative z-[690] border-b border-[var(--ui-glass-divider)] px-1 pb-2'>
                <button
                  ref={seasonMenuButtonRef}
                  type='button'
                  onClick={toggleSeasonMenu}
                  aria-haspopup='listbox'
                  aria-expanded={seasonMenuOpen}
                  className='ui-glass-control flex h-10 w-full items-center justify-between px-3 text-left'
                  style={{ borderRadius: 'var(--ui-radius-row)' }}
                >
                  <span className='ui-token-text-primary truncate text-sm font-semibold'>
                    {t('seasonPicker.season', { season: currentSeason })}
                  </span>
                  <ChevronRight
                    className={`ui-token-text-muted h-4 w-4 transition-transform duration-200 ${
                      seasonMenuOpen ? 'rotate-90' : ''
                    }`}
                  />
                </button>
              </div>
            ) : null}

            <div
              ref={episodeListRef}
              className={`ui-episode-list min-h-0 flex-1 space-y-1.5 overflow-y-auto scrollbar-hide ${
                seasonOptions.length > 1 ? 'pt-2' : ''
              }`}
            >
              {visibleTmdbEpisodes.length > 0 ? (
                visibleTmdbEpisodes.map((episode) => {
                  const isActive =
                    episode.episodeNumber === currentTmdbEpisodeNumber;
                  const meta = formatEpisodeMeta(episode);
                  return (
                    <button
                      key={`episode-${episode.seasonNumber}-${episode.episodeNumber}`}
                      type='button'
                      onClick={() => {
                        if (isActive) return;
                        handleEpisodeChange(episode.episodeNumber - 1);
                        setEpisodePanelOpen(false);
                      }}
                      data-active={isActive}
                      data-episode-row='true'
                      className='ui-glass-row ui-episode-row group flex w-full items-stretch gap-3 p-2 text-left transition-colors data-[active=true]:bg-[var(--ui-glass-row-active)]'
                    >
                      <div className='ui-token-media-surface relative min-h-20 w-28 flex-shrink-0 self-stretch overflow-hidden sm:w-32'>
                        {episode.still ? (
                          <img
                            src={episode.still}
                            alt={episode.title}
                            className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                          />
                        ) : (
                          <div className='ui-token-media-empty flex h-full w-full items-center justify-center text-xs'>
                            E{episode.episodeNumber}
                          </div>
                        )}
                      </div>

                      <div className='min-w-0 flex-1 py-0.5'>
                        <div className='flex min-w-0 items-center gap-2'>
                          <span className='ui-token-text-subtle shrink-0 text-[11px] font-semibold'>
                            E{episode.episodeNumber}
                          </span>
                          <h3 className='ui-episode-title ui-token-text-primary line-clamp-1 text-sm font-semibold'>
                            {episode.title ||
                              t('common.episode', {
                                count: episode.episodeNumber,
                              })}
                          </h3>
                        </div>
                        {meta ? (
                          <p className='ui-token-text-subtle mt-0.5 text-xs'>
                            {meta}
                          </p>
                        ) : null}
                        {episode.overview ? (
                          <p className='ui-token-text-muted mt-1 line-clamp-1 text-xs leading-5 sm:line-clamp-2'>
                            {episode.overview}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div
                  className='ui-glass-panel ui-token-text-muted p-5 text-center text-sm'
                  style={{ borderRadius: 'var(--ui-radius-row)' }}
                >
                  {t('common.noRelatedContentFound')}
                </div>
              )}
            </div>
          </section>
        </div>

        <button
          type='button'
          onClick={() => setEpisodePanelOpen((open) => !open)}
          className={`pointer-events-auto ui-glass-control ui-episode-trigger group inline-flex items-center transition-transform hover:scale-[1.02] ${
            episodePanelOpen ? 'ui-glass-control-active' : ''
          }`}
          aria-label={
            episodePanelOpen
              ? t('common.hideEpisodes')
              : t('common.showEpisodes')
          }
          aria-expanded={episodePanelOpen}
        >
          <span className='ui-episode-trigger-icon inline-flex items-center justify-center'>
            <Film className='ui-token-text-secondary ui-episode-trigger-icon' />
          </span>
          <span className='flex min-w-0 items-center leading-none'>
            <span className='ui-token-text-primary whitespace-nowrap text-sm font-semibold'>
              S{currentSeason} E{currentTmdbEpisodeNumber}
            </span>
          </span>
          <ChevronRight
            className={`ui-token-text-muted ui-episode-trigger-chevron transition-transform duration-200 ${
              episodePanelOpen
                ? 'rotate-90 md:-rotate-90'
                : 'rotate-0 md:rotate-90'
            }`}
          />
        </button>
      </div>
    ) : null;

  return (
    <PageLayout activePath='/play' disableMobileTopPadding showDesktopTopSearch>
      <div className='relative'>
        {playBackground ? (
          <div className='pointer-events-none absolute inset-0 -z-10 overflow-hidden'>
            <img
              src={playBackground}
              alt=''
              aria-hidden='true'
              className='h-full w-full scale-[1.02] object-cover object-center brightness-[0.38] blur-[3px]'
            />
            <div className='absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent' />
            <div className='absolute inset-0 bg-gradient-to-r from-black/50 to-transparent' />
          </div>
        ) : null}

        <div className='relative z-[1] flex flex-col gap-3 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+4.5rem)] md:pt-4 lg:px-[3rem] 2xl:px-20'>
          <div className='h-12' aria-hidden='true' />
          <div>
            <div
              className={`relative min-w-0 ${
                tmdbMode && tmdbMediaType === 'tv' ? 'pb-16' : ''
              }`}
            >
              <div className='h-[300px] overflow-hidden rounded-[var(--ui-radius-card)] border border-white/0 shadow-lg dark:border-white/30 lg:h-[520px] xl:h-[650px] 2xl:h-[750px]'>
                <div className='relative h-full w-full bg-black'>
                  {playerEmbedUrl ? (
                    <iframe
                      key={playerEmbedUrl}
                      src={playerEmbedUrl}
                      title={`${displayTitle} player`}
                      allow='autoplay; encrypted-media; picture-in-picture; fullscreen'
                      allowFullScreen
                      ref={tmdbEmbedIframeRef}
                      referrerPolicy='origin'
                      onLoad={() => {
                        setIsVideoLoading(false);
                        postTmdbEmbedResume();
                      }}
                      className='h-full w-full rounded-[var(--ui-radius-card)] border-0 bg-black'
                    />
                  ) : null}

                  {isVideoLoading && (
                    <div className='absolute inset-0 z-[500] flex items-center justify-center rounded-[var(--ui-radius-card)] bg-black/85 backdrop-blur-sm transition-all duration-300'>
                      <div className='mx-auto max-w-md px-6 text-center'>
                        <svg
                          className='play-heart'
                          viewBox='-5 -5 278 56'
                          version='1.1'
                          xmlns='http://www.w3.org/2000/svg'
                          aria-hidden='true'
                        >
                          <filter id='blur'>
                            <feGaussianBlur stdDeviation='1.6'></feGaussianBlur>
                          </filter>
                          <g transform='translate(29.1 -127.42)'>
                            <path
                              pathLength='1'
                              d='M-28.73 167.2c26.43 9.21 68.46-9.46 85.45-12.03 18.45-2.78 32.82 4.86 28.75 9.83-3.82 4.66-25.77-21.18-14.81-31.5 9.54-8.98 17.64 10.64 16.42 17.06-1.51-6.2 2.95-26.6 14.74-22.11 11.7 4.46-4.33 49.03-15.44 44.08-6.97-3.1 15.44-16.26 26.1-16 23.03.56 55.6 27.51 126.63 3.36'
                              id='line'
                            ></path>
                          </g>
                          <g transform='translate(29.1 -127.42)'>
                            <path
                              pathLength='1'
                              d='M-28.73 167.2c26.43 9.21 68.46-9.46 85.45-12.03 18.45-2.78 32.82 4.86 28.75 9.83-3.82 4.66-25.77-21.18-14.81-31.5 9.54-8.98 17.64 10.64 16.42 17.06-1.51-6.2 2.95-26.6 14.74-22.11 11.7 4.46-4.33 49.03-15.44 44.08-6.97-3.1 15.44-16.26 26.1-16 23.03.56 55.6 27.51 126.63 3.36'
                              id='point'
                              filter='url(#blur)'
                            ></path>
                          </g>
                        </svg>

                        <p className='text-xl font-semibold text-white animate-pulse'>
                          <span className='inline-flex items-center gap-2'>
                            <VideoLoadingIcon className='h-5 w-5 animate-spin' />
                            {videoLoadingStage === 'sourceChanging'
                              ? 'Switching source...'
                              : 'Loading video...'}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {episodePanel}
            </div>
          </div>

          {/* 详情展示 */}
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
            {/* 文字区 */}
            <div className='md:col-span-3'>
              <div className='p-6 flex flex-col min-h-0'>
                {/* 标题 */}
                <div className='mb-3 flex w-full items-center'>
                  <div className='min-w-0 flex-1'>
                    {tmdbDetail?.logo ? (
                      <>
                        <img
                          src={tmdbDetail.logo}
                          alt={`${displayTitle} logo`}
                          className='mx-0 h-20 w-auto max-w-full object-contain object-left drop-shadow-[0_8px_20px_rgba(0,0,0,0.45)] md:h-24 lg:h-28'
                        />
                        <h1 className='sr-only'>{displayTitle}</h1>
                      </>
                    ) : (
                      <h1 className='text-3xl font-bold tracking-wide text-center md:text-left'>
                        {displayTitle}
                      </h1>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleToggleFavorite();
                    }}
                    className='ml-3 inline-flex flex-shrink-0 items-center justify-center text-gray-700 transition-transform duration-200 hover:scale-110 active:scale-95 dark:text-gray-200'
                    aria-label={
                      favorited ? 'Remove from favorites' : 'Add to favorites'
                    }
                    title={
                      favorited ? 'Remove from favorites' : 'Add to favorites'
                    }
                  >
                    <FavoriteIcon
                      filled={favorited}
                      burstKey={favoriteBurstKey}
                    />
                  </button>
                </div>

                {/* 关键信息行 */}
                <div className='mb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-800/90 dark:text-white/90 flex-shrink-0'>
                  {tmdbDetail?.score && (
                    <span className='inline-flex items-center gap-1 text-yellow-500 dark:text-yellow-400 font-semibold'>
                      <Star size={14} fill='currentColor' />
                      {tmdbDetail.score}
                      {tmdbDetail.voteCount > 0
                        ? ` (${tmdbDetail.voteCount})`
                        : ''}
                    </span>
                  )}
                  {displayYear && (
                    <span className='inline-flex items-center gap-1 text-gray-700/80 dark:text-white/80'>
                      <CalendarDays size={14} />
                      {displayYear}
                    </span>
                  )}
                  {tmdbDetail?.runtime ? (
                    <span className='inline-flex items-center gap-1 text-gray-700/80 dark:text-white/80'>
                      <Clock3 size={14} />
                      {tmdbDetail.runtime}min
                    </span>
                  ) : null}
                  {tmdbDetail?.mediaType === 'tv' &&
                  tmdbDetail.seasons &&
                  tmdbDetail.episodes ? (
                    <span className='inline-flex items-center gap-1 text-gray-700/80 dark:text-white/80'>
                      <Users size={14} />
                      {t('hero.tvMeta', {
                        seasons: tmdbDetail.seasons,
                        episodes: tmdbDetail.episodes,
                      })}
                    </span>
                  ) : null}
                  {displayType && (
                    <span className='rounded border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] px-1.5 py-0.5 text-[11px] font-medium text-gray-800/95 backdrop-blur-md dark:text-white/95'>
                      {displayType}
                    </span>
                  )}
                  {tmdbDetail?.contentRating && (
                    <span className='rounded border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] px-1.5 py-0.5 text-[11px] font-medium text-gray-800/95 backdrop-blur-md dark:text-white/95'>
                      {tmdbDetail.contentRating}
                    </span>
                  )}
                </div>
                {displayGenres.length > 0 ? (
                  <div className='mt-1 flex flex-wrap gap-2'>
                    {displayGenres.map((genre) => (
                      <span
                        key={`tmdb-genre-${genre}`}
                        className='rounded-full border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] px-2.5 py-1 text-xs text-gray-800/90 backdrop-blur-md dark:text-white/90'
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                ) : null}
                {/* 剧情简介 */}
                {displayOverview && (
                  <p
                    className='mt-3 text-sm leading-6 text-gray-700/90 dark:text-white/85 sm:text-base'
                    style={{ whiteSpace: 'pre-line' }}
                  >
                    {displayOverview}
                  </p>
                )}
                {displayCast.length > 0 ? (
                  <section className='mt-4 space-y-3'>
                    <h2 className='text-sm font-semibold text-gray-900/90 dark:text-white/90'>
                      {t('detail.cast')}
                    </h2>
                    <div
                      className='relative'
                      onMouseEnter={() => {
                        setCastRailHovered(true);
                        updateCastScrollState();
                      }}
                      onMouseLeave={() => setCastRailHovered(false)}
                    >
                      <div
                        ref={castRailRef}
                        onScroll={updateCastScrollState}
                        className='-mx-1 flex items-start gap-5 overflow-x-auto px-1 pb-2 scroll-smooth scrollbar-hide sm:gap-6'
                      >
                        {displayCast.map((item) => (
                          <button
                            type='button'
                            key={`play-cast-${item.id}-${item.name}`}
                            onClick={() => router.push(`/person/${item.id}`)}
                            className='group flex w-[88px] flex-shrink-0 flex-col items-center text-center sm:w-[104px]'
                          >
                            <div className='relative h-[82px] w-[82px] overflow-hidden rounded-full border border-[var(--ui-glass-border)] bg-[var(--ui-glass-control-bg)] shadow-[var(--ui-shadow-control)] sm:h-24 sm:w-24'>
                              {item.profile ? (
                                <img
                                  src={item.profile}
                                  alt={item.name}
                                  className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                                />
                              ) : (
                                <div className='flex h-full w-full items-center justify-center text-gray-300/80'>
                                  <Users size={20} />
                                </div>
                              )}
                            </div>
                            <div className='mt-2 w-full'>
                              <p className='truncate text-xs font-semibold leading-4 text-gray-900 dark:text-gray-100 sm:text-[13px]'>
                                {item.name}
                              </p>
                              <p className='mt-0.5 line-clamp-1 text-[11px] leading-4 text-gray-600 dark:text-gray-400'>
                                {item.character || t('detail.unknownRole')}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                      {canScrollCastLeft ? (
                        <div
                          className={`absolute left-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
                            castRailHovered ? 'opacity-100' : 'opacity-0'
                          }`}
                          style={{
                            background: 'transparent',
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            className='absolute inset-0 flex items-center justify-center'
                            style={{
                              top: '22px',
                              bottom: 'auto',
                              left: '-4.5rem',
                              pointerEvents: 'auto',
                            }}
                          >
                            <button
                              type='button'
                              onClick={scrollCastLeft}
                              className='ui-glass-control flex h-12 w-12 items-center justify-center transition-transform hover:scale-105'
                              aria-label={t('detail.showPreviousCast')}
                            >
                              <ChevronLeft className='h-6 w-6 text-gray-600 dark:text-gray-300' />
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {canScrollCastRight ? (
                        <div
                          className={`absolute right-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
                            castRailHovered ? 'opacity-100' : 'opacity-0'
                          }`}
                          style={{
                            background: 'transparent',
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            className='absolute inset-0 flex items-center justify-center'
                            style={{
                              top: '22px',
                              bottom: 'auto',
                              right: '-4.5rem',
                              pointerEvents: 'auto',
                            }}
                          >
                            <button
                              type='button'
                              onClick={scrollCastRight}
                              className='ui-glass-control flex h-12 w-12 items-center justify-center transition-transform hover:scale-105'
                              aria-label={t('detail.showMoreCast')}
                            >
                              <ChevronRight className='h-6 w-6 text-gray-600 dark:text-gray-300' />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {displayCollection && displayCollection.parts.length > 0 ? (
                  <section className='mt-4 space-y-3'>
                    <div>
                      <h2 className='text-sm font-semibold text-gray-900/90 dark:text-white/90'>
                        {t('detail.collection')}
                      </h2>
                      <div className='mt-1 flex max-w-full items-center gap-2'>
                        <p className='min-w-0 truncate text-xs text-gray-600 dark:text-gray-400'>
                          {displayCollection.name}
                        </p>
                        <span className='inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-black/[0.06] px-1.5 text-[10px] font-medium leading-none text-gray-600 dark:bg-white/[0.08] dark:text-white/55'>
                          {displayCollection.parts.length}
                        </span>
                      </div>
                    </div>
                    <div
                      className='relative'
                      onMouseEnter={() => {
                        setCollectionRailHovered(true);
                        updateCollectionScrollState();
                      }}
                      onMouseLeave={() => setCollectionRailHovered(false)}
                    >
                      <div
                        ref={collectionRailRef}
                        onScroll={updateCollectionScrollState}
                        className='-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-2 scroll-smooth scrollbar-hide'
                      >
                        {displayCollection.parts.map((item) => (
                          <button
                            type='button'
                            key={`play-collection-${item.id}`}
                            onClick={() => {
                              router.push(
                                buildTmdbDetailPageUrl({
                                  id: item.id,
                                  mediaType: 'movie',
                                  title: item.title,
                                  year: item.year,
                                  poster: item.poster,
                                  score: item.score,
                                })
                              );
                            }}
                            className='group flex w-[132px] flex-shrink-0 flex-col text-left'
                          >
                            <div className='relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-black/20'>
                              {item.poster ? (
                                <img
                                  src={item.poster}
                                  alt={item.title}
                                  className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                                />
                              ) : (
                                <div className='flex h-full w-full items-center justify-center text-[11px] text-gray-300/80'>
                                  {t('common.noPoster')}
                                </div>
                              )}
                              {item.score ? (
                                <div className='absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 backdrop-blur'>
                                  <Star size={10} fill='currentColor' />
                                  {item.score}
                                </div>
                              ) : null}
                            </div>
                            <div className='mt-2 h-14'>
                              <p className='line-clamp-2 text-xs font-medium leading-4 text-gray-900 dark:text-gray-100'>
                                {item.title}
                              </p>
                              <p className='mt-0.5 text-[11px] leading-4 text-gray-600 dark:text-gray-400'>
                                {item.year || t('common.unknownYear')}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                      {canScrollCollectionLeft ? (
                        <div
                          className={`absolute left-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
                            collectionRailHovered ? 'opacity-100' : 'opacity-0'
                          }`}
                          style={{
                            background: 'transparent',
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            className='absolute inset-0 flex items-center justify-center'
                            style={{
                              top: '40%',
                              bottom: '60%',
                              left: '-4.5rem',
                              pointerEvents: 'auto',
                            }}
                          >
                            <button
                              type='button'
                              onClick={scrollCollectionLeft}
                              className='ui-glass-control flex h-12 w-12 items-center justify-center transition-transform hover:scale-105'
                              aria-label={t('detail.showPreviousCollection')}
                            >
                              <ChevronLeft className='h-6 w-6 text-gray-600 dark:text-gray-300' />
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {canScrollCollectionRight ? (
                        <div
                          className={`absolute right-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
                            collectionRailHovered ? 'opacity-100' : 'opacity-0'
                          }`}
                          style={{
                            background: 'transparent',
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            className='absolute inset-0 flex items-center justify-center'
                            style={{
                              top: '40%',
                              bottom: '60%',
                              right: '-4.5rem',
                              pointerEvents: 'auto',
                            }}
                          >
                            <button
                              type='button'
                              onClick={scrollCollectionRight}
                              className='ui-glass-control flex h-12 w-12 items-center justify-center transition-transform hover:scale-105'
                              aria-label={t('detail.showMoreCollection')}
                            >
                              <ChevronRight className='h-6 w-6 text-gray-600 dark:text-gray-300' />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {displayRecommendations.length > 0 ? (
                  <section className='mt-4 space-y-3'>
                    <h2 className='text-sm font-semibold text-gray-900/90 dark:text-white/90'>
                      {t('detail.moreLikeThis')}
                    </h2>
                    <div
                      className='relative'
                      onMouseEnter={() => {
                        setRecommendedRailHovered(true);
                        updateRecommendedScrollState();
                      }}
                      onMouseLeave={() => setRecommendedRailHovered(false)}
                    >
                      <div
                        ref={recommendedRailRef}
                        onScroll={updateRecommendedScrollState}
                        className='-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-2 scroll-smooth scrollbar-hide'
                      >
                        {displayRecommendations.slice(0, 20).map((item) => (
                          <button
                            type='button'
                            key={`play-recommend-${item.mediaType}-${item.id}`}
                            onClick={() => {
                              router.push(
                                buildTmdbDetailPageUrl({
                                  id: item.id,
                                  mediaType: item.mediaType,
                                  title: item.title,
                                  year: item.year,
                                  poster: item.poster,
                                  score: item.score,
                                })
                              );
                            }}
                            className='group flex w-[132px] flex-shrink-0 flex-col text-left'
                          >
                            <div className='relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-black/20'>
                              {item.poster ? (
                                <img
                                  src={item.poster}
                                  alt={item.title}
                                  className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                                />
                              ) : (
                                <div className='flex h-full w-full items-center justify-center text-[11px] text-gray-300/80'>
                                  {t('common.noPoster')}
                                </div>
                              )}
                              {item.score ? (
                                <div className='absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 backdrop-blur'>
                                  <Star size={10} fill='currentColor' />
                                  {item.score}
                                </div>
                              ) : null}
                            </div>
                            <div className='mt-2 h-14'>
                              <p className='line-clamp-2 text-xs font-medium leading-4 text-gray-900 dark:text-gray-100'>
                                {item.title}
                              </p>
                              <p className='mt-0.5 text-[11px] leading-4 text-gray-600 dark:text-gray-400'>
                                {item.year || t('common.unknownYear')}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                      {canScrollRecommendedLeft ? (
                        <div
                          className={`absolute left-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
                            recommendedRailHovered ? 'opacity-100' : 'opacity-0'
                          }`}
                          style={{
                            background: 'transparent',
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            className='absolute inset-0 flex items-center justify-center'
                            style={{
                              top: '40%',
                              bottom: '60%',
                              left: '-4.5rem',
                              pointerEvents: 'auto',
                            }}
                          >
                            <button
                              type='button'
                              onClick={scrollRecommendedLeft}
                              className='ui-glass-control flex h-12 w-12 items-center justify-center transition-transform hover:scale-105'
                              aria-label={t(
                                'detail.showPreviousRecommendations'
                              )}
                            >
                              <ChevronLeft className='h-6 w-6 text-gray-600 dark:text-gray-300' />
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {canScrollRecommendedRight ? (
                        <div
                          className={`absolute right-0 top-0 bottom-0 z-[600] hidden w-16 items-center justify-center transition-opacity duration-200 md:flex ${
                            recommendedRailHovered ? 'opacity-100' : 'opacity-0'
                          }`}
                          style={{
                            background: 'transparent',
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            className='absolute inset-0 flex items-center justify-center'
                            style={{
                              top: '40%',
                              bottom: '60%',
                              right: '-4.5rem',
                              pointerEvents: 'auto',
                            }}
                          >
                            <button
                              type='button'
                              onClick={scrollRecommendedRight}
                              className='ui-glass-control flex h-12 w-12 items-center justify-center transition-transform hover:scale-105'
                              aria-label={t('detail.showMoreRecommendations')}
                            >
                              <ChevronRight className='h-6 w-6 text-gray-600 dark:text-gray-300' />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>

            {/* 封面展示 */}
            <div className='hidden md:block md:col-span-1 md:order-first'>
              <div className='pl-0 py-4 pr-6'>
                <div className='bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden'>
                  {displayPoster ? (
                    <img
                      src={displayPoster}
                      alt={displayTitle}
                      className='w-full h-full object-cover'
                    />
                  ) : (
                    <span className='text-gray-600 dark:text-gray-400'>
                      {t('common.noPoster')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TmdbDetailModal
        open={recommendedDetailOpen}
        loading={recommendedDetailLoading}
        error={recommendedDetailError}
        detail={recommendedDetailData}
        titleLogo={recommendedDetailData?.logo}
        onClose={closeRecommendedDetailModal}
        onRetry={retryOpenRecommendedDetailModal}
        onPlay={handleRecommendedPlayFromDetail}
        playLabel={t('common.playNow')}
      />

      {seasonMenuOpen && seasonMenuRect
        ? createPortal(
            <div
              ref={seasonMenuRef}
              role='listbox'
              className='ui-season-menu fixed z-[3000] max-h-72 overflow-hidden p-2'
              style={{
                left: seasonMenuRect.left,
                top: seasonMenuRect.top,
                width: seasonMenuRect.width,
                borderRadius: 'var(--ui-radius-panel)',
              }}
            >
              <div className='max-h-72 space-y-1.5 overflow-y-auto scrollbar-hide'>
                {seasonOptions.map((season) => {
                  const isActive = season === currentSeason;
                  return (
                    <button
                      key={`season-${season}`}
                      type='button'
                      role='option'
                      aria-selected={isActive}
                      onClick={() => {
                        closeSeasonMenu();
                        if (!isActive) {
                          void switchTmdbPlayback({
                            season,
                            episode: 1,
                          });
                        }
                      }}
                      className={`ui-glass-row flex h-10 w-full items-center justify-between gap-3 px-4 text-left text-sm transition-colors ${
                        isActive
                          ? 'ui-token-text-strong bg-[var(--ui-glass-row-active)]'
                          : 'ui-token-text-secondary'
                      }`}
                      style={{
                        borderRadius: 'var(--ui-radius-row)',
                      }}
                    >
                      <span>{t('seasonPicker.season', { season })}</span>
                      {isActive ? (
                        <Check className='ui-token-text-primary h-5 w-5' />
                      ) : (
                        <span className='h-5 w-5' aria-hidden='true' />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </PageLayout>
  );
}

const CIRCLE_RADIUS = 20;
const BURST_RADIUS = 32;
const START_RADIUS = 4;
const PATH_SCALE_FACTOR = 0.8;
const BURST_COLOR_PAIRS = [
  { from: '#FACC15', to: '#FEF08A' },
  { from: '#FBBF24', to: '#FDE68A' },
  { from: '#EAB308', to: '#FACC15' },
  { from: '#FDE047', to: '#FDBA74' },
  { from: '#F59E0B', to: '#FEF3C7' },
  { from: '#FACC15', to: '#F97316' },
  { from: '#FBBF24', to: '#FDE047' },
  { from: '#EAB308', to: '#FEF08A' },
  { from: '#FDE68A', to: '#F59E0B' },
  { from: '#FACC15', to: '#FDBA74' },
  { from: '#FBBF24', to: '#FEF3C7' },
  { from: '#EAB308', to: '#FDE047' },
  { from: '#FACC15', to: '#FEF08A' },
  { from: '#FBBF24', to: '#FDE68A' },
];

const CircleAnimation = () => {
  return (
    <svg
      className='pointer-events-none absolute inset-0'
      style={{
        width: CIRCLE_RADIUS * 2,
        height: CIRCLE_RADIUS * 2,
      }}
    >
      <motion.circle
        cx={CIRCLE_RADIUS}
        cy={CIRCLE_RADIUS}
        fill='none'
        initial={{
          r: 2,
          stroke: '#FACC15',
          strokeWidth: 12,
          opacity: 0.9,
        }}
        animate={{
          r: CIRCLE_RADIUS - 2,
          stroke: '#F59E0B',
          strokeWidth: 0,
          opacity: 1,
        }}
        transition={{
          duration: 0.4,
          ease: [0.33, 1, 0.68, 1],
        }}
      />
    </svg>
  );
};

const Particle = ({
  fromColor,
  toColor,
  index,
  totalParticles,
}: {
  fromColor: string;
  toColor: string;
  index: number;
  totalParticles: number;
}) => {
  const angle = (index / totalParticles) * 360 + 45;
  const radians = (angle * Math.PI) / 180;
  const randomFactor = 0.85 + Math.random() * 0.3;
  const burstDistance = BURST_RADIUS * randomFactor;
  const duration = 500 + Math.random() * 200;
  const degreeShift = (13 * Math.PI) / 180;

  return (
    <motion.span
      className='pointer-events-none absolute h-1.5 w-1.5 rounded-full'
      style={{
        left: '50%',
        top: '50%',
        marginLeft: '-3px',
        marginTop: '-3px',
        backgroundColor: fromColor,
        opacity: 0,
      }}
      initial={{
        opacity: 0,
        scale: 1,
        x: Math.cos(radians) * START_RADIUS * PATH_SCALE_FACTOR,
        y: Math.sin(radians) * START_RADIUS * PATH_SCALE_FACTOR,
        backgroundColor: fromColor,
      }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: Math.cos(radians + degreeShift) * burstDistance * PATH_SCALE_FACTOR,
        y: Math.sin(radians + degreeShift) * burstDistance * PATH_SCALE_FACTOR,
        scale: 0,
        backgroundColor: toColor,
      }}
      transition={{
        opacity: {
          times: [0, 0.01, 0.99, 1],
          duration: duration / 1000,
          delay: 0.4,
        },
        x: {
          duration: duration / 1000,
          ease: [0.23, 1, 0.32, 1],
          delay: 0.3,
        },
        y: {
          duration: duration / 1000,
          ease: [0.23, 1, 0.32, 1],
          delay: 0.3,
        },
        scale: {
          duration: duration / 1000,
          ease: [0.55, 0.085, 0.68, 0.53],
          delay: 0.3,
        },
        backgroundColor: {
          duration: duration / 1000,
          delay: 0.3,
        },
      }}
    />
  );
};

const BurstAnimation = ({ burstKey }: { burstKey: number }) => {
  return (
    <div className='pointer-events-none absolute inset-0'>
      {BURST_COLOR_PAIRS.map((colors, index) => (
        <Particle
          key={`favorite-burst-${burstKey}-${index}`}
          fromColor={colors.from}
          toColor={colors.to}
          index={index}
          totalParticles={BURST_COLOR_PAIRS.length}
        />
      ))}
    </div>
  );
};

// FavoriteIcon 组件
const FavoriteIcon = ({
  filled,
  burstKey,
}: {
  filled: boolean;
  burstKey: number;
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!burstKey) return;
    setIsAnimating(true);
  }, [burstKey]);

  return (
    <span className='relative inline-flex h-7 w-7 items-center justify-center'>
      {isAnimating ? (
        <span className='pointer-events-none absolute -left-1.5 -top-1.5 h-10 w-10'>
          <CircleAnimation />
          <BurstAnimation burstKey={burstKey} />
        </span>
      ) : null}
      {isAnimating ? (
        <motion.span
          key={`favorite-bookmark-pop-${burstKey}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 10,
            delay: 0.3,
          }}
          onAnimationComplete={() => setIsAnimating(false)}
          className='relative z-[1] inline-flex h-7 w-7 items-center justify-center text-yellow-400'
          aria-hidden='true'
        >
          <Bookmark className='h-7 w-7' fill='currentColor' />
        </motion.span>
      ) : (
        <Bookmark
          className={
            filled
              ? 'h-7 w-7 text-yellow-400'
              : 'h-7 w-7 text-gray-600 dark:text-gray-300'
          }
          fill={filled ? 'currentColor' : 'none'}
          aria-hidden='true'
        />
      )}
    </span>
  );
};

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient />
    </Suspense>
  );
}
