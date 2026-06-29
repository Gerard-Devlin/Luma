export type TmdbLanguage = 'en-US' | 'zh-CN';

export const DEFAULT_TMDB_LANGUAGE: TmdbLanguage = 'en-US';

export function normalizeTmdbLanguage(value?: string | null): TmdbLanguage {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'zh-cn' || normalized === 'zh' || normalized.startsWith('zh-')) {
    return 'zh-CN';
  }
  return DEFAULT_TMDB_LANGUAGE;
}

export function getTmdbImageLanguage(language?: string | null): string {
  return normalizeTmdbLanguage(language) === 'zh-CN'
    ? 'zh,en,null'
    : 'en,null';
}

export function getStableTmdbImageLanguage(): string {
  return 'en,zh,null';
}

export function getTmdbVideoLanguage(language?: string | null): string {
  return normalizeTmdbLanguage(language) === 'zh-CN'
    ? 'zh,en,null'
    : 'en,null';
}

export function appendTmdbLanguageParam(
  params: URLSearchParams,
  language?: string | null
): URLSearchParams {
  params.set('tmdbLanguage', normalizeTmdbLanguage(language));
  return params;
}
