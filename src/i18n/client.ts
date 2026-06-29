'use client';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import {
  type AppLanguage,
  fallbackLanguage,
  resources,
  supportedLanguages,
} from './resources';
import { normalizeTmdbLanguage, type TmdbLanguage } from '@/lib/tmdb-language';

export const LANGUAGE_STORAGE_KEY = 'luma-language';

function normalizeLanguage(value?: string | null): AppLanguage {
  const normalized = (value || '').toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('en')) return 'en';
  return fallbackLanguage;
}

export function getInitialLanguage(): AppLanguage {
  if (typeof window === 'undefined') {
    return fallbackLanguage;
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (storedLanguage) {
    return normalizeLanguage(storedLanguage);
  }

  return normalizeLanguage(window.navigator.language);
}

export function persistLanguage(language: AppLanguage) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
}

export function getCurrentTmdbLanguage(): TmdbLanguage {
  return normalizeTmdbLanguage(i18next.language || getInitialLanguage());
}

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources,
    lng: fallbackLanguage,
    fallbackLng: fallbackLanguage,
    returnNull: false,
    supportedLngs: supportedLanguages,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });
}

export default i18next;
