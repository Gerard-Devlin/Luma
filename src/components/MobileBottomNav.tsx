/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  Film,
  HeartPulse,
  Home,
  Tv,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { useMatrixRouteTransition } from '@/hooks/useMatrixRouteTransition';

import MatrixLoadingOverlay from '@/components/MatrixLoadingOverlay';

const CLOSE_MENU_LABEL = 'Close menu';

interface MobileBottomNavProps {
  /**
   * Active path override. When omitted, it falls back to usePathname().
   */
  activePath?: string;
  isOpen: boolean;
  onClose: () => void;
  onMenuToggle?: () => void;
  showBackButton?: boolean;
  useHeroHeaderStyle?: boolean;
}

const MobileBottomNav = ({
  activePath,
  isOpen,
  onClose,
  onMenuToggle,
  showBackButton = false,
  useHeroHeaderStyle = false,
}: MobileBottomNavProps) => {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const { showMatrixLoading, navigateLinkWithMatrixLoading } =
    useMatrixRouteTransition();

  const currentActive = activePath ?? pathname;
  const useHomeHeaderPosition =
    activePath === '/' || useHeroHeaderStyle;

  const navItems = [
    { icon: Home, label: 'Home', href: '/' },
    { icon: UserRound, label: 'My Library', href: '/my' },
  ];

  const categoryItems = [
    { icon: Film, label: 'Movies', href: '/discover?type=movie' },
    { icon: Tv, label: 'Series', href: '/discover?type=tv' },
    { icon: HeartPulse, label: 'Shows', href: '/discover?type=show' },
  ];

  useEffect(() => {
    onClose();
  }, [onClose, pathname]);

  const isActive = (href: string) => {
    const typeMatch = href.match(/type=([^&]+)/)?.[1];

    const decodedActive = decodeURIComponent(currentActive);
    const decodedItemHref = decodeURIComponent(href);

    return (
      decodedActive === decodedItemHref ||
      (decodedActive.startsWith('/discover') &&
        decodedActive.includes(`type=${typeMatch}`))
    );
  };

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const active = isActive(item.href);
    const itemClassName = `group flex items-center gap-2.5 text-[17px] font-semibold leading-tight tracking-normal transition-colors ${
      active ? 'text-white' : 'text-zinc-100 active:text-white/70'
    }`;
    const Icon = item.icon;

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={(event) =>
            navigateLinkWithMatrixLoading(event, item.href, {
              onBeforeNavigate: onClose,
            })
          }
          className={itemClassName}
        >
          <Icon
            className={`h-5 w-5 ${
              active ? 'text-white' : 'text-zinc-500 group-active:text-white/70'
            }`}
          />
          <span>{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <MatrixLoadingOverlay visible={showMatrixLoading} />

      <AnimatePresence>
        {isOpen ? (
          <>
            <motion.nav
              key='mobile-nav-panel'
              className='md:hidden fixed inset-0 z-[700] overflow-y-auto bg-[var(--ui-glass-panel-strong-bg)] pb-10 text-white shadow-[var(--ui-shadow-panel)] backdrop-blur-2xl'
              style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 2.5rem)',
                originX: 0.05,
                originY: 0.04,
              }}
              initial={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.92, y: -10, filter: 'blur(10px)' }
              }
              animate={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, x: 0, y: 0, filter: 'blur(0px)' }
              }
              exit={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.96, y: -8, filter: 'blur(8px)' }
              }
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      type: 'spring',
                      stiffness: 520,
                      damping: 38,
                      mass: 0.72,
                }
              }
            >
              <div
                className={`relative mx-auto h-12 max-w-[720px] ${
                  useHomeHeaderPosition
                    ? 'mt-3 w-[calc(100%-2.5rem)]'
                    : 'mt-2 w-[calc(100%-1.5rem)]'
                }`}
              >
                <div className='flex h-full items-center gap-2.5'>
                  <button
                    type='button'
                    aria-label={CLOSE_MENU_LABEL}
                    onClick={onMenuToggle || onClose}
                    className='flex h-11 w-11 items-center justify-center rounded-full text-zinc-100 transition-colors active:bg-[var(--ui-glass-row-hover)]'
                  >
                    <X className='h-6 w-6' />
                  </button>
                  <div className='text-[20px] font-semibold leading-none text-white'>
                    Menu
                  </div>
                  {showBackButton ? (
                    <>
                      <div className='ui-glass-divider h-5 w-px' />
                      <button
                        type='button'
                        aria-label='Back'
                        onClick={() => window.history.back()}
                        className='flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 transition-colors active:bg-[var(--ui-glass-row-hover)]'
                      >
                        <ArrowLeft className='h-6 w-6' />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className='mx-auto max-w-[720px] px-7'>
                <div className='mt-8 text-sm font-semibold text-zinc-500'>
                  Menu
                </div>
                <ul className='mt-3.5 flex flex-col gap-3.5'>
                  {navItems.map(renderNavItem)}
                </ul>

                <div className='mt-6 text-sm font-semibold text-zinc-500'>
                  Categories
                </div>
                <ul className='mt-3.5 flex flex-col gap-3.5'>
                  {categoryItems.map(renderNavItem)}
                </ul>
              </div>
            </motion.nav>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
};

export default MobileBottomNav;
