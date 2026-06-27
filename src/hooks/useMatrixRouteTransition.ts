'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useState } from 'react';

interface MatrixNavigateOptions {
  onBeforeNavigate?: () => void;
}

const DEFAULT_MATRIX_HIDE_TIMEOUT_MS = 10000;

export function useMatrixRouteTransition() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const [showMatrixLoading, setShowMatrixLoading] = useState(false);

  const getCurrentFullPath = useCallback(() => {
    return searchParamString ? `${pathname}?${searchParamString}` : pathname;
  }, [pathname, searchParamString]);

  const navigateWithMatrixLoading = useCallback(
    (href: string, options?: MatrixNavigateOptions): boolean => {
      options?.onBeforeNavigate?.();

      const currentFullPath = getCurrentFullPath();
      if (decodeURIComponent(currentFullPath) === decodeURIComponent(href)) {
        return false;
      }

      setShowMatrixLoading(true);

      // Ensure the matrix overlay paints before route change starts.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          router.push(href);
        });
      });

      return true;
    },
    [getCurrentFullPath, router]
  );

  const navigateLinkWithMatrixLoading = useCallback(
    (
      event: ReactMouseEvent<HTMLAnchorElement>,
      href: string,
      options?: MatrixNavigateOptions
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
      return navigateWithMatrixLoading(href, options);
    },
    [navigateWithMatrixLoading]
  );

  useEffect(() => {
    if (!showMatrixLoading) return;
    const timer = window.setTimeout(() => {
      setShowMatrixLoading(false);
    }, DEFAULT_MATRIX_HIDE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [showMatrixLoading]);

  useEffect(() => {
    setShowMatrixLoading(false);
  }, [pathname, searchParamString]);

  return {
    showMatrixLoading,
    setShowMatrixLoading,
    navigateWithMatrixLoading,
    navigateLinkWithMatrixLoading,
  };
}

