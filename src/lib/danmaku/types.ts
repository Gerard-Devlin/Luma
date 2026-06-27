export interface DanmakuSearchResponse {
  errorCode: number;
  success: boolean;
  errorMessage: string;
  animes: DanmakuAnime[];
}

export interface DanmakuAnime {
  animeId: number;
  bangumiId?: string | number;
  animeTitle: string;
  type: string;
  typeDescription: string;
  source: string;
  imageUrl?: string;
  startDate?: string;
  episodeCount?: number;
}

export interface DanmakuMatchRequest {
  fileName: string;
}

export interface DanmakuMatchResponse {
  errorCode: number;
  success: boolean;
  errorMessage: string;
  isMatched: boolean;
  matches: DanmakuMatch[];
}

export interface DanmakuMatch {
  episodeId: number;
  animeId: number;
  animeTitle: string;
  episodeTitle: string;
  type: string;
  typeDescription: string;
  shift: number;
  imageUrl?: string;
}

export interface DanmakuEpisodesResponse {
  errorCode: number;
  success: boolean;
  errorMessage: string;
  bangumi: DanmakuBangumi;
}

export interface DanmakuBangumi {
  bangumiId: string;
  animeTitle: string;
  imageUrl?: string;
  episodes: DanmakuEpisode[];
}

export interface DanmakuEpisode {
  episodeId: number;
  episodeTitle: string;
}

export interface DanmakuComment {
  p: string;
  m: string;
  cid: number;
}

export interface DanmakuCommentsResponse {
  count: number;
  comments: DanmakuComment[];
}

export interface DanmakuSelection {
  animeId: number;
  episodeId: number;
  animeTitle: string;
  episodeTitle: string;
  searchKeyword?: string;
  danmakuCount?: number;
  danmakuOriginalCount?: number;
}

export interface DanmakuSettings {
  enabled: boolean;
  opacity: number;
  fontSize: number;
  speed: number;
  marginTop: number;
  marginBottom: number;
  maxlength: number;
  filterRules: string[];
  unlimited: boolean;
  synchronousPlayback: boolean;
  maxCount?: number;
}

export interface DanmakuFilterRule {
  id: string;
  keyword: string;
  type: 'normal' | 'regex';
  enabled: boolean;
}

export interface DanmakuFilterConfig {
  rules: DanmakuFilterRule[];
}
