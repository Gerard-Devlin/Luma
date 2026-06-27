/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import clsx, { type ClassValue } from 'clsx';
import Hls from 'hls.js';
import { twMerge } from 'tailwind-merge';

type ProxyKind = 'image' | 'douban';

interface ProxyCacheEntry {
  expiresAt: number;
  value: string | null;
}

const PROXY_CACHE_TTL_MS = 3000;
const proxyCache: Record<ProxyKind, ProxyCacheEntry> = {
  image: { expiresAt: 0, value: null },
  douban: { expiresAt: 0, value: null },
};
let hasBoundProxyStorageListener = false;

export function cn(...inputs: Array<ClassValue>): string {
  return twMerge(clsx(...inputs));
}

function normalizeProxyValue(value: string | null | undefined): string | null {
  const normalized = (value || '').trim();
  return normalized ? normalized : null;
}

function safeParseBoolean(value: string | null): boolean | null {
  if (value === null) return null;
  try {
    return Boolean(JSON.parse(value));
  } catch {
    return null;
  }
}

function clearProxyCache(): void {
  proxyCache.image.expiresAt = 0;
  proxyCache.image.value = null;
  proxyCache.douban.expiresAt = 0;
  proxyCache.douban.value = null;
}

function ensureProxyStorageListener(): void {
  if (typeof window === 'undefined' || hasBoundProxyStorageListener) return;
  hasBoundProxyStorageListener = true;
  window.addEventListener('storage', (event) => {
    if (
      event.key === null ||
      event.key === 'enableImageProxy' ||
      event.key === 'imageProxyUrl' ||
      event.key === 'enableDoubanProxy' ||
      event.key === 'doubanProxyUrl'
    ) {
      clearProxyCache();
    }
  });
}

function readProxyUrl(options: {
  enableKey: string;
  urlKey: string;
  runtimeKey: 'IMAGE_PROXY' | 'DOUBAN_PROXY';
}): string | null {
  if (typeof window === 'undefined') return null;

  const enableValue = safeParseBoolean(localStorage.getItem(options.enableKey));
  if (enableValue === false) {
    return null;
  }

  const localProxy = normalizeProxyValue(localStorage.getItem(options.urlKey));
  if (localProxy) {
    return localProxy;
  }

  return normalizeProxyValue((window as any).RUNTIME_CONFIG?.[options.runtimeKey]);
}

function getCachedProxyUrl(
  kind: ProxyKind,
  options: {
    enableKey: string;
    urlKey: string;
    runtimeKey: 'IMAGE_PROXY' | 'DOUBAN_PROXY';
  }
): string | null {
  if (typeof window === 'undefined') return null;

  ensureProxyStorageListener();
  const now = Date.now();
  const cached = proxyCache[kind];
  if (cached.expiresAt > now) {
    return cached.value;
  }

  const nextValue = readProxyUrl(options);
  cached.value = nextValue;
  cached.expiresAt = now + PROXY_CACHE_TTL_MS;
  return nextValue;
}

/**
 * 获取图片代理 URL 设置
 */
export function getImageProxyUrl(): string | null {
  return getCachedProxyUrl('image', {
    enableKey: 'enableImageProxy',
    urlKey: 'imageProxyUrl',
    runtimeKey: 'IMAGE_PROXY',
  });
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getImageProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

/**
 * 获取豆瓣代理 URL 设置
 */
export function getDoubanProxyUrl(): string | null {
  return getCachedProxyUrl('douban', {
    enableKey: 'enableDoubanProxy',
    urlKey: 'doubanProxyUrl',
    runtimeKey: 'DOUBAN_PROXY',
  });
}

/**
 * 处理豆瓣 URL，如果设置了豆瓣代理则使用代理
 */
export function processDoubanUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getDoubanProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .replace(/&nbsp;/g, ' ') // 将 &nbsp; 替换为空格
    .trim(); // 去掉首尾空格
}

/**
 * 从m3u8地址获取视频质量等级和网络信息
 * @param m3u8Url m3u8播放列表的URL
 * @returns Promise<{quality: string, loadSpeed: string, pingTime: number}> 视频质量等级和网络信息
 */
export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string; // 如720p、1080p等
  loadSpeed: string; // 自动转换为KB/s或MB/s
  pingTime: number; // 网络延迟（毫秒）
}> {
  try {
    // 直接使用m3u8 URL作为视频源，避免CORS问题
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';

      // 测量网络延迟（ping时间） - 使用m3u8 URL而不是ts文件
      const pingStart = performance.now();
      let pingTime = 0;

      // 测量ping时间（使用m3u8 URL）
      fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          pingTime = performance.now() - pingStart;
        })
        .catch(() => {
          pingTime = performance.now() - pingStart; // 记录到失败为止的时间
        });

      // 固定使用hls.js加载
      const hls = new Hls();

      // 设置超时处理
      const timeout = setTimeout(() => {
        hls.destroy();
        video.remove();
        reject(new Error('Timeout loading video metadata'));
      }, 4000);

      video.onerror = () => {
        clearTimeout(timeout);
        hls.destroy();
        video.remove();
        reject(new Error('Failed to load video metadata'));
      };

      let actualLoadSpeed = '未知';
      let hasSpeedCalculated = false;
      let hasMetadataLoaded = false;

      let fragmentStartTime = 0;

      // 检查是否可以返回结果
      const checkAndResolve = () => {
        if (
          hasMetadataLoaded &&
          (hasSpeedCalculated || actualLoadSpeed !== '未知')
        ) {
          clearTimeout(timeout);
          const width = video.videoWidth;
          if (width && width > 0) {
            hls.destroy();
            video.remove();

            // 根据视频宽度判断视频质量等级，使用经典分辨率的宽度作为分割点
            const quality =
              width >= 3840
                ? '4K' // 4K: 3840x2160
                : width >= 2560
                ? '2K' // 2K: 2560x1440
                : width >= 1920
                ? '1080p' // 1080p: 1920x1080
                : width >= 1280
                ? '720p' // 720p: 1280x720
                : width >= 854
                ? '480p'
                : 'SD'; // 480p: 854x480

            resolve({
              quality,
              loadSpeed: actualLoadSpeed,
              pingTime: Math.round(pingTime),
            });
          } else {
            // webkit 无法获取尺寸，直接返回
            resolve({
              quality: '未知',
              loadSpeed: actualLoadSpeed,
              pingTime: Math.round(pingTime),
            });
          }
        }
      };

      // 监听片段加载开始
      hls.on(Hls.Events.FRAG_LOADING, () => {
        fragmentStartTime = performance.now();
      });

      // 监听片段加载完成，只需首个分片即可计算速度
      hls.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
        if (
          fragmentStartTime > 0 &&
          data &&
          data.payload &&
          !hasSpeedCalculated
        ) {
          const loadTime = performance.now() - fragmentStartTime;
          const size = data.payload.byteLength || 0;

          if (loadTime > 0 && size > 0) {
            const speedKBps = size / 1024 / (loadTime / 1000);

            // 立即计算速度，无需等待更多分片
            const avgSpeedKBps = speedKBps;

            if (avgSpeedKBps >= 1024) {
              actualLoadSpeed = `${(avgSpeedKBps / 1024).toFixed(1)} MB/s`;
            } else {
              actualLoadSpeed = `${avgSpeedKBps.toFixed(1)} KB/s`;
            }
            hasSpeedCalculated = true;
            checkAndResolve(); // 尝试返回结果
          }
        }
      });

      hls.loadSource(m3u8Url);
      hls.attachMedia(video);

      // 监听hls.js错误
      hls.on(Hls.Events.ERROR, (event: any, data: any) => {
        console.error('HLS错误:', data);
        if (data.fatal) {
          clearTimeout(timeout);
          hls.destroy();
          video.remove();
          reject(new Error(`HLS播放失败: ${data.type}`));
        }
      });

      // 监听视频元数据加载完成
      video.onloadedmetadata = () => {
        hasMetadataLoaded = true;
        checkAndResolve(); // 尝试返回结果
      };
    });
  } catch (error) {
    throw new Error(
      `Error getting video resolution: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
