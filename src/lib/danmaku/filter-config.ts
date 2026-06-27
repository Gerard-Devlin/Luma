/* eslint-disable no-console */

import type { DanmakuFilterConfig, DanmakuFilterRule } from './types';

const STORAGE_KEY = 'luma_danmaku_filter_config';
const LEGACY_STORAGE_KEY = `${'moon' + 'tv'}_danmaku_filter_config`;

export const DEFAULT_DANMAKU_FILTER_CONFIG: DanmakuFilterConfig = {
  rules: [],
};

function normalizeRule(rule: unknown): DanmakuFilterRule | null {
  if (!rule || typeof rule !== 'object') return null;

  const raw = rule as Partial<DanmakuFilterRule>;
  const keyword = (raw.keyword || '').trim();
  if (!keyword) return null;

  return {
    id: raw.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    keyword,
    type: raw.type === 'regex' ? 'regex' : 'normal',
    enabled: raw.enabled !== false,
  };
}

export function loadDanmakuFilterConfig(): DanmakuFilterConfig {
  if (typeof window === 'undefined') return DEFAULT_DANMAKU_FILTER_CONFIG;

  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return DEFAULT_DANMAKU_FILTER_CONFIG;
    localStorage.setItem(STORAGE_KEY, raw);

    const parsed = JSON.parse(raw) as Partial<DanmakuFilterConfig>;
    const rules = Array.isArray(parsed.rules)
      ? parsed.rules.map(normalizeRule).filter(Boolean)
      : [];

    return {
      rules: rules as DanmakuFilterRule[],
    };
  } catch (error) {
    console.error('Failed to load danmaku filter config:', error);
    return DEFAULT_DANMAKU_FILTER_CONFIG;
  }
}

export function saveDanmakuFilterConfig(config: DanmakuFilterConfig): void {
  if (typeof window === 'undefined') return;

  try {
    const normalized: DanmakuFilterConfig = {
      rules: (config.rules || []).map(normalizeRule).filter(Boolean) as DanmakuFilterRule[],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.error('Failed to save danmaku filter config:', error);
  }
}

export function isDanmakuBlocked(
  text: string,
  config: DanmakuFilterConfig | null | undefined
): boolean {
  if (!config || !Array.isArray(config.rules) || config.rules.length === 0) {
    return false;
  }

  for (const rule of config.rules) {
    if (!rule.enabled || !rule.keyword) continue;

    try {
      if (rule.type === 'regex') {
        if (new RegExp(rule.keyword).test(text)) {
          return true;
        }
      } else if (text.includes(rule.keyword)) {
        return true;
      }
    } catch (error) {
      console.error('Invalid danmaku filter rule:', error);
    }
  }

  return false;
}

