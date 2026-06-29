'use client';

import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SHOW_AFTER_Y = 360;
const HIDE_BEFORE_Y = 120;
const DIRECTION_DEAD_ZONE = 8;
const SCROLL_DURATION_MS = 260;

const BackToTop = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const lastScrollYRef = useRef(0);
  const tickingRef = useRef(false);
  const isReturningTopRef = useRef(false);

  useEffect(() => {
    let mainEl: HTMLElement | null = null;

    const getScrollY = () => {
      const windowY =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      const mainY = mainEl ? mainEl.scrollTop : 0;
      return Math.max(windowY, mainY);
    };

    const updateVisibility = () => {
      const currentY = getScrollY();
      const previousY = lastScrollYRef.current;
      const delta = currentY - previousY;
      lastScrollYRef.current = currentY;

      if (isReturningTopRef.current) {
        if (currentY <= HIDE_BEFORE_Y) {
          isReturningTopRef.current = false;
        }
        setIsVisible(false);
        return;
      }

      if (currentY <= HIDE_BEFORE_Y) {
        setIsVisible(false);
        return;
      }

      if (Math.abs(delta) < DIRECTION_DEAD_ZONE) return;

      if (delta > 0 && currentY >= SHOW_AFTER_Y) {
        setIsVisible(true);
        return;
      }

      if (delta < 0 && currentY < SHOW_AFTER_Y) {
        setIsVisible(false);
      }
    };

    const handleScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      window.requestAnimationFrame(() => {
        updateVisibility();
        tickingRef.current = false;
      });
    };

    mainEl = document.querySelector('main');
    lastScrollYRef.current = getScrollY();
    setIsVisible(lastScrollYRef.current >= SHOW_AFTER_Y);

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, {
      passive: true,
      capture: true,
    });
    mainEl?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll, true);
      mainEl?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleClick = () => {
    const candidates = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      document.querySelector('main'),
    ].filter(Boolean) as Array<HTMLElement>;

    const getWindowScrollY = () =>
      window.scrollY || document.documentElement.scrollTop || 0;

    const startY = Math.max(
      getWindowScrollY(),
      ...candidates.map((el) => el.scrollTop)
    );
    const startTime = performance.now();

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const setScrollY = (nextY: number) => {
      window.scrollTo(0, nextY);
      for (const el of candidates) {
        el.scrollTop = nextY;
      }
    };

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / SCROLL_DURATION_MS);
      const nextY = Math.round(startY * (1 - easeOutCubic(progress)));

      setScrollY(nextY);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setScrollY(0);
        lastScrollYRef.current = 0;
        isReturningTopRef.current = false;
      }
    };

    if (startY > 0) {
      isReturningTopRef.current = true;
      setIsVisible(false);
      requestAnimationFrame(step);
    }
  };

  return (
    <button
      type='button'
      aria-label={t('common.backToTop')}
      aria-hidden={!isVisible}
      tabIndex={isVisible ? 0 : -1}
      onClick={handleClick}
      className={`ui-glass-control fixed right-4 bottom-6 z-[600] flex h-12 w-12 items-center justify-center ring-0 transition-all duration-200 hover:scale-105 ${
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0'
      }`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ArrowUp className='h-5 w-5' />
    </button>
  );
};

export default BackToTop;
