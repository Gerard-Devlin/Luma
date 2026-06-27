/* eslint-disable no-console */

const STORAGE_KEY_PREFIX = 'danmaku_selection_';

function getKey(type: string, title: string, episodeIndex?: number): string {
  if (episodeIndex === undefined) {
    return `${STORAGE_KEY_PREFIX}${type}_${title}`;
  }
  return `${STORAGE_KEY_PREFIX}${type}_${title}_${episodeIndex}`;
}

function setSessionValue(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, value);
  } catch (error) {
    console.error('Failed to write danmaku selection memory:', error);
  }
}

function getSessionValue(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    console.error('Failed to read danmaku selection memory:', error);
    return null;
  }
}

export function saveDanmakuSourceIndex(title: string, selectedIndex: number): void {
  setSessionValue(getKey('index', title), String(selectedIndex));
}

export function getDanmakuSourceIndex(title: string): number | null {
  const value = getSessionValue(getKey('index', title));
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function saveManualDanmakuSelection(
  title: string,
  episodeIndex: number,
  episodeId: number
): void {
  setSessionValue(getKey('manual', title, episodeIndex), String(episodeId));
}

export function getManualDanmakuSelection(
  title: string,
  episodeIndex: number
): number | null {
  const value = getSessionValue(getKey('manual', title, episodeIndex));
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function saveDanmakuSearchKeyword(title: string, keyword: string): void {
  setSessionValue(getKey('keyword', title), keyword);
}

export function getDanmakuSearchKeyword(title: string): string | null {
  return getSessionValue(getKey('keyword', title));
}

export function saveDanmakuAnimeId(title: string, animeId: number): void {
  setSessionValue(getKey('anime', title), String(animeId));
}

export function getDanmakuAnimeId(title: string): number | null {
  const value = getSessionValue(getKey('anime', title));
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function clearDanmakuSelectionMemory(title: string): void {
  if (typeof window === 'undefined') return;

  try {
    const exactKeys = [getKey('index', title), getKey('keyword', title), getKey('anime', title)];
    exactKeys.forEach((key) => sessionStorage.removeItem(key));

    const manualPrefix = `${STORAGE_KEY_PREFIX}manual_${title}_`;
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(manualPrefix)) {
        keys.push(key);
      }
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to clear danmaku selection memory:', error);
  }
}

export function clearAllDanmakuSelectionMemory(): void {
  if (typeof window === 'undefined') return;

  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        keys.push(key);
      }
    }

    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to clear all danmaku selection memory:', error);
  }
}

