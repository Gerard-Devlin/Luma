/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import Artplayer from 'artplayer';
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku';
import { motion } from 'framer-motion';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Bookmark,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Film,
  Info,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  convertDanmakuFormat,
  getDanmakuById,
  getEpisodes as getDanmakuEpisodes,
  initDanmakuModule,
  loadDanmakuDisplayState,
  loadDanmakuSettings,
  saveDanmakuDisplayState,
  saveDanmakuSettings,
  searchAnime as searchDanmakuAnime,
} from '@/lib/danmaku/api';
import { saveDanmakuToCache } from '@/lib/danmaku/cache';
import {
  isDanmakuBlocked,
  loadDanmakuFilterConfig,
  saveDanmakuFilterConfig,
} from '@/lib/danmaku/filter-config';
import {
  getDanmakuAnimeId,
  getDanmakuSearchKeyword,
  getDanmakuSourceIndex,
  getManualDanmakuSelection,
  saveDanmakuAnimeId,
  saveDanmakuSearchKeyword,
  saveDanmakuSourceIndex,
  saveManualDanmakuSelection,
} from '@/lib/danmaku/selection-memory';
import type {
  DanmakuAnime,
  DanmakuComment,
  DanmakuEpisode,
  DanmakuFilterConfig,
  DanmakuSelection,
  DanmakuSettings,
} from '@/lib/danmaku/types';
import {
  deleteFavorite,
  deletePlayRecord,
  deleteSkipConfig,
  generateStorageKey,
  getAllPlayRecords,
  getSkipConfig,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  saveSkipConfig,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { buildTmdbDetailPageUrl } from '@/lib/tmdb-detail-url';
import {
  buildTmdbPlayerPageUrl,
  normalizePositiveInteger,
  normalizeTmdbId,
  normalizeTmdbPlayerMediaType,
  normalizeTmdbPlayerProvider,
  type TmdbPlayerMediaType,
  type TmdbPlayerPlaybackType,
  type TmdbPlayerProvider,
} from '@/lib/tmdb-player-sources';
import { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import DanmakuFilterSettings from '@/components/DanmakuFilterSettings';
import PageLayout from '@/components/PageLayout';
import TmdbDetailModal from '@/components/TmdbDetailModal';

// 扩展 HTMLVideoElement 类型以支持 hls 属性
declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
}

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
  playbackType: TmdbPlayerPlaybackType;
  embedUrl: string;
  directUrl: string | null;
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

function PlayPageClient() {
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
  const [loadingMessage, setLoadingMessage] = useState('Searching playback sources...');
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
  const [playerPlaybackType, setPlayerPlaybackType] = useState<
    TmdbPlayerPlaybackType | ''
  >('');
  const [playerEmbedUrl, setPlayerEmbedUrl] = useState('');
  const [playerLinkCopied, setPlayerLinkCopied] = useState(false);
  const [tmdbEpisodes, setTmdbEpisodes] = useState<TmdbEpisodeItem[]>([]);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [seasonMenuRect, setSeasonMenuRect] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const seasonMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const seasonMenuRef = useRef<HTMLDivElement | null>(null);
  const [episodePanelOpen, setEpisodePanelOpen] = useState(false);
  const castRailRef = useRef<HTMLDivElement | null>(null);
  const [canScrollCastLeft, setCanScrollCastLeft] = useState(false);
  const [canScrollCastRight, setCanScrollCastRight] = useState(false);
  const [castRailHovered, setCastRailHovered] = useState(false);
  const collectionRailRef = useRef<HTMLDivElement | null>(null);
  const [canScrollCollectionLeft, setCanScrollCollectionLeft] =
    useState(false);
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

  // 跳过片头片尾配置
  const [skipConfig, setSkipConfig] = useState<{
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }>({
    enable: false,
    intro_time: 0,
    outro_time: 0,
  });
  const skipConfigRef = useRef(skipConfig);
  useEffect(() => {
    skipConfigRef.current = skipConfig;
  }, [
    skipConfig,
    skipConfig.enable,
    skipConfig.intro_time,
    skipConfig.outro_time,
  ]);

  // 跳过检查的时间间隔控制
  const lastSkipCheckRef = useRef(0);

  // 去广告开关（每次刷新页面默认开启）
  const [blockAdEnabled, setBlockAdEnabled] = useState<boolean>(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('enable_blockad', 'true');
    } catch (_) {
      // ignore
    }
  }, []);
  const blockAdEnabledRef = useRef(blockAdEnabled);
  useEffect(() => {
    blockAdEnabledRef.current = blockAdEnabled;
  }, [blockAdEnabled]);

  // Anime4K 超分相关状态
  const [webGPUSupported, setWebGPUSupported] = useState<boolean>(false);
  const [anime4kEnabled, setAnime4kEnabled] = useState<boolean>(false);
  const [anime4kMode, setAnime4kMode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const mode = localStorage.getItem('anime4k_mode');
      if (
        mode &&
        ['ModeA', 'ModeB', 'ModeC', 'ModeAA', 'ModeBB', 'ModeCA'].includes(mode)
      ) {
        return mode;
      }
    }
    return 'ModeA';
  });
  const [anime4kScale, setAnime4kScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const scale = parseFloat(localStorage.getItem('anime4k_scale') || '');
      if ([1.5, 2, 3, 4].includes(scale)) {
        return scale;
      }
    }
    return 2.0;
  });
  const anime4kRef = useRef<any>(null);
  const anime4kEnabledRef = useRef(anime4kEnabled);
  const anime4kModeRef = useRef(anime4kMode);
  const anime4kScaleRef = useRef(anime4kScale);
  const pendingAnime4KInitRef = useRef(false);
  const orientationLockActiveRef = useRef(false);

  useEffect(() => {
    anime4kEnabledRef.current = anime4kEnabled;
    anime4kModeRef.current = anime4kMode;
    anime4kScaleRef.current = anime4kScale;
  }, [anime4kEnabled, anime4kMode, anime4kScale]);

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
  const playerPlaybackTypeRef = useRef<TmdbPlayerPlaybackType | ''>(
    playerPlaybackType
  );
  const playerEmbedUrlRef = useRef(playerEmbedUrl);
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
    playerPlaybackTypeRef.current = playerPlaybackType;
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
    playerPlaybackType,
    playerEmbedUrl,
  ]);

  // 视频播放地址
  const [videoUrl, setVideoUrl] = useState('');

  // 总集数
  const totalEpisodes = detail?.episodes?.length || 0;

  // 用于记录是否需要在播放器 ready 后跳转到指定进度
  const resumeTimeRef = useRef<number | null>(null);
  // 上次使用的音量，默认 0.7
  const lastVolumeRef = useRef<number>(0.7);
  // 上次使用的播放速率，默认 1.0
  const lastPlaybackRateRef = useRef<number>(1.0);

  // 换源加载状态
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

  const [danmakuSettings, setDanmakuSettings] = useState<DanmakuSettings>(
    loadDanmakuSettings()
  );
  const [danmakuFilterConfig, setDanmakuFilterConfig] =
    useState<DanmakuFilterConfig>(loadDanmakuFilterConfig());
  const [showDanmakuFilterSettings, setShowDanmakuFilterSettings] =
    useState(false);

  const [currentDanmakuSelection, setCurrentDanmakuSelection] =
    useState<DanmakuSelection | null>(null);
  const [, setDanmakuLoading] = useState(false);

  const danmakuPluginRef = useRef<any>(null);
  const danmakuSettingsRef = useRef<DanmakuSettings>(danmakuSettings);
  const danmakuFilterConfigRef =
    useRef<DanmakuFilterConfig>(danmakuFilterConfig);
  const danmakuDisplayStateRef = useRef<boolean>(
    (() => {
      const saved = loadDanmakuDisplayState();
      return saved ?? true;
    })()
  );
  const loadingDanmakuEpisodeIdRef = useRef<number | null>(null);
  const lastDanmakuAutoLoadKeyRef = useRef<string>('');

  // 播放进度保存相关
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);

  const artPlayerRef = useRef<any>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const castSdkLoaderRef = useRef<Promise<boolean> | null>(null);
  const castContextReadyRef = useRef(false);
  const tmdbDetailCacheRef = useRef<Map<string, TmdbPlayDetail | null>>(
    new Map()
  );
  const tmdbDetailRequestIdRef = useRef(0);

  // 检测 WebGPU 支持，并修补 requestDevice limits 以兼容 anime4k-webgpu
  useEffect(() => {
    const checkWebGPUSupport = async () => {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        setWebGPUSupported(false);
        return;
      }

      try {
        const gpu = (navigator as any).gpu;
        if (!gpu.__anime4kAdapterPatched) {
          const originalRequestAdapter = gpu.requestAdapter.bind(gpu);
          gpu.requestAdapter = async (options?: any) => {
            const adapter = await originalRequestAdapter(options);
            if (!adapter) return adapter;

            if (!(adapter as any).__anime4kDevicePatched) {
              const originalRequestDevice = adapter.requestDevice.bind(adapter);
              adapter.requestDevice = async (descriptor?: any) => {
                const limits = adapter.limits || {};
                const enhancedDescriptor = {
                  ...descriptor,
                  requiredLimits: {
                    ...descriptor?.requiredLimits,
                    maxBufferSize: Math.min(
                      limits.maxBufferSize || 2147483648,
                      2147483648
                    ),
                    maxStorageBufferBindingSize: Math.min(
                      limits.maxStorageBufferBindingSize || 1073741824,
                      1073741824
                    ),
                  },
                };
                return originalRequestDevice(enhancedDescriptor);
              };
              (adapter as any).__anime4kDevicePatched = true;
            }

            return adapter;
          };
          gpu.__anime4kAdapterPatched = true;
        }

        const adapter = await (navigator as any).gpu.requestAdapter();
        setWebGPUSupported(Boolean(adapter));
      } catch (err) {
        console.warn('WebGPU 检测失败:', err);
        setWebGPUSupported(false);
      }
    };

    checkWebGPUSupport();
  }, []);

  const isMobileViewport = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return (
      /Android|iPhone|iPad|iPod|Mobile|Windows Phone|HarmonyOS/i.test(ua) ||
      window.matchMedia('(max-width: 1024px)').matches
    );
  };

  const isIOSDevice = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    return (
      /iPhone|iPad|iPod/i.test(ua) ||
      (platform === 'MacIntel' && maxTouchPoints > 1)
    );
  };

  const tryEnterIOSNativeFullscreen = (
    videoElement?: HTMLVideoElement | null
  ) => {
    if (!isIOSDevice()) return false;
    const video = videoElement as any;
    if (!video) return false;
    if (video.webkitDisplayingFullscreen) return true;
    if (typeof video.webkitEnterFullscreen !== 'function') return false;
    try {
      video.webkitEnterFullscreen();
      return true;
    } catch (err) {
      console.debug('iOS 原生全屏触发失败:', err);
      return false;
    }
  };

  const tryLockLandscape = async () => {
    if (typeof window === 'undefined') return;
    if (!isMobileViewport()) return;
    if (isIOSDevice()) return;
    try {
      const orientationApi = (screen as any)?.orientation;
      if (orientationApi?.lock) {
        await orientationApi.lock('landscape');
        orientationLockActiveRef.current = true;
      }
    } catch (err) {
      console.debug('锁定横屏失败，浏览器可能不支持或未处于全屏:', err);
    }
  };

  const tryUnlockOrientation = async () => {
    if (typeof window === 'undefined') return;
    if (!orientationLockActiveRef.current) return;
    try {
      const orientationApi = (screen as any)?.orientation;
      if (orientationApi?.unlock) {
        orientationApi.unlock();
      }
    } catch (err) {
      console.debug('恢复屏幕方向失败:', err);
    } finally {
      orientationLockActiveRef.current = false;
    }
  };

  useEffect(() => {
    danmakuSettingsRef.current = danmakuSettings;
    saveDanmakuSettings(danmakuSettings);
  }, [danmakuSettings]);

  useEffect(() => {
    danmakuFilterConfigRef.current = danmakuFilterConfig;
    saveDanmakuFilterConfig(danmakuFilterConfig);
  }, [danmakuFilterConfig]);

  useEffect(() => {
    initDanmakuModule();
  }, []);

  const normalizeCompareText = (value: string): string =>
    (value || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(
        /[·•:：\-_.()[\]【】「」『』"'"'`~!@#$%^&*+={}\\/|<>?,;，。！？、]/g,
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

    pushVariant(base.replace(/\s*[-‐‑‒–—]\s*/g, ' '));
    pushVariant(base.replace(/\s*[-‐‑‒–—]\s*/g, ''));
    pushVariant(base.replace(/[·•]/g, ' '));
    pushVariant(base.replace(/[·•]/g, ''));

    pushVariant(
      base
        .replace(/\s*[：:]\s*/g, '')
        .replace(/\s*[-‐‑‒–—]\s*/g, '')
        .replace(/[·•]/g, '')
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
    });

    if (input.mediaType === 'tv') {
      params.set('season', String(normalizePositiveInteger(input.season, 1)));
      params.set('episode', String(normalizePositiveInteger(input.episode, 1)));
    }

    const response = await fetch(`/api/player/resolve?${params.toString()}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      let message = 'Failed to resolve playback source';
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
      detailData?.year || searchParams.get('year') || videoYearRef.current || '';
    const episodeCount =
      resolved.mediaType === 'movie'
        ? 1
        : Math.max(1, resolved.seasonDetail?.episodeCount || resolved.episodeCount);
    const activeUrl = resolved.directUrl || resolved.embedUrl || '';

    return {
      id: resolved.storageId,
      title,
      poster,
      episodes: Array.from({ length: episodeCount }, (_, index) =>
        index + 1 === resolved.episode ? activeUrl : ''
      ),
      total_episodes: episodeCount,
      source: 'tmdb',
      source_name: resolved.sourceName,
      year,
      score: detailData?.score || searchParams.get('score') || '',
      desc: detailData?.overview || '',
      type_name: resolved.mediaType === 'tv' ? 'Series' : 'Movie',
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
    return detailData?.backdrop || detailData?.poster || videoCoverRef.current || '';
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
    const runtimeSeconds = getTmdbResolvedRuntimeSeconds(resolved, detailData);

    try {
      await savePlayRecord('tmdb', storageId, {
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
        play_time: existingSameEpisode?.play_time || 0,
        total_time: runtimeSeconds || existingSameEpisode?.total_time || 0,
        save_time: Date.now(),
        search_title: title,
      });
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
    setPlayerPlaybackType(resolved.playbackType);
    setTmdbEpisodes(
      resolved.mediaType === 'tv'
        ? resolved.seasonDetail?.episodes || []
        : []
    );
    setCurrentSource('tmdb');
    setCurrentId(resolved.storageId);
    setVideoTitle(syntheticDetail.title);
    setVideoYear(syntheticDetail.year);
    setVideoCover(syntheticDetail.poster);
    setDetail(syntheticDetail);
    setCurrentEpisodeIndex(nextEpisodeIndex);
    setPlayerEmbedUrl(resolved.directUrl ? '' : resolved.embedUrl || '');
    setVideoUrl(resolved.directUrl || '');
    setNeedPrefer(false);
    syncTmdbPlayerUrl(resolved, detailData);
    void saveTmdbPlaybackSnapshot(resolved, detailData, options);

    if (!resolved.directUrl && resolved.embedUrl) {
      if (artPlayerRef.current) {
        (artPlayerRef.current as any)?.__cleanupFullscreenOrientation?.();
        if (artPlayerRef.current.video?.hls) {
          artPlayerRef.current.video.hls.destroy();
        }
        artPlayerRef.current.destroy();
        artPlayerRef.current = null;
        danmakuPluginRef.current = null;
      }
      setIsVideoLoading(true);
    }
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
        err instanceof Error ? err.message : 'Failed to switch playback source'
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

  // 更新视频地址
  const updateVideoUrl = (
    detailData: SearchResult | null,
    episodeIndex: number
  ) => {
    if (
      !detailData ||
      !detailData.episodes ||
      episodeIndex >= detailData.episodes.length
    ) {
      setVideoUrl('');
      return;
    }
    const newUrl = detailData?.episodes[episodeIndex] || '';
    if (newUrl !== videoUrl) {
      setVideoUrl(newUrl);
    }
  };

  const ensureVideoSource = (video: HTMLVideoElement | null, url: string) => {
    if (!video || !url) return;
    const sources = Array.from(video.getElementsByTagName('source'));
    const existed = sources.some((s) => s.src === url);
    if (!existed) {
      // 移除旧的 source，保持唯一
      sources.forEach((s) => s.remove());
      const sourceEl = document.createElement('source');
      sourceEl.src = url;
      video.appendChild(sourceEl);
    }

    // 始终允许远程播放（AirPlay / Cast）
    video.disableRemotePlayback = false;
    // 如果曾经有禁用属性，移除之
    if (video.hasAttribute('disableRemotePlayback')) {
      video.removeAttribute('disableRemotePlayback');
    }
  };

  const getCastMimeType = useCallback((url: string) => {
    const cleanUrl = url.split('#')[0].split('?')[0].toLowerCase();
    if (cleanUrl.endsWith('.m3u8')) return 'application/x-mpegURL';
    if (cleanUrl.endsWith('.mpd')) return 'application/dash+xml';
    if (cleanUrl.endsWith('.webm')) return 'video/webm';
    return 'video/mp4';
  }, []);

  const ensureGoogleCastSdk = useCallback(async () => {
    if (typeof window === 'undefined') return false;
    const globalWindow = window as any;
    if (globalWindow.cast?.framework && globalWindow.chrome?.cast) {
      return true;
    }
    if (castSdkLoaderRef.current) {
      return castSdkLoaderRef.current;
    }

    castSdkLoaderRef.current = new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      const previousHandler = globalWindow.__onGCastApiAvailable;
      globalWindow.__onGCastApiAvailable = (available: boolean, ...args: any[]) => {
        if (typeof previousHandler === 'function') {
          previousHandler(available, ...args);
        }
        finish(Boolean(available));
      };

      const existingScript = document.querySelector(
        'script[data-moon-tv-cast-sdk="1"]'
      ) as HTMLScriptElement | null;
      if (!existingScript) {
        const script = document.createElement('script');
        script.src =
          'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
        script.async = true;
        script.defer = true;
        script.setAttribute('data-moon-tv-cast-sdk', '1');
        script.onerror = () => finish(false);
        document.head.appendChild(script);
      }

      window.setTimeout(() => {
        finish(Boolean(globalWindow.cast?.framework && globalWindow.chrome?.cast));
      }, 6000);
    });

    const loaded = await castSdkLoaderRef.current;
    if (!loaded) {
      castSdkLoaderRef.current = null;
    }
    return loaded;
  }, []);

  const startGoogleCast = useCallback(
    async (url: string, currentTime: number) => {
      if (!url || typeof window === 'undefined') return false;

      const globalWindow = window as any;
      const castFramework = globalWindow.cast?.framework;
      const chromeCast = globalWindow.chrome?.cast;
      if (!castFramework || !chromeCast) return false;

      try {
        const context = castFramework.CastContext.getInstance();
        if (!castContextReadyRef.current) {
          context.setOptions({
            receiverApplicationId:
              chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID || 'CC1AD845',
            autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
          });
          castContextReadyRef.current = true;
        }

        let session = context.getCurrentSession();
        if (!session) {
          await context.requestSession();
          session = context.getCurrentSession();
        }
        if (!session) return false;

        const mediaInfo = new chromeCast.media.MediaInfo(url, getCastMimeType(url));
        const metadata = new chromeCast.media.GenericMediaMetadata();
        metadata.title = videoTitleRef.current
          ? `${videoTitleRef.current} - Episode ${currentEpisodeIndexRef.current + 1}`
          : `Episode ${currentEpisodeIndexRef.current + 1}`;
        if (videoCoverRef.current) {
          metadata.images = [new chromeCast.Image(videoCoverRef.current)];
        }
        mediaInfo.metadata = metadata;

        const request = new chromeCast.media.LoadRequest(mediaInfo);
        request.autoplay = true;
        if (Number.isFinite(currentTime) && currentTime > 0) {
          request.currentTime = currentTime;
        }

        await session.loadMedia(request);
        return true;
      } catch (err) {
        console.warn('Google Cast failed:', err);
        return false;
      }
    },
    [getCastMimeType]
  );

  const openRemotePlaybackPicker = useCallback(
    async (video: HTMLVideoElement) => {
      const remote = (video as any).remote;
      if (!remote || typeof remote.prompt !== 'function') {
        return false;
      }

      try {
        await remote.prompt();
        return true;
      } catch (err) {
        console.warn('Failed to open Remote Playback:', err);
        return false;
      }
    },
    []
  );

  const openAirPlayPicker = useCallback((video: HTMLVideoElement) => {
    const webkitVideo = video as any;
    if (typeof webkitVideo.webkitShowPlaybackTargetPicker !== 'function') {
      return false;
    }
    try {
      webkitVideo.webkitShowPlaybackTargetPicker();
      return true;
    } catch (err) {
      console.warn('Failed to open AirPlay:', err);
      return false;
    }
  }, []);

  const handleCastClick = useCallback(async () => {
    const player = artPlayerRef.current;
    const video = player?.video as HTMLVideoElement | undefined;
    if (!player || !video) return;

    const directUrlFromState =
      videoUrl ||
      detailRef.current?.episodes?.[currentEpisodeIndexRef.current] ||
      '';
    const runtimeUrl = video.currentSrc || video.src || '';
    const url =
      runtimeUrl && !/^blob:/i.test(runtimeUrl)
        ? runtimeUrl
        : directUrlFromState || runtimeUrl;
    if (!url) {
      player.notice.show = 'This video is not ready for casting yet';
      return;
    }

    const currentTime = player.currentTime || 0;
    const globalWindow = typeof window !== 'undefined' ? (window as any) : null;
    const nativeBridge =
      globalWindow?.LumaNative ||
      globalWindow?.['Neo' + 'Moon' + 'TVNative'];
    if (nativeBridge) {
      try {
        // Android WebView wrapper: player cast button should trigger native DLNA device picker.
        if (typeof nativeBridge.castCurrent === 'function') {
          nativeBridge.castCurrent();
          player.notice.show = 'Searching for DLNA devices...';
          return;
        }
        if (typeof nativeBridge.cast === 'function') {
          nativeBridge.cast(
            url,
            typeof document !== 'undefined' ? document.title || 'Luma' : 'Luma',
            video.poster || '',
            currentTime
          );
          player.notice.show = 'Searching for DLNA devices...';
          return;
        }
      } catch (err) {
        console.warn('Failed to open native DLNA picker:', err);
      }
    }

    const castReadyNow = Boolean(
      globalWindow?.cast?.framework && globalWindow?.chrome?.cast
    );
    const ua =
      typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const preferGoogleCast = /(chrome|crios|edg|android)/.test(ua);

    // 优先走 Google Cast，避免前置 await 破坏用户手势，导致设备选择器无法弹出。
    if (preferGoogleCast) {
      if (!castReadyNow) {
        void ensureGoogleCastSdk();
        player.notice.show = 'Cast is initializing. Tap cast again in a moment';
        return;
      }

      if (await startGoogleCast(url, currentTime)) {
        player.notice.show = 'Connected to cast device';
        player.pause();
        return;
      }
    }

    if (await openRemotePlaybackPicker(video)) {
      player.notice.show = 'Opened the cast device list';
      return;
    }

    if (!preferGoogleCast && castReadyNow && (await startGoogleCast(url, currentTime))) {
      player.notice.show = 'Connected to cast device';
      player.pause();
      return;
    }

    if (openAirPlayPicker(video)) {
      player.notice.show = 'Opened the AirPlay device list';
      return;
    }

    player.notice.show =
      'No cast device found, or casting is not supported by this browser';
  }, [
    ensureGoogleCastSdk,
    openAirPlayPicker,
    openRemotePlaybackPicker,
    startGoogleCast,
    videoUrl,
  ]);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent.toLowerCase();
    if (!/(chrome|crios|edg|android)/.test(ua)) return;
    void ensureGoogleCastSdk();
  }, [ensureGoogleCastSdk]);

  // 去广告相关函数
  function filterAdsFromM3U8(m3u8Content: string): string {
    if (!m3u8Content) return '';

    // 按行分割M3U8内容
    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 只过滤#EXT-X-DISCONTINUITY标识
      if (!line.includes('#EXT-X-DISCONTINUITY')) {
        filteredLines.push(line);
      }
    }

    return filteredLines.join('\n');
  }

  // 跳过片头片尾配置相关函数
  const handleSkipConfigChange = async (newConfig: {
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }) => {
    if (!currentSourceRef.current || !currentIdRef.current) return;

    try {
      setSkipConfig(newConfig);
      if (!newConfig.enable && !newConfig.intro_time && !newConfig.outro_time) {
        await deleteSkipConfig(currentSourceRef.current, currentIdRef.current);
        artPlayerRef.current.setting.update({
          name: 'Skip Intro/Outro',
          html: 'Skip Intro/Outro',
          switch: skipConfigRef.current.enable,
          onSwitch: function (item: any) {
            const newConfig = {
              ...skipConfigRef.current,
              enable: !item.switch,
            };
            handleSkipConfigChange(newConfig);
            return !item.switch;
          },
        });
        artPlayerRef.current.setting.update({
          name: 'Set Intro',
          html: 'Set Intro',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
          tooltip:
            skipConfigRef.current.intro_time === 0
              ? 'Set intro time'
              : `${formatTime(skipConfigRef.current.intro_time)}`,
          onClick: function () {
            const currentTime = artPlayerRef.current?.currentTime || 0;
            if (currentTime > 0) {
              const newConfig = {
                ...skipConfigRef.current,
                intro_time: currentTime,
              };
              handleSkipConfigChange(newConfig);
              return `${formatTime(currentTime)}`;
            }
          },
        });
        artPlayerRef.current.setting.update({
          name: 'Set Outro',
          html: 'Set Outro',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
          tooltip:
            skipConfigRef.current.outro_time >= 0
              ? 'Set outro time'
              : `-${formatTime(-skipConfigRef.current.outro_time)}`,
          onClick: function () {
            const outroTime =
              -(
                artPlayerRef.current?.duration -
                artPlayerRef.current?.currentTime
              ) || 0;
            if (outroTime < 0) {
              const newConfig = {
                ...skipConfigRef.current,
                outro_time: outroTime,
              };
              handleSkipConfigChange(newConfig);
              return `-${formatTime(-outroTime)}`;
            }
          },
        });
      } else {
        await saveSkipConfig(
          currentSourceRef.current,
          currentIdRef.current,
          newConfig
        );
      }
      console.log('Skip intro/outro settings saved:', newConfig);
    } catch (err) {
      console.error('Failed to save skip intro/outro settings:', err);
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (hours === 0) {
      // 不到一小时，格式为 00:00
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`;
    } else {
      // 超过一小时，格式为 00:00:00
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  };

  // 初始化 Anime4K 超分
  const initAnime4K = async () => {
    if (!webGPUSupported || !artPlayerRef.current?.video) return;

    let frameRequestId: number | null = null;
    let outputCanvas: HTMLCanvasElement | null = null;

    try {
      if (anime4kRef.current) {
        await cleanupAnime4K();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const video = artPlayerRef.current.video as HTMLVideoElement;
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise<void>((resolve) => {
          const onLoadedMetadata = () => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            resolve();
          };
          video.addEventListener('loadedmetadata', onLoadedMetadata);
          if (video.videoWidth && video.videoHeight) {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            resolve();
          }
        });
      }

      if (!video.videoWidth || !video.videoHeight) {
        throw new Error('Unable to read video dimensions');
      }

      const container =
        artPlayerRef.current.template?.$video?.parentElement || video.parentElement;
      if (!container) {
        throw new Error('Unable to find the video container');
      }

      const scale = anime4kScaleRef.current;
      outputCanvas = document.createElement('canvas');
      outputCanvas.width = Math.floor(video.videoWidth * scale);
      outputCanvas.height = Math.floor(video.videoHeight * scale);
      outputCanvas.style.position = 'absolute';
      outputCanvas.style.top = '0';
      outputCanvas.style.left = '0';
      outputCanvas.style.width = '100%';
      outputCanvas.style.height = '100%';
      outputCanvas.style.objectFit = 'contain';
      outputCanvas.style.cursor = 'pointer';
      outputCanvas.style.zIndex = '1';
      outputCanvas.style.backgroundColor = 'transparent';

      const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
      let sourceCanvas: HTMLCanvasElement | null = null;
      let sourceCtx: CanvasRenderingContext2D | null = null;

      if (isFirefox) {
        sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = Math.floor(video.videoWidth);
        sourceCanvas.height = Math.floor(video.videoHeight);
        sourceCtx = sourceCanvas.getContext('2d', {
          willReadFrequently: true,
          alpha: false,
        });
        if (!sourceCtx) {
          throw new Error('Unable to create the Firefox bridge canvas context');
        }

        if (video.readyState >= video.HAVE_CURRENT_DATA) {
          sourceCtx.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);
        }
      }

      const handleCanvasClick = () => {
        artPlayerRef.current?.toggle?.();
      };
      const handleCanvasDblClick = () => {
        if (artPlayerRef.current) {
          if (
            tryEnterIOSNativeFullscreen(
              artPlayerRef.current.video as HTMLVideoElement
            )
          ) {
            return;
          }
          artPlayerRef.current.fullscreen = !artPlayerRef.current.fullscreen;
        }
      };
      outputCanvas.addEventListener('click', handleCanvasClick);
      outputCanvas.addEventListener('dblclick', handleCanvasDblClick);

      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.style.position = 'absolute';
      video.style.zIndex = '-1';
      container.insertBefore(outputCanvas, video);

      if (isFirefox && sourceCanvas && sourceCtx) {
        const captureVideoFrame = () => {
          if (video.readyState >= video.HAVE_CURRENT_DATA) {
            sourceCtx!.drawImage(video, 0, 0, sourceCanvas!.width, sourceCanvas!.height);
          }
          frameRequestId = requestAnimationFrame(captureVideoFrame);
        };
        captureVideoFrame();
      }

      const {
        render: anime4kRender,
        ModeA,
        ModeB,
        ModeC,
        ModeAA,
        ModeBB,
        ModeCA,
      } = await import('anime4k-webgpu');
      const modeMap: Record<string, any> = {
        ModeA,
        ModeB,
        ModeC,
        ModeAA,
        ModeBB,
        ModeCA,
      };
      const ModeClass = modeMap[anime4kModeRef.current] || ModeA;

      const renderConfig: any = {
        video: isFirefox ? sourceCanvas : video,
        canvas: outputCanvas,
        pipelineBuilder: (device: any, inputTexture: any) => {
          const mode = new ModeClass({
            device,
            inputTexture,
            nativeDimensions: {
              width: Math.floor(video.videoWidth),
              height: Math.floor(video.videoHeight),
            },
            targetDimensions: {
              width: Math.floor(outputCanvas!.width),
              height: Math.floor(outputCanvas!.height),
            },
          });
          return [mode];
        },
      };

      const controller = await anime4kRender(renderConfig);
      anime4kRef.current = {
        controller,
        canvas: outputCanvas,
        sourceCanvas: isFirefox ? sourceCanvas : null,
        frameRequestId: isFirefox ? frameRequestId : null,
        handleCanvasClick,
        handleCanvasDblClick,
      };
      artPlayerRef.current.notice.show = `Upscaling enabled (${anime4kModeRef.current}, ${scale}x)`;
    } catch (err) {
      console.error('Failed to initialize Anime4K:', err);
      if (frameRequestId) {
        cancelAnimationFrame(frameRequestId);
      }
      if (outputCanvas?.parentNode) {
        outputCanvas.parentNode.removeChild(outputCanvas);
      }
      if (artPlayerRef.current?.video) {
        artPlayerRef.current.video.style.opacity = '1';
        artPlayerRef.current.video.style.pointerEvents = 'auto';
        artPlayerRef.current.video.style.position = '';
        artPlayerRef.current.video.style.zIndex = '';
      }
      artPlayerRef.current?.notice &&
        (artPlayerRef.current.notice.show =
          'Failed to enable upscaling: ' +
          (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // 清理 Anime4K
  const cleanupAnime4K = async () => {
    if (anime4kRef.current) {
      try {
        if (anime4kRef.current.frameRequestId) {
          cancelAnimationFrame(anime4kRef.current.frameRequestId);
        }
        anime4kRef.current.controller?.stop?.();

        if (anime4kRef.current.canvas) {
          if (anime4kRef.current.handleCanvasClick) {
            anime4kRef.current.canvas.removeEventListener(
              'click',
              anime4kRef.current.handleCanvasClick
            );
          }
          if (anime4kRef.current.handleCanvasDblClick) {
            anime4kRef.current.canvas.removeEventListener(
              'dblclick',
              anime4kRef.current.handleCanvasDblClick
            );
          }
          if (anime4kRef.current.canvas.parentNode) {
            anime4kRef.current.canvas.parentNode.removeChild(anime4kRef.current.canvas);
          }
        }

        if (anime4kRef.current.sourceCanvas) {
          const ctx = anime4kRef.current.sourceCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(
              0,
              0,
              anime4kRef.current.sourceCanvas.width,
              anime4kRef.current.sourceCanvas.height
            );
          }
        }
      } catch (err) {
        console.warn('Failed to clean up Anime4K:', err);
      } finally {
        anime4kRef.current = null;
      }
    }

    if (artPlayerRef.current?.video) {
      artPlayerRef.current.video.style.opacity = '1';
      artPlayerRef.current.video.style.pointerEvents = 'auto';
      artPlayerRef.current.video.style.position = '';
      artPlayerRef.current.video.style.zIndex = '';
    }
  };

  // 切换 Anime4K 状态
  const toggleAnime4K = async (enabled: boolean) => {
    if (enabled && !webGPUSupported) {
      artPlayerRef.current?.notice &&
        (artPlayerRef.current.notice.show =
          'This browser does not support WebGPU, so upscaling cannot be enabled');
      return;
    }

    try {
      if (enabled) {
        pendingAnime4KInitRef.current = false;
        await initAnime4K();
      } else {
        pendingAnime4KInitRef.current = false;
        await cleanupAnime4K();
      }
      setAnime4kEnabled(enabled);
      localStorage.setItem('enable_anime4k', String(enabled));
    } catch (err) {
      console.error('Failed to toggle upscaling:', err);
      artPlayerRef.current?.notice &&
        (artPlayerRef.current.notice.show = 'Failed to toggle upscaling');
    }
  };

  // 更改 Anime4K 模式
  const changeAnime4KMode = async (mode: string) => {
    try {
      setAnime4kMode(mode);
      localStorage.setItem('anime4k_mode', mode);

      if (anime4kEnabledRef.current) {
        await cleanupAnime4K();
        await initAnime4K();
      }
    } catch (err) {
      console.error('Failed to change upscaling mode:', err);
      artPlayerRef.current?.notice &&
        (artPlayerRef.current.notice.show = 'Failed to change upscaling mode');
    }
  };

  // 更改 Anime4K 超分倍数
  const changeAnime4KScale = async (scale: number) => {
    try {
      setAnime4kScale(scale);
      localStorage.setItem('anime4k_scale', scale.toString());

      if (anime4kEnabledRef.current) {
        await cleanupAnime4K();
        await initAnime4K();
      }
    } catch (err) {
      console.error('Failed to change upscaling scale:', err);
      artPlayerRef.current?.notice &&
        (artPlayerRef.current.notice.show = 'Failed to change upscaling scale');
    }
  };

  class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config: any) {
      super(config);
      const load = this.load.bind(this);
      this.load = function (context: any, config: any, callbacks: any) {
        // 拦截manifest和level请求
        if (
          (context as any).type === 'manifest' ||
          (context as any).type === 'level'
        ) {
          const onSuccess = callbacks.onSuccess;
          callbacks.onSuccess = function (
            response: any,
            stats: any,
            context: any
          ) {
            // 如果是m3u8文件，处理内容以移除广告分段
            if (response.data && typeof response.data === 'string') {
              // 过滤掉广告段 - 实现更精确的广告过滤逻辑
              response.data = filterAdsFromM3U8(response.data);
            }
            return onSuccess(response, stats, context, null);
          };
        }
        // 执行原始load方法
        load(context, config, callbacks);
      };
    }
  }

  // 当集数索引变化时自动更新视频地址
  useEffect(() => {
    if (tmdbModeRef.current) return;
    updateVideoUrl(detail, currentEpisodeIndex);
  }, [detail, currentEpisodeIndex]);

  // Initialize playback from TMDB id. The old title aggregation flow is no longer used.
  useEffect(() => {
    const initAll = async () => {
      if (!initialTmdbId) {
        setError('Missing TMDB playback id');
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadingStage('fetching');
      setLoadingMessage('Resolving playback source...');
      setVideoLoadingStage('initing');
      setIsVideoLoading(true);

      const detailParams = new URLSearchParams({
        id: String(initialTmdbId),
        mediaType: initialTmdbMediaType,
        logoLang: 'en',
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
        setLoadingMessage('Ready. Starting playback...');
        setLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to resolve playback'
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

  // 跳过片头片尾配置处理
  useEffect(() => {
    // 仅在初次挂载时检查跳过片头片尾配置
    const initSkipConfig = async () => {
      if (!currentSource || !currentId) return;

      try {
        const config = await getSkipConfig(currentSource, currentId);
        if (config) {
          setSkipConfig(config);
        }
      } catch (err) {
        console.error('Failed to read skip intro/outro settings:', err);
      }
    };

    initSkipConfig();
  }, []);

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

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 集数切换
  // ---------------------------------------------------------------------------
  // 处理集数切换
  const handleEpisodeChange = (episodeNumber: number) => {
    if (tmdbModeRef.current) {
      const nextEpisode = Math.max(1, episodeNumber + 1);
      if (currentEpisodeIndexRef.current + 1 === nextEpisode) return;
      void switchTmdbPlayback({ episode: nextEpisode });
      return;
    }

    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      // 在更换集数前保存当前播放进度
      if (artPlayerRef.current && artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handlePreviousEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (tmdbModeRef.current) {
      if (idx > 0) {
        void switchTmdbPlayback({ episode: idx });
      }
      return;
    }
    if (d && d.episodes && idx > 0) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(idx - 1);
    }
  };

  const handleNextEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (tmdbModeRef.current) {
      const total = tmdbEpisodes.length || totalEpisodes || 1;
      if (idx < total - 1) {
        void switchTmdbPlayback({ episode: idx + 2 });
      }
      return;
    }
    if (d && d.episodes && idx < d.episodes.length - 1) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(idx + 1);
    }
  };

  // ---------------------------------------------------------------------------
  // 键盘快捷键
  // ---------------------------------------------------------------------------
  // 处理全局快捷键
  const handleKeyboardShortcuts = (e: KeyboardEvent) => {
    // 忽略输入框中的按键事件
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    )
      return;

    // Alt + 左箭头 = 上一集
    if (e.altKey && e.key === 'ArrowLeft') {
      if (detailRef.current && currentEpisodeIndexRef.current > 0) {
        handlePreviousEpisode();
        e.preventDefault();
      }
    }

    // Alt + 右箭头 = 下一集
    if (e.altKey && e.key === 'ArrowRight') {
      const d = detailRef.current;
      const idx = currentEpisodeIndexRef.current;
      if (d && idx < d.episodes.length - 1) {
        handleNextEpisode();
        e.preventDefault();
      }
    }

    // 左箭头 = 快退
    if (!e.altKey && e.key === 'ArrowLeft') {
      if (artPlayerRef.current && artPlayerRef.current.currentTime > 5) {
        artPlayerRef.current.currentTime -= 10;
        e.preventDefault();
      }
    }

    // 右箭头 = 快进
    if (!e.altKey && e.key === 'ArrowRight') {
      if (
        artPlayerRef.current &&
        artPlayerRef.current.currentTime < artPlayerRef.current.duration - 5
      ) {
        artPlayerRef.current.currentTime += 10;
        e.preventDefault();
      }
    }

    // 上箭头 = 音量+
    if (e.key === 'ArrowUp') {
      if (artPlayerRef.current && artPlayerRef.current.volume < 1) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume + 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 下箭头 = 音量-
    if (e.key === 'ArrowDown') {
      if (artPlayerRef.current && artPlayerRef.current.volume > 0) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume - 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 空格 = 播放/暂停
    if (e.key === ' ') {
      if (artPlayerRef.current) {
        artPlayerRef.current.toggle();
        e.preventDefault();
      }
    }

    // f 键 = 切换全屏
    if (e.key === 'f' || e.key === 'F') {
      if (artPlayerRef.current) {
        if (
          tryEnterIOSNativeFullscreen(
            artPlayerRef.current.video as HTMLVideoElement
          )
        ) {
          e.preventDefault();
          return;
        }
        artPlayerRef.current.fullscreen = !artPlayerRef.current.fullscreen;
        e.preventDefault();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 播放记录相关
  // ---------------------------------------------------------------------------
  // 保存播放进度
  const saveCurrentPlayProgress = async () => {
    if (
      !artPlayerRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current ||
      !videoTitleRef.current ||
      !detailRef.current?.source_name
    ) {
      return;
    }

    const player = artPlayerRef.current;
    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    // 如果播放时间太短（少于5秒）或者视频时长无效，不保存
    if (currentTime < 1 || !duration) {
      return;
    }

    try {
      const recordTitle =
        (tmdbModeRef.current ? tmdbDetail?.title : '') ||
        videoTitleRef.current ||
        detailRef.current.title;
      const recordSource = currentSourceRef.current;
      const recordId = currentIdRef.current;
      const recordIndex = currentEpisodeIndexRef.current + 1;
      await savePlayRecord(recordSource, recordId, {
        title: recordTitle,
        source_name: detailRef.current?.source_name || '',
        year: detailRef.current?.year,
        cover: detailRef.current?.poster || '',
        index: recordIndex,
        total_episodes: detailRef.current?.episodes.length || 1,
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
        search_title: recordTitle,
      });

      lastSaveTimeRef.current = Date.now();
      console.log('播放进度已保存:', {
        title: videoTitleRef.current,
        episode: currentEpisodeIndexRef.current + 1,
        year: detailRef.current?.year,
        progress: `${Math.floor(currentTime)}/${Math.floor(duration)}`,
      });
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  };

  useEffect(() => {
    // 页面即将卸载时保存播放进度
    const handleBeforeUnload = () => {
      saveCurrentPlayProgress();
    };

    // 页面可见性变化时保存播放进度
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentPlayProgress();
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
  }, [currentEpisodeIndex, detail, artPlayerRef.current]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

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

  const matchDanmakuEpisode = useCallback(
    (
      episodeIndex: number,
      episodes: DanmakuEpisode[]
    ): DanmakuEpisode | null => {
      if (!episodes.length) return null;
      const index = Math.min(Math.max(episodeIndex, 0), episodes.length - 1);
      return episodes[index];
    },
    []
  );

  const loadEpisodesForDanmakuAnime = useCallback(
    async (
      anime: DanmakuAnime
    ): Promise<{
      episodes: DanmakuEpisode[];
      animeTitle: string;
      errorMessage: string;
    }> => {
      const idCandidates = Array.from(
        new Set(
          [anime.animeId, anime.bangumiId]
            .map((value) =>
              value === undefined || value === null ? '' : String(value).trim()
            )
            .filter(Boolean)
        )
      );

      let lastErrorMessage = '';
      for (const idText of idCandidates) {
        const numericId = Number(idText);
        const requestId = Number.isNaN(numericId) ? idText : numericId;
        const response = await getDanmakuEpisodes(requestId);
        if (response.success && response.bangumi.episodes.length > 0) {
          return {
            episodes: response.bangumi.episodes,
            animeTitle: response.bangumi.animeTitle || anime.animeTitle,
            errorMessage: '',
          };
        }

        if (response.errorMessage) {
          lastErrorMessage = response.errorMessage;
        }
      }

      return {
        episodes: [],
        animeTitle: anime.animeTitle,
        errorMessage:
          lastErrorMessage || 'This danmaku source has no episode data',
      };
    },
    []
  );

  const normalizeDanmakuData = useCallback((input: Array<any>) => {
    const rawCount = input.length;
    const filtered = input.filter(
      (item) => !isDanmakuBlocked(item.text, danmakuFilterConfigRef.current)
    );

    let processed = filtered;
    const maxCount =
      typeof window !== 'undefined'
        ? Number.parseInt(localStorage.getItem('danmakuMaxCount') || '0', 10)
        : 0;

    if (maxCount > 0 && processed.length > maxCount) {
      const sampled: typeof processed = [];
      const step = processed.length / maxCount;
      for (let i = 0; i < maxCount; i += 1) {
        sampled.push(processed[Math.floor(i * step)]);
      }
      processed = sampled;
    }

    const originalCount = processed.length === rawCount ? 0 : rawCount;
    return {
      processed,
      originalCount,
    };
  }, []);

  const applyDanmakuToPlayer = useCallback((danmakuData: Array<any>) => {
    if (!danmakuPluginRef.current) return;

    danmakuPluginRef.current.reset();
    danmakuPluginRef.current.config({
      danmuku: danmakuData,
      speed: danmakuSettingsRef.current.speed,
      opacity: danmakuSettingsRef.current.opacity,
      fontSize: danmakuSettingsRef.current.fontSize,
      margin: [
        danmakuSettingsRef.current.marginTop,
        danmakuSettingsRef.current.marginBottom,
      ],
    });
    danmakuPluginRef.current.load();

    const savedDisplayState = loadDanmakuDisplayState();
    const shouldShow = savedDisplayState === null ? true : savedDisplayState;
    danmakuDisplayStateRef.current = shouldShow;
    if (shouldShow) {
      danmakuPluginRef.current.show();
    } else {
      danmakuPluginRef.current.hide();
    }
  }, []);

  const handleDanmakuSelect = useCallback(
    async (selection: DanmakuSelection, isManual = false) => {
      if (!danmakuPluginRef.current) {
        return;
      }

      const title = (videoTitleRef.current || '').trim();
      const episodeIndex = currentEpisodeIndexRef.current;

      if (isManual && title && episodeIndex >= 0) {
        saveManualDanmakuSelection(title, episodeIndex, selection.episodeId);
        saveDanmakuAnimeId(title, selection.animeId);
        if (selection.searchKeyword) {
          saveDanmakuSearchKeyword(title, selection.searchKeyword);
        }
      }

      if (loadingDanmakuEpisodeIdRef.current === selection.episodeId) {
        return;
      }

      loadingDanmakuEpisodeIdRef.current = selection.episodeId;
      setDanmakuLoading(true);

      try {
        const comments = await getDanmakuById(
          selection.episodeId,
          title,
          episodeIndex,
          {
            animeId: selection.animeId,
            animeTitle: selection.animeTitle,
            episodeTitle: selection.episodeTitle,
            searchKeyword: selection.searchKeyword,
          }
        );

        const formatted = convertDanmakuFormat(comments);
        const { processed, originalCount } = normalizeDanmakuData(formatted);

        applyDanmakuToPlayer(processed);

        setCurrentDanmakuSelection({
          ...selection,
          danmakuCount: processed.length,
          danmakuOriginalCount: originalCount > 0 ? originalCount : undefined,
        });
      } catch (error) {
        console.error('Load danmaku failed:', error);
      } finally {
        setDanmakuLoading(false);
        loadingDanmakuEpisodeIdRef.current = null;
      }
    },
    [applyDanmakuToPlayer, normalizeDanmakuData]
  );

  const handleDanmakuSourceSelect = useCallback(
    async (
      anime: DanmakuAnime,
      selectedIndex?: number,
      searchKeyword?: string,
      isManualSearch = false
    ) => {
      const title = (videoTitleRef.current || '').trim();

      if (title && typeof selectedIndex === 'number') {
        saveDanmakuSourceIndex(title, selectedIndex);
      }

      try {
        const loaded = await loadEpisodesForDanmakuAnime(anime);
        if (loaded.episodes.length === 0) {
          console.error(
            'Select danmaku source has no episodes:',
            loaded.errorMessage
          );
          return;
        }

        const episode = matchDanmakuEpisode(
          currentEpisodeIndexRef.current,
          loaded.episodes
        );
        if (!episode) return;

        await handleDanmakuSelect(
          {
            animeId: anime.animeId,
            episodeId: episode.episodeId,
            animeTitle: loaded.animeTitle,
            episodeTitle: episode.episodeTitle,
            searchKeyword,
          },
          isManualSearch
        );
      } catch (error) {
        console.error('Select danmaku source failed:', error);
      }
    },
    [handleDanmakuSelect, loadEpisodesForDanmakuAnime, matchDanmakuEpisode]
  );

  const autoLoadDanmakuForCurrentEpisode = useCallback(async () => {
    if (!danmakuPluginRef.current) return;

    const title = (videoTitleRef.current || '').trim();
    if (!title) return;

    if (typeof window !== 'undefined') {
      const disableAutoLoad =
        localStorage.getItem('disableAutoLoadDanmaku') === 'true';
      if (disableAutoLoad) return;
    }

    const episodeIndex = currentEpisodeIndexRef.current;
    if (episodeIndex < 0) return;

    const loadKey = `${currentSourceRef.current}|${currentIdRef.current}|${title}|${episodeIndex}`;
    if (lastDanmakuAutoLoadKeyRef.current === loadKey) return;
    lastDanmakuAutoLoadKeyRef.current = loadKey;

    const manualEpisodeId = getManualDanmakuSelection(title, episodeIndex);
    if (manualEpisodeId) {
      await handleDanmakuSelect(
        {
          animeId: currentDanmakuSelection?.animeId || 0,
          episodeId: manualEpisodeId,
          animeTitle: currentDanmakuSelection?.animeTitle || '手动选择',
          episodeTitle: `第 ${episodeIndex + 1} 集`,
          searchKeyword: currentDanmakuSelection?.searchKeyword,
        },
        false
      );
      return;
    }

    const rememberedAnimeId = getDanmakuAnimeId(title);
    if (rememberedAnimeId) {
      try {
        const episodesResponse = await getDanmakuEpisodes(rememberedAnimeId);
        if (
          episodesResponse.success &&
          episodesResponse.bangumi.episodes.length > 0
        ) {
          const episode = matchDanmakuEpisode(
            episodeIndex,
            episodesResponse.bangumi.episodes
          );
          if (episode) {
            await handleDanmakuSelect(
              {
                animeId: rememberedAnimeId,
                episodeId: episode.episodeId,
                animeTitle: episodesResponse.bangumi.animeTitle,
                episodeTitle: episode.episodeTitle,
                searchKeyword: getDanmakuSearchKeyword(title) || undefined,
              },
              false
            );
            return;
          }
        }
      } catch (error) {
        console.error('Load remembered danmaku failed:', error);
      }
    }

    const searchKeyword =
      getDanmakuSearchKeyword(title) || searchTitle || title;
    const searchResponse = await searchDanmakuAnime(searchKeyword);
    if (!searchResponse.success || searchResponse.animes.length === 0) {
      return;
    }

    const rememberedSourceIndex = getDanmakuSourceIndex(title);
    if (
      rememberedSourceIndex !== null &&
      searchResponse.animes[rememberedSourceIndex]
    ) {
      await handleDanmakuSourceSelect(
        searchResponse.animes[rememberedSourceIndex],
        rememberedSourceIndex,
        searchKeyword,
        false
      );
      return;
    }

    await handleDanmakuSourceSelect(
      searchResponse.animes[0],
      0,
      searchKeyword,
      false
    );
  }, [
    currentDanmakuSelection?.animeId,
    currentDanmakuSelection?.animeTitle,
    currentDanmakuSelection?.searchKeyword,
    handleDanmakuSelect,
    handleDanmakuSourceSelect,
    matchDanmakuEpisode,
    searchTitle,
  ]);

  const handleUploadDanmaku = useCallback(
    async (comments: DanmakuComment[]) => {
      if (!danmakuPluginRef.current) return;

      const title = (videoTitleRef.current || '').trim();
      const episodeIndex = currentEpisodeIndexRef.current;

      setDanmakuLoading(true);
      try {
        if (title && episodeIndex >= 0) {
          await saveDanmakuToCache(title, episodeIndex, comments, {
            animeId: currentDanmakuSelection?.animeId,
            episodeId: currentDanmakuSelection?.episodeId,
            animeTitle: currentDanmakuSelection?.animeTitle,
            episodeTitle: currentDanmakuSelection?.episodeTitle,
            searchKeyword: currentDanmakuSelection?.searchKeyword,
          });
        }

        const formatted = convertDanmakuFormat(comments);
        const { processed, originalCount } = normalizeDanmakuData(formatted);
        applyDanmakuToPlayer(processed);

        setCurrentDanmakuSelection((prev) =>
          prev
            ? {
                ...prev,
                danmakuCount: processed.length,
                danmakuOriginalCount:
                  originalCount > 0 ? originalCount : undefined,
              }
            : prev
        );
      } catch (error) {
        console.error('Upload danmaku failed:', error);
      } finally {
        setDanmakuLoading(false);
      }
    },
    [applyDanmakuToPlayer, currentDanmakuSelection, normalizeDanmakuData]
  );

  useEffect(() => {
    if (
      !Artplayer ||
      !Hls ||
      !videoUrl ||
      loading ||
      currentEpisodeIndex === null ||
      !artRef.current
    ) {
      return;
    }

    // 确保选集索引有效
    if (
      !detail ||
      !detail.episodes ||
      currentEpisodeIndex >= detail.episodes.length ||
      currentEpisodeIndex < 0
    ) {
      setError(`选集索引无效，当前共 ${totalEpisodes} 集`);
      return;
    }

    if (!videoUrl) {
      setError('视频地址无效');
      return;
    }
    console.log(videoUrl);

    // 检测是否为WebKit浏览器
    const isWebkit =
      typeof window !== 'undefined' &&
      typeof (window as any).webkitConvertPointFromNodeToPage === 'function';

    // 非WebKit浏览器且播放器已存在，使用switch方法切换
    if (!isWebkit && artPlayerRef.current) {
      if (anime4kEnabledRef.current) {
        pendingAnime4KInitRef.current = true;
        void cleanupAnime4K();
      }
      artPlayerRef.current.switch = videoUrl;
      artPlayerRef.current.title = `${videoTitle} - 第${
        currentEpisodeIndex + 1
      }集`;
      artPlayerRef.current.poster = videoCover;
      if (danmakuPluginRef.current) {
        danmakuPluginRef.current.reset();
      }
      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          videoUrl
        );
      }
      lastDanmakuAutoLoadKeyRef.current = '';
      setTimeout(() => {
        autoLoadDanmakuForCurrentEpisode();
      }, 50);
      return;
    }

    // WebKit浏览器或首次创建：销毁之前的播放器实例并创建新的
    if (artPlayerRef.current) {
      if (anime4kEnabledRef.current) {
        pendingAnime4KInitRef.current = true;
        void cleanupAnime4K();
      }
      (artPlayerRef.current as any)?.__cleanupFullscreenOrientation?.();
      if (artPlayerRef.current.video && artPlayerRef.current.video.hls) {
        artPlayerRef.current.video.hls.destroy();
      }
      // 销毁播放器实例
      artPlayerRef.current.destroy();
      artPlayerRef.current = null;
      danmakuPluginRef.current = null;
    }

    try {
      // 创建新的播放器实例
      if (anime4kEnabledRef.current) {
        pendingAnime4KInitRef.current = true;
      }
      Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
      Artplayer.USE_RAF = true;
      // Render web-fullscreen player under <body> to avoid being clipped/covered by page stacking contexts.
      Artplayer.FULLSCREEN_WEB_IN_BODY = true;

      artPlayerRef.current = new Artplayer({
        container: artRef.current,
        url: videoUrl,
        poster: videoCover,
        volume: 0.7,
        isLive: false,
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: false,
        autoMini: false,
        screenshot: false,
        setting: true,
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: false,
        miniProgressBar: false,
        mutex: true,
        playsInline: true,
        autoPlayback: false,
        airplay: false,
        theme: '#557efc',
        lang: 'zh-cn',
        hotkey: false,
        // Use custom long-press boost logic below (2x on hold, restore on release).
        fastForward: false,
        autoOrientation: true,
        lock: true,
        moreVideoAttr: {
          crossOrigin: 'anonymous',
        },
        // HLS 支持配置
        customType: {
          m3u8: function (video: HTMLVideoElement, url: string) {
            if (!Hls) {
              console.error('HLS.js 未加载');
              return;
            }

            if (video.hls) {
              video.hls.destroy();
            }
            const hls = new Hls({
              debug: false, // 关闭日志
              enableWorker: true, // WebWorker 解码，降低主线程压力
              lowLatencyMode: true, // 开启低延迟 LL-HLS

              /* 缓冲/内存相关 */
              maxBufferLength: 30, // 前向缓冲最大 30s，过大容易导致高延迟
              backBufferLength: 30, // 仅保留 30s 已播放内容，避免内存占用
              maxBufferSize: 60 * 1000 * 1000, // 约 60MB，超出后触发清理

              /* 自定义loader */
              loader: blockAdEnabledRef.current
                ? CustomHlsJsLoader
                : Hls.DefaultConfig.loader,
            });

            hls.loadSource(url);
            hls.attachMedia(video);
            video.hls = hls;

            ensureVideoSource(video, url);

            hls.on(Hls.Events.ERROR, function (event: any, data: any) {
              console.error('HLS Error:', event, data);
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log('网络错误，尝试恢复...');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log('媒体错误，尝试恢复...');
                    hls.recoverMediaError();
                    break;
                  default:
                    console.log('无法恢复的错误');
                    hls.destroy();
                    break;
                }
              }
            });
          },
        },
        icons: {
          loading:
            '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDUwIDUwIj48cGF0aCBkPSJNMjUuMjUxIDYuNDYxYy0xMC4zMTggMC0xOC42ODMgOC4zNjUtMTguNjgzIDE4LjY4M2g0LjA2OGMwLTguMDcgNi41NDUtMTQuNjE1IDE0LjYxNS0xNC42MTVWNi40NjF6IiBmaWxsPSIjMDA5Njg4Ij48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iIGF0dHJpYnV0ZVR5cGU9IlhNTCIgZHVyPSIxcyIgZnJvbT0iMCAyNSAyNSIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiIHRvPSIzNjAgMjUgMjUiIHR5cGU9InJvdGF0ZSIvPjwvcGF0aD48L3N2Zz4=">',
        },
        plugins: [
          artplayerPluginDanmuku({
            danmuku: [],
            speed: danmakuSettingsRef.current.speed,
            opacity: danmakuSettingsRef.current.opacity,
            fontSize: danmakuSettingsRef.current.fontSize,
            color: '#FFFFFF',
            mode: 0,
            margin: [
              danmakuSettingsRef.current.marginTop,
              danmakuSettingsRef.current.marginBottom,
            ],
            antiOverlap: true,
            synchronousPlayback: danmakuSettingsRef.current.synchronousPlayback,
            emitter: false,
            visible: danmakuDisplayStateRef.current,
            filter: (danmu: any) =>
              !isDanmakuBlocked(
                danmu.text || '',
                danmakuFilterConfigRef.current
              ),
          }),
        ],
        settings: [
          {
            html: '去广告',
            icon: '<text x="50%" y="50%" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">AD</text>',
            tooltip: blockAdEnabled ? '已开启' : '已关闭',
            onClick() {
              const newVal = !blockAdEnabled;
              try {
                localStorage.setItem('enable_blockad', String(newVal));
                if (artPlayerRef.current) {
                  if (anime4kEnabledRef.current) {
                    pendingAnime4KInitRef.current = true;
                    void cleanupAnime4K();
                  }
                  (artPlayerRef.current as any)?.__cleanupFullscreenOrientation?.();
                  resumeTimeRef.current = artPlayerRef.current.currentTime;
                  if (
                    artPlayerRef.current.video &&
                    artPlayerRef.current.video.hls
                  ) {
                    artPlayerRef.current.video.hls.destroy();
                  }
                  artPlayerRef.current.destroy();
                  artPlayerRef.current = null;
                }
                setBlockAdEnabled(newVal);
              } catch (_) {
                // ignore
              }
              return newVal ? '当前开启' : '当前关闭';
            },
          },
          ...(webGPUSupported
            ? [
                {
                  name: 'Anime4K超分',
                  html: 'Anime4K超分',
                  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 18c-4 0-7-3-7-7V9l7-3.5L19 9v4c0 4-3 7-7 7z" fill="#ffffff"/><path d="M10 12l2 2 4-4" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                  switch: anime4kEnabledRef.current,
                  onSwitch: async function (item: any) {
                    const newVal = !item.switch;
                    await toggleAnime4K(newVal);
                    return newVal;
                  },
                },
                {
                  name: '超分模式',
                  html: '超分模式',
                  selector: [
                    {
                      html: 'ModeA (快速)',
                      value: 'ModeA',
                      default: anime4kModeRef.current === 'ModeA',
                    },
                    {
                      html: 'ModeB (平衡)',
                      value: 'ModeB',
                      default: anime4kModeRef.current === 'ModeB',
                    },
                    {
                      html: 'ModeC (质量)',
                      value: 'ModeC',
                      default: anime4kModeRef.current === 'ModeC',
                    },
                    {
                      html: 'ModeAA (增强快速)',
                      value: 'ModeAA',
                      default: anime4kModeRef.current === 'ModeAA',
                    },
                    {
                      html: 'ModeBB (增强平衡)',
                      value: 'ModeBB',
                      default: anime4kModeRef.current === 'ModeBB',
                    },
                    {
                      html: 'ModeCA (最高质量)',
                      value: 'ModeCA',
                      default: anime4kModeRef.current === 'ModeCA',
                    },
                  ],
                  onSelect: async function (item: any) {
                    await changeAnime4KMode(item.value);
                    return item.html;
                  },
                },
                {
                  name: '超分倍数',
                  html: '超分倍数',
                  selector: [
                    {
                      html: '1.5x',
                      value: '1.5',
                      default: anime4kScaleRef.current === 1.5,
                    },
                    {
                      html: '2.0x',
                      value: '2.0',
                      default: anime4kScaleRef.current === 2.0,
                    },
                    {
                      html: '3.0x',
                      value: '3.0',
                      default: anime4kScaleRef.current === 3.0,
                    },
                    {
                      html: '4.0x',
                      value: '4.0',
                      default: anime4kScaleRef.current === 4.0,
                    },
                  ],
                  onSelect: async function (item: any) {
                    await changeAnime4KScale(parseFloat(item.value));
                    return item.html;
                  },
                },
              ]
            : []),
          {
            name: '跳过片头片尾',
            html: '跳过片头片尾',
            switch: skipConfigRef.current.enable,
            onSwitch: function (item) {
              const newConfig = {
                ...skipConfigRef.current,
                enable: !item.switch,
              };
              handleSkipConfigChange(newConfig);
              return !item.switch;
            },
          },
          {
            html: '删除跳过配置',
            onClick: function () {
              handleSkipConfigChange({
                enable: false,
                intro_time: 0,
                outro_time: 0,
              });
              return '';
            },
          },
          {
            name: '设置片头',
            html: '设置片头',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
            tooltip:
              skipConfigRef.current.intro_time === 0
                ? '设置片头时间'
                : `${formatTime(skipConfigRef.current.intro_time)}`,
            onClick: function () {
              const currentTime = artPlayerRef.current?.currentTime || 0;
              if (currentTime > 0) {
                const newConfig = {
                  ...skipConfigRef.current,
                  intro_time: currentTime,
                };
                handleSkipConfigChange(newConfig);
                return `${formatTime(currentTime)}`;
              }
            },
          },
          {
            name: '设置片尾',
            html: '设置片尾',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
            tooltip:
              skipConfigRef.current.outro_time >= 0
                ? '设置片尾时间'
                : `-${formatTime(-skipConfigRef.current.outro_time)}`,
            onClick: function () {
              const outroTime =
                -(
                  artPlayerRef.current?.duration -
                  artPlayerRef.current?.currentTime
                ) || 0;
              if (outroTime < 0) {
                const newConfig = {
                  ...skipConfigRef.current,
                  outro_time: outroTime,
                };
                handleSkipConfigChange(newConfig);
                return `-${formatTime(-outroTime)}`;
              }
            },
          },
          {
            name: '弹幕屏蔽',
            html: '弹幕屏蔽',
            tooltip: `规则数: ${danmakuFilterConfigRef.current.rules.length}`,
            onClick: function () {
              setShowDanmakuFilterSettings(true);
              return '';
            },
          },
        ],
        // 控制栏配置
        controls: [
          {
            position: 'right',
            index: 12,
            html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.92-11-11-11zm18-7H5c-1.1 0-2 .9-2 2v3h2V5h16v14h-3v2h3c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg></i>',
            tooltip: '投屏',
            click: function () {
              void handleCastClick();
            },
          },
          {
            position: 'left',
            index: 13,
            html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>',
            tooltip: 'Play next episode',
            click: function () {
              handleNextEpisode();
            },
          },
        ],
      });

      const playerInstance = artPlayerRef.current;
      const setupTouchLongPressPlayback = () => {
        const hostElement =
          (playerInstance.template?.$player as HTMLElement | undefined) ||
          artRef.current;
        if (!hostElement) {
          return () => undefined;
        }

        const LONG_PRESS_MS = 320;
        const MOVE_TOLERANCE = 18;
        let pressTimer: number | null = null;
        let pressing = false;
        let boosted = false;
        let activePointerId: number | null = null;
        let activeTouchId: number | null = null;
        let startX = 0;
        let startY = 0;
        let previousRate = 1;

        const shouldIgnoreTarget = (target: EventTarget | null) => {
          if (!(target instanceof HTMLElement)) {
            return false;
          }
          return Boolean(
            target.closest(
              '.art-controls, .art-setting, .art-contextmenus, .art-layer-notice, .art-selector-list, .art-volume'
            )
          );
        };

        const clearPressTimer = () => {
          if (pressTimer !== null) {
            window.clearTimeout(pressTimer);
            pressTimer = null;
          }
        };

        const startBoost = () => {
          const currentPlayer = artPlayerRef.current;
          if (!currentPlayer || boosted) return;
          previousRate = currentPlayer.playbackRate || 1;
          currentPlayer.playbackRate = 2;
          currentPlayer.notice.show = '长按倍速 2.0x';
          boosted = true;
        };

        const stopBoost = () => {
          const currentPlayer = artPlayerRef.current;
          if (!boosted || !currentPlayer) {
            boosted = false;
            return;
          }
          currentPlayer.playbackRate = previousRate;
          currentPlayer.notice.show = '';
          boosted = false;
        };

        const scheduleLongPress = () => {
          clearPressTimer();
          pressTimer = window.setTimeout(() => {
            pressTimer = null;
            if (!pressing) return;
            startBoost();
          }, LONG_PRESS_MS);
        };

        const exceedsTolerance = (x: number, y: number) => {
          return (
            Math.abs(x - startX) > MOVE_TOLERANCE ||
            Math.abs(y - startY) > MOVE_TOLERANCE
          );
        };

        const endPress = () => {
          clearPressTimer();
          pressing = false;
          activePointerId = null;
          activeTouchId = null;
          stopBoost();
        };

        const onPointerDown = (event: PointerEvent) => {
          if (event.pointerType !== 'touch') return;
          if (shouldIgnoreTarget(event.target)) return;
          pressing = true;
          activePointerId = event.pointerId;
          startX = event.clientX;
          startY = event.clientY;
          scheduleLongPress();
        };

        const onPointerMove = (event: PointerEvent) => {
          if (!pressing || activePointerId !== event.pointerId) return;
          if (exceedsTolerance(event.clientX, event.clientY)) {
            endPress();
          }
        };

        const onPointerUp = (event: PointerEvent) => {
          if (activePointerId !== event.pointerId) return;
          endPress();
        };

        const onPointerCancel = (event: PointerEvent) => {
          if (activePointerId !== event.pointerId) return;
          endPress();
        };

        const onTouchStart = (event: TouchEvent) => {
          if (event.changedTouches.length === 0) return;
          if (shouldIgnoreTarget(event.target)) return;
          const touch = event.changedTouches[0];
          pressing = true;
          activeTouchId = touch.identifier;
          startX = touch.clientX;
          startY = touch.clientY;
          scheduleLongPress();
        };

        const onTouchMove = (event: TouchEvent) => {
          if (!pressing || activeTouchId === null) return;
          const touch = Array.from(event.changedTouches).find(
            (item) => item.identifier === activeTouchId
          );
          if (!touch) return;
          if (exceedsTolerance(touch.clientX, touch.clientY)) {
            endPress();
          }
        };

        const onTouchEnd = (event: TouchEvent) => {
          if (activeTouchId === null) return;
          const touch = Array.from(event.changedTouches).find(
            (item) => item.identifier === activeTouchId
          );
          if (!touch) return;
          endPress();
        };

        const supportsPointer =
          typeof window !== 'undefined' && 'PointerEvent' in window;

        if (supportsPointer) {
          hostElement.addEventListener('pointerdown', onPointerDown, {
            passive: true,
          });
          hostElement.addEventListener('pointermove', onPointerMove, {
            passive: true,
          });
          hostElement.addEventListener('pointerup', onPointerUp, {
            passive: true,
          });
          hostElement.addEventListener('pointercancel', onPointerCancel, {
            passive: true,
          });
        } else {
          hostElement.addEventListener('touchstart', onTouchStart, {
            passive: true,
          });
          hostElement.addEventListener('touchmove', onTouchMove, {
            passive: true,
          });
          hostElement.addEventListener('touchend', onTouchEnd, {
            passive: true,
          });
          hostElement.addEventListener('touchcancel', onTouchEnd, {
            passive: true,
          });
        }

        return () => {
          if (supportsPointer) {
            hostElement.removeEventListener('pointerdown', onPointerDown);
            hostElement.removeEventListener('pointermove', onPointerMove);
            hostElement.removeEventListener('pointerup', onPointerUp);
            hostElement.removeEventListener('pointercancel', onPointerCancel);
          } else {
            hostElement.removeEventListener('touchstart', onTouchStart);
            hostElement.removeEventListener('touchmove', onTouchMove);
            hostElement.removeEventListener('touchend', onTouchEnd);
            hostElement.removeEventListener('touchcancel', onTouchEnd);
          }
          endPress();
        };
      };
      const cleanupTouchLongPress = setupTouchLongPressPlayback();

      const syncOrientationWithFullscreen = async () => {
        if (!playerInstance) return;
        const videoElement = playerInstance.video as any;
        const isNativeFullscreen = Boolean(document.fullscreenElement);
        const isPlayerFullscreen = Boolean(playerInstance.fullscreen);
        const isWebFullscreen = Boolean(playerInstance.fullscreenWeb);
        const isWebkitVideoFullscreen = Boolean(
          videoElement?.webkitDisplayingFullscreen
        );
        const enteringFullscreen =
          isNativeFullscreen ||
          isPlayerFullscreen ||
          isWebFullscreen ||
          isWebkitVideoFullscreen;

        if (enteringFullscreen) {
          const enteredNativeIOSFullscreen = tryEnterIOSNativeFullscreen(
            videoElement as HTMLVideoElement
          );
          if (!enteredNativeIOSFullscreen) {
            await tryLockLandscape();
          }
        } else {
          await tryUnlockOrientation();
        }
      };

      const handleFullscreenStateChange = () => {
        void syncOrientationWithFullscreen();
      };
      const handleDocumentFullscreenChange = () => {
        void syncOrientationWithFullscreen();
      };
      const handleWebkitBeginFullscreen = () => {
        void syncOrientationWithFullscreen();
      };
      const handleWebkitEndFullscreen = () => {
        void syncOrientationWithFullscreen();
      };

      playerInstance.on('fullscreen', handleFullscreenStateChange);
      playerInstance.on('fullscreenWeb', handleFullscreenStateChange);
      document.addEventListener('fullscreenchange', handleDocumentFullscreenChange);
      if ((playerInstance.video as any)?.addEventListener) {
        (playerInstance.video as any).addEventListener(
          'webkitbeginfullscreen',
          handleWebkitBeginFullscreen
        );
        (playerInstance.video as any).addEventListener(
          'webkitendfullscreen',
          handleWebkitEndFullscreen
        );
      }

      let orientationCleanupDone = false;
      (playerInstance as any).__cleanupFullscreenOrientation = () => {
        if (orientationCleanupDone) return;
        orientationCleanupDone = true;
        cleanupTouchLongPress();
        playerInstance.off('fullscreen', handleFullscreenStateChange);
        playerInstance.off('fullscreenWeb', handleFullscreenStateChange);
        document.removeEventListener(
          'fullscreenchange',
          handleDocumentFullscreenChange
        );
        if ((playerInstance.video as any)?.removeEventListener) {
          (playerInstance.video as any).removeEventListener(
            'webkitbeginfullscreen',
            handleWebkitBeginFullscreen
          );
          (playerInstance.video as any).removeEventListener(
            'webkitendfullscreen',
            handleWebkitEndFullscreen
          );
        }
        void tryUnlockOrientation();
      };

      if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
        danmakuPluginRef.current =
          artPlayerRef.current.plugins.artplayerPluginDanmuku;

        artPlayerRef.current.on('artplayerPluginDanmuku:config', () => {
          if (!danmakuPluginRef.current?.option) return;

          const option = danmakuPluginRef.current.option;
          const nextSettings: DanmakuSettings = {
            ...danmakuSettingsRef.current,
            opacity: option.opacity ?? danmakuSettingsRef.current.opacity,
            fontSize: option.fontSize ?? danmakuSettingsRef.current.fontSize,
            speed: option.speed ?? danmakuSettingsRef.current.speed,
            marginTop:
              option.margin?.[0] ?? danmakuSettingsRef.current.marginTop,
            marginBottom:
              option.margin?.[1] ?? danmakuSettingsRef.current.marginBottom,
          };

          setDanmakuSettings(nextSettings);
        });

        artPlayerRef.current.on('artplayerPluginDanmuku:show', () => {
          danmakuDisplayStateRef.current = true;
          saveDanmakuDisplayState(true);
        });

        artPlayerRef.current.on('artplayerPluginDanmuku:hide', () => {
          danmakuDisplayStateRef.current = false;
          saveDanmakuDisplayState(false);
        });
      }

      // 监听播放器事件
      artPlayerRef.current.on('ready', () => {
        setError(null);
        setTimeout(() => {
          autoLoadDanmakuForCurrentEpisode();
        }, 100);
      });

      artPlayerRef.current.on('video:volumechange', () => {
        lastVolumeRef.current = artPlayerRef.current.volume;
      });
      artPlayerRef.current.on('video:ratechange', () => {
        lastPlaybackRateRef.current = artPlayerRef.current.playbackRate;
      });

      // 监听视频可播放事件，这时恢复播放进度更可靠
      artPlayerRef.current.on('video:canplay', () => {
        // 若存在需要恢复的播放进度，则跳转
        if (resumeTimeRef.current && resumeTimeRef.current > 0) {
          try {
            const duration = artPlayerRef.current.duration || 0;
            let target = resumeTimeRef.current;
            if (duration && target >= duration - 2) {
              target = Math.max(0, duration - 5);
            }
            artPlayerRef.current.currentTime = target;
            console.log('成功恢复播放进度到:', resumeTimeRef.current);
          } catch (err) {
            console.warn('恢复播放进度失败:', err);
          }
        }
        resumeTimeRef.current = null;

        setTimeout(() => {
          if (
            Math.abs(artPlayerRef.current.volume - lastVolumeRef.current) > 0.01
          ) {
            artPlayerRef.current.volume = lastVolumeRef.current;
          }
          if (
            Math.abs(
              artPlayerRef.current.playbackRate - lastPlaybackRateRef.current
            ) > 0.01 &&
            isWebkit
          ) {
            artPlayerRef.current.playbackRate = lastPlaybackRateRef.current;
          }
          artPlayerRef.current.notice.show = '';
        }, 0);

        // 隐藏换源加载状态
        setIsVideoLoading(false);

        if (anime4kEnabledRef.current && pendingAnime4KInitRef.current) {
          pendingAnime4KInitRef.current = false;
          void initAnime4K();
        }
      });

      // 监听视频时间更新事件，实现跳过片头片尾
      artPlayerRef.current.on('video:timeupdate', () => {
        if (!skipConfigRef.current.enable) return;

        const currentTime = artPlayerRef.current.currentTime || 0;
        const duration = artPlayerRef.current.duration || 0;
        const now = Date.now();

        // 限制跳过检查频率为1.5秒一次
        if (now - lastSkipCheckRef.current < 1500) return;
        lastSkipCheckRef.current = now;

        // 跳过片头
        if (
          skipConfigRef.current.intro_time > 0 &&
          currentTime < skipConfigRef.current.intro_time
        ) {
          artPlayerRef.current.currentTime = skipConfigRef.current.intro_time;
          artPlayerRef.current.notice.show = `已跳过片头 (${formatTime(
            skipConfigRef.current.intro_time
          )})`;
        }

        // 跳过片尾
        if (
          skipConfigRef.current.outro_time < 0 &&
          duration > 0 &&
          currentTime >
            artPlayerRef.current.duration + skipConfigRef.current.outro_time
        ) {
          if (
            currentEpisodeIndexRef.current <
            (detailRef.current?.episodes?.length || 1) - 1
          ) {
            handleNextEpisode();
          } else {
            artPlayerRef.current.pause();
          }
          artPlayerRef.current.notice.show = `已跳过片尾 (${formatTime(
            skipConfigRef.current.outro_time
          )})`;
        }
      });

      artPlayerRef.current.on('error', (err: any) => {
        console.error('播放器错误:', err);
        if (artPlayerRef.current.currentTime > 0) {
          return;
        }
      });

      // 监听视频播放结束事件，自动播放下一集
      artPlayerRef.current.on('video:ended', () => {
        const d = detailRef.current;
        const idx = currentEpisodeIndexRef.current;
        if (d && d.episodes && idx < d.episodes.length - 1) {
          setTimeout(() => {
            setCurrentEpisodeIndex(idx + 1);
          }, 1000);
        }
      });

      artPlayerRef.current.on('video:timeupdate', () => {
        const now = Date.now();
        let interval = 5000;
        if (process.env.NEXT_PUBLIC_STORAGE_TYPE === 'd1') {
          interval = 10000;
        }
        if (process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash') {
          interval = 20000;
        }
        if (now - lastSaveTimeRef.current > interval) {
          saveCurrentPlayProgress();
          lastSaveTimeRef.current = now;
        }
      });

      artPlayerRef.current.on('pause', () => {
        saveCurrentPlayProgress();
      });

      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          videoUrl
        );
      }
      void syncOrientationWithFullscreen();
    } catch (err) {
      console.error('创建播放器失败:', err);
      setError('Failed to initialize player');
    }
  }, [Artplayer, Hls, videoUrl, loading, blockAdEnabled]);

  useEffect(() => {
    if (!danmakuPluginRef.current) return;
    autoLoadDanmakuForCurrentEpisode();
  }, [
    currentEpisodeIndex,
    currentSource,
    currentId,
    videoTitle,
    videoUrl,
    autoLoadDanmakuForCurrentEpisode,
  ]);

  // 当组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      (artPlayerRef.current as any)?.__cleanupFullscreenOrientation?.();
      void tryUnlockOrientation();
      void cleanupAnime4K();
    };
  }, []);

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

    const rect = button.getBoundingClientRect();
    setSeasonMenuRect({
      left: rect.left,
      top: rect.bottom + 8,
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
              No playable source found
            </h1>
            <p className='text-sm leading-6 text-zinc-600 dark:text-zinc-400'>
              {error ||
                'The current source is temporarily unavailable, or no matching title was found. Go back and try a different keyword.'}
            </p>
            <button
              type='button'
              onClick={() => router.back()}
              className='ui-glass-control inline-flex items-center gap-2 px-4 py-2 text-sm font-medium'
            >
              <ArrowLeft className='h-4 w-4' />
              Back
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  const displayTitle =
    tmdbDetail?.title || videoTitle || detail?.title || 'Untitled';
  const displayYear = tmdbDetail?.year || detail?.year || videoYear;
  const displayOverview = tmdbDetail?.overview || detail?.desc || '';
  const displayPoster =
    tmdbDetail?.poster || tmdbDetail?.backdrop || videoCover;
  const displayType =
    tmdbDetail?.mediaType === 'tv'
      ? 'Series'
      : tmdbDetail?.mediaType === 'movie'
      ? 'Movie'
      : detail?.type_name || '';
  const displayGenres = tmdbDetail?.genres || [];
  const displayCast = tmdbDetail?.cast || [];
  const displayCollection = tmdbDetail?.collection;
  const displayRecommendations =
    (tmdbDetail?.recommendations || []).filter(
      (item) =>
        !(
          item.id === tmdbDetail?.id &&
          item.mediaType === tmdbDetail?.mediaType
        )
    ) || [];
  const playBackground = tmdbDetail?.backdrop || tmdbDetail?.poster || '';
  const isTmdbEmbedPlayback = Boolean(playerEmbedUrl && !videoUrl);
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
  const activePlaybackUrl = videoUrl || playerEmbedUrl;
  const canDownloadActiveVideo = Boolean(videoUrl);
  const handleOpenPlaybackUrl = () => {
    if (!activePlaybackUrl) return;
    window.open(activePlaybackUrl, '_blank', 'noopener,noreferrer');
  };
  const handleDownloadPlaybackUrl = () => {
    if (!videoUrl) {
      handleOpenPlaybackUrl();
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = videoUrl;
    anchor.download = `${displayTitle || 'video'}.mp4`;
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };
  const handleCopyPlaybackUrl = async () => {
    if (!activePlaybackUrl) return;
    try {
      await navigator.clipboard.writeText(activePlaybackUrl);
      setPlayerLinkCopied(true);
      window.setTimeout(() => setPlayerLinkCopied(false), 1500);
    } catch {
      handleOpenPlaybackUrl();
    }
  };
  const formatEpisodeMeta = (episode: TmdbEpisodeItem): string => {
    const chunks: string[] = [];
    if (episode.runtime) chunks.push(`${episode.runtime} min`);
    if (episode.airDate) {
      const date = new Date(`${episode.airDate}T00:00:00`);
      chunks.push(
        Number.isNaN(date.getTime())
          ? episode.airDate
          : date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
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
      setRecommendedDetailError('Failed to load details. Please try again later.');
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
      poster: recommendedDetailData?.poster || recommendedDetailData?.backdrop || '',
      score: recommendedDetailData?.score || '',
    });
    window.location.assign(targetUrl);
  };
  const episodePanel =
    tmdbMode && tmdbMediaType === 'tv' ? (
      <div className='pointer-events-none absolute bottom-0 right-0 z-[720] flex flex-col items-end gap-2'>
        <div
          className={`pointer-events-auto w-full max-w-[min(92vw,430px)] origin-bottom-right transition-all duration-200 ease-out sm:w-[430px] ${
            episodePanelOpen
              ? 'translate-y-0 scale-100 opacity-100'
              : 'pointer-events-none translate-y-3 scale-[0.98] opacity-0'
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
                  <span className='truncate text-sm font-semibold text-zinc-100'>
                    Season {currentSeason}
                  </span>
                  <ChevronRight
                    className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
                      seasonMenuOpen ? 'rotate-90' : ''
                    }`}
                  />
                </button>
              </div>
            ) : null}

            <div
              className={`min-h-0 flex-1 space-y-1.5 overflow-y-auto px-0.5 pr-1 scrollbar-hide ${
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
                      className='ui-glass-row group flex w-full items-stretch gap-3 border border-transparent p-2 text-left transition-colors data-[active=true]:bg-[var(--ui-glass-row-active)]'
                      style={{
                        borderRadius: 'var(--ui-radius-row)',
                      }}
                    >
                      <div
                        className='relative min-h-20 w-28 flex-shrink-0 self-stretch overflow-hidden bg-zinc-900 sm:w-32'
                        style={{
                          borderRadius: 'calc(var(--ui-radius-row) - 4px)',
                        }}
                      >
                        {episode.still ? (
                          <img
                            src={processImageUrl(episode.still)}
                            alt={episode.title}
                            className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                          />
                        ) : (
                          <div className='flex h-full w-full items-center justify-center bg-zinc-900 text-xs text-zinc-500'>
                            E{episode.episodeNumber}
                          </div>
                        )}
                      </div>

                      <div className='min-w-0 flex-1 py-0.5'>
                        <div className='flex min-w-0 items-center gap-2'>
                          <span className='shrink-0 text-[11px] font-semibold text-zinc-500'>
                            E{episode.episodeNumber}
                          </span>
                          <h3 className='line-clamp-1 text-sm font-semibold text-zinc-100 group-data-[active=true]:text-white'>
                            {episode.title ||
                              `Episode ${episode.episodeNumber}`}
                          </h3>
                        </div>
                        {meta ? (
                          <p className='mt-0.5 text-xs text-zinc-500'>{meta}</p>
                        ) : null}
                        {episode.overview ? (
                          <p className='mt-1 line-clamp-1 text-xs leading-5 text-zinc-400 sm:line-clamp-2'>
                            {episode.overview}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div
                  className='ui-glass-panel p-5 text-center text-sm text-zinc-400'
                  style={{ borderRadius: 'var(--ui-radius-row)' }}
                >
                  No episodes available for this season.
                </div>
              )}
            </div>
          </section>
        </div>

        <button
          type='button'
          onClick={() => setEpisodePanelOpen((open) => !open)}
          className={`pointer-events-auto ui-glass-control group inline-flex h-11 items-center gap-2.5 px-4 transition-transform hover:scale-[1.02] ${
            episodePanelOpen ? 'ui-glass-control-active' : ''
          }`}
          aria-label={episodePanelOpen ? 'Hide episodes' : 'Show episodes'}
          aria-expanded={episodePanelOpen}
        >
          <span className='inline-flex h-5 w-5 items-center justify-center'>
            <Film className='h-5 w-5 text-zinc-200' />
          </span>
          <span className='flex min-w-0 items-center leading-none'>
            <span className='whitespace-nowrap text-sm font-semibold text-zinc-100'>
              S{currentSeason} E{currentTmdbEpisodeNumber}
            </span>
          </span>
          <ChevronRight
            className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
              episodePanelOpen ? '-rotate-90' : 'rotate-90'
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
              src={processImageUrl(playBackground)}
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
                  <div
                    ref={artRef}
                    className={`h-full w-full overflow-hidden rounded-[var(--ui-radius-card)] bg-black ${
                      isTmdbEmbedPlayback ? 'hidden' : ''
                    }`}
                  />

                  {isTmdbEmbedPlayback ? (
                    <iframe
                      key={playerEmbedUrl}
                      src={playerEmbedUrl}
                      title={`${displayTitle} player`}
                      allow='autoplay; encrypted-media; picture-in-picture; fullscreen'
                      allowFullScreen
                      referrerPolicy='origin'
                      onLoad={() => setIsVideoLoading(false)}
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
                          src={processImageUrl(tmdbDetail.logo)}
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
                    <FavoriteIcon filled={favorited} burstKey={favoriteBurstKey} />
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
                      {tmdbDetail.seasons} Seasons / {tmdbDetail.episodes}{' '}
                      Episodes
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
                      Cast
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
                                  src={processImageUrl(item.profile)}
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
                                {item.character || 'Unknown role'}
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
                          style={{ background: 'transparent', pointerEvents: 'none' }}
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
                              aria-label='Show previous cast members'
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
                          style={{ background: 'transparent', pointerEvents: 'none' }}
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
                              aria-label='Show more cast members'
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
                        Collection
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
                        {displayCollection.parts.slice(0, 24).map((item) => (
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
                                  src={processImageUrl(item.poster)}
                                  alt={item.title}
                                  className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                                />
                              ) : (
                                <div className='flex h-full w-full items-center justify-center text-[11px] text-gray-300/80'>
                                  No poster
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
                                {item.year || 'Unknown year'}
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
                          style={{ background: 'transparent', pointerEvents: 'none' }}
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
                              aria-label='Show previous collection titles'
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
                          style={{ background: 'transparent', pointerEvents: 'none' }}
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
                              aria-label='Show more collection titles'
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
                      More Like This
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
                                  src={processImageUrl(item.poster)}
                                  alt={item.title}
                                  className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-105'
                                />
                              ) : (
                                <div className='flex h-full w-full items-center justify-center text-[11px] text-gray-300/80'>
                                  No poster
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
                                {item.year || 'Unknown year'}
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
                          style={{ background: 'transparent', pointerEvents: 'none' }}
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
                              aria-label='向左查看更多推荐'
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
                          style={{ background: 'transparent', pointerEvents: 'none' }}
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
                              aria-label='向右查看更多推荐'
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
                      src={processImageUrl(displayPoster)}
                      alt={displayTitle}
                      className='w-full h-full object-cover'
                    />
                  ) : (
                    <span className='text-gray-600 dark:text-gray-400'>
                      封面图片
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
        playLabel='Play Now'
      />

      <DanmakuFilterSettings
        isOpen={showDanmakuFilterSettings}
        config={danmakuFilterConfig}
        onChange={(config) => {
          setDanmakuFilterConfig(config);
          danmakuFilterConfigRef.current = config;
          if (danmakuPluginRef.current) {
            try {
              danmakuPluginRef.current.load();
            } catch (error) {
              console.error(
                'Reload danmaku after filter update failed:',
                error
              );
            }
          }
        }}
        onClose={() => setShowDanmakuFilterSettings(false)}
      />

      {seasonMenuOpen && seasonMenuRect
        ? createPortal(
            <div
              ref={seasonMenuRef}
              role='listbox'
              className='ui-glass-panel-strong fixed z-[3000] max-h-72 overflow-hidden p-2 shadow-[0_24px_80px_rgb(0_0_0_/_0.7)]'
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
                          ? 'bg-[var(--ui-glass-row-active)] text-white'
                          : 'text-zinc-200'
                      }`}
                      style={{
                        borderRadius: 'var(--ui-radius-row)',
                      }}
                    >
                      <span>Season {season}</span>
                      {isActive ? (
                        <Check className='h-5 w-5 text-zinc-100' />
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
