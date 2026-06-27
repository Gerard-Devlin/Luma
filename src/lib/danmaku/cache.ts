import type { DanmakuComment } from './types';

const DB_NAME = 'luma_danmaku_cache_v1';
const DB_VERSION = 1;
const STORE_NAME = 'danmaku';

export interface DanmakuCacheData {
  cacheKey: string;
  comments: DanmakuComment[];
  timestamp: number;
  title?: string;
  episodeIndex?: number;
  animeId?: number;
  episodeId?: number;
  animeTitle?: string;
  episodeTitle?: string;
  searchKeyword?: string;
  danmakuCount?: number;
}

export function generateCacheKey(title: string, episodeIndex: number): string {
  return `${title}|${episodeIndex}`;
}

export function getDanmakuCacheExpireTime(): number {
  if (typeof window === 'undefined') {
    return 4320 * 60 * 1000;
  }

  const value = process.env.NEXT_PUBLIC_DANMAKU_CACHE_EXPIRE_MINUTES;
  if (value) {
    const minutes = Number.parseInt(value, 10);
    if (!Number.isNaN(minutes)) {
      if (minutes === 0) return 0;
      if (minutes > 0) return minutes * 60 * 1000;
    }
  }

  return 4320 * 60 * 1000;
}

async function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

export async function saveDanmakuToCache(
  title: string,
  episodeIndex: number,
  comments: DanmakuComment[],
  metadata?: {
    animeId?: number;
    episodeId?: number;
    animeTitle?: string;
    episodeTitle?: string;
    searchKeyword?: string;
    danmakuCount?: number;
  }
): Promise<void> {
  if (!title || title.trim() === '' || episodeIndex < 0) return;
  if (getDanmakuCacheExpireTime() === 0) return;

  const db = await openDB();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const data: DanmakuCacheData = {
        cacheKey: generateCacheKey(title, episodeIndex),
        comments,
        timestamp: Date.now(),
        title,
        episodeIndex,
        animeId: metadata?.animeId,
        episodeId: metadata?.episodeId,
        animeTitle: metadata?.animeTitle,
        episodeTitle: metadata?.episodeTitle,
        searchKeyword: metadata?.searchKeyword,
        danmakuCount: metadata?.danmakuCount ?? comments.length,
      };

      const req = store.put(data);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to cache danmaku'));
    });
  } finally {
    db.close();
  }
}

export async function getDanmakuFromCache(
  title: string,
  episodeIndex: number
): Promise<{
  comments: DanmakuComment[];
  metadata?: {
    animeId?: number;
    episodeId?: number;
    animeTitle?: string;
    episodeTitle?: string;
    searchKeyword?: string;
    danmakuCount?: number;
  };
} | null> {
  if (!title || episodeIndex < 0) return null;

  const expireTime = getDanmakuCacheExpireTime();
  if (expireTime === 0) return null;

  const db = await openDB();

  try {
    const result = await new Promise<DanmakuCacheData | undefined>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(generateCacheKey(title, episodeIndex));

      req.onsuccess = () => resolve(req.result as DanmakuCacheData | undefined);
      req.onerror = () => reject(req.error || new Error('Failed to read danmaku cache'));
    });

    if (!result) return null;

    const age = Date.now() - result.timestamp;
    if (age > expireTime) return null;

    return {
      comments: result.comments,
      metadata: {
        animeId: result.animeId,
        episodeId: result.episodeId,
        animeTitle: result.animeTitle,
        episodeTitle: result.episodeTitle,
        searchKeyword: result.searchKeyword,
        danmakuCount: result.danmakuCount ?? result.comments.length,
      },
    };
  } finally {
    db.close();
  }
}

export async function clearDanmakuCache(title: string, episodeIndex: number): Promise<void> {
  const db = await openDB();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(generateCacheKey(title, episodeIndex));

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to clear danmaku cache'));
    });
  } finally {
    db.close();
  }
}

export async function clearExpiredDanmakuCache(): Promise<number> {
  const expireTime = getDanmakuCacheExpireTime();
  if (expireTime === 0) return 0;

  const db = await openDB();

  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const req = index.openCursor();
      const threshold = Date.now() - expireTime;
      let deleted = 0;

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(deleted);
          return;
        }

        const data = cursor.value as DanmakuCacheData;
        if (data.timestamp < threshold) {
          cursor.delete();
          deleted += 1;
        }

        cursor.continue();
      };

      req.onerror = () => reject(req.error || new Error('Failed to clear expired cache'));
    });
  } finally {
    db.close();
  }
}

export async function clearAllDanmakuCache(): Promise<void> {
  const db = await openDB();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to clear danmaku cache'));
    });
  } finally {
    db.close();
  }
}

export async function getDanmakuCacheStats(): Promise<{
  total: number;
  expired: number;
  totalSize: number;
}> {
  const expireTime = getDanmakuCacheExpireTime();
  if (expireTime === 0) {
    return { total: 0, expired: 0, totalSize: 0 };
  }

  const db = await openDB();

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      const threshold = Date.now() - expireTime;

      let total = 0;
      let expired = 0;
      let totalSize = 0;

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve({ total, expired, totalSize });
          return;
        }

        const data = cursor.value as DanmakuCacheData;
        total += 1;
        totalSize += data.comments.length;
        if (data.timestamp < threshold) expired += 1;
        cursor.continue();
      };

      req.onerror = () => reject(req.error || new Error('Failed to read danmaku cache stats'));
    });
  } finally {
    db.close();
  }
}
