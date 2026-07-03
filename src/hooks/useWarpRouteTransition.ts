'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

interface WarpNavigateOptions {
  onBeforeNavigate?: () => void;
}

const DEFAULT_WARP_HIDE_TIMEOUT_MS = 10000;

export function useWarpRouteTransition() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const [showWarpLoading, setShowWarpLoading] = useState(false);

  const getCurrentFullPath = useCallback(() => {
    return searchParamString ? `${pathname}?${searchParamString}` : pathname;
  }, [pathname, searchParamString]);

  const navigateWithWarpLoading = useCallback(
    (href: string, options?: WarpNavigateOptions): boolean => {
      options?.onBeforeNavigate?.();

      const currentFullPath = getCurrentFullPath();
      if (decodeURIComponent(currentFullPath) === decodeURIComponent(href)) {
        return false;
      }

      setShowWarpLoading(true);

      // Ensure the shader overlay paints before route change starts.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          router.push(href);
        });
      });

      return true;
    },
    [getCurrentFullPath, router]
  );

  const navigateLinkWithWarpLoading = useCallback(
    (
      event: ReactMouseEvent<HTMLAnchorElement>,
      href: string,
      options?: WarpNavigateOptions
    ): boolean => {
      if (event.defaultPrevented) return false;
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return false;
      }

      event.preventDefault();
      return navigateWithWarpLoading(href, options);
    },
    [navigateWithWarpLoading]
  );

  useEffect(() => {
    if (!showWarpLoading) return;
    const timer = window.setTimeout(() => {
      setShowWarpLoading(false);
    }, DEFAULT_WARP_HIDE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [showWarpLoading]);

  useEffect(() => {
    setShowWarpLoading(false);
  }, [pathname, searchParamString]);

  return {
    showWarpLoading,
    setShowWarpLoading,
    navigateWithWarpLoading,
    navigateLinkWithWarpLoading,
  };
}
