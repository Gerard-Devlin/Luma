/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Clapperboard,
  HeartPulse,
  Home,
  ArrowLeft,
  Menu,
  Search,
  Tv,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useMatrixRouteTransition } from '@/hooks/useMatrixRouteTransition';

import MatrixLoadingOverlay from '@/components/MatrixLoadingOverlay';

interface SidebarContextType {
  isCollapsed: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
});

export const useSidebar = () => useContext(SidebarContext);

interface SidebarProps {
  onToggle?: (collapsed: boolean) => void;
  activePath?: string;
  showBackButton?: boolean;
}

// 在浏览器环境下通过全局变量缓存折叠状态，避免组件重新挂载时出现初始值闪烁
declare global {
  interface Window {
    __sidebarCollapsed?: boolean;
  }
}

const Sidebar = ({
  onToggle,
  activePath = '/',
  showBackButton = false,
}: SidebarProps) => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const { showMatrixLoading, navigateLinkWithMatrixLoading } =
    useMatrixRouteTransition();
  // 若同一次 SPA 会话中已经读取过折叠状态，则直接复用，避免闪烁
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);

  // 当折叠状态变化时，同步到 <html> data 属性，供首屏 CSS 使用
  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      if (isCollapsed) {
        document.documentElement.dataset.sidebarCollapsed = 'true';
      } else {
        delete document.documentElement.dataset.sidebarCollapsed;
      }
    }
  }, [isCollapsed]);

  const [active, setActive] = useState(activePath);

  useEffect(() => {
    // 优先使用传入的 activePath
    if (activePath) {
      setActive(activePath);
    } else {
      // 否则使用当前路径
      const getCurrentFullPath = () => {
        const queryString = searchParams.toString();
        return queryString ? `${pathname}?${queryString}` : pathname;
      };
      const fullPath = getCurrentFullPath();
      setActive(fullPath);
    }
  }, [activePath, pathname, searchParams]);

  const setSidebarCollapsed = useCallback(
    (collapsed: boolean) => {
      setIsCollapsed(collapsed);
      if (typeof window !== 'undefined') {
        window.__sidebarCollapsed = collapsed;
      }
      onToggle?.(collapsed);
    },
    [onToggle]
  );

  const openSidebar = useCallback(() => {
    setSidebarCollapsed(false);
  }, [setSidebarCollapsed]);

  const handleToggle = useCallback(() => {
    setSidebarCollapsed(!isCollapsed);
  }, [isCollapsed, setSidebarCollapsed]);

  const collapseSidebar = useCallback(() => {
    setSidebarCollapsed(true);
  }, [setSidebarCollapsed]);

  const contextValue = {
    isCollapsed,
  };

  const menuItems = [
    {
      icon: Clapperboard,
      label: t('common.movies'),
      href: '/discover?type=movie',
    },
    {
      icon: Tv,
      label: t('common.series'),
      href: '/discover?type=tv',
    },
    {
      icon: HeartPulse,
      label: t('common.shows'),
      href: '/discover?type=show',
    },
  ];

  return (
    <SidebarContext.Provider value={contextValue}>
      <MatrixLoadingOverlay visible={showMatrixLoading} />
      {/* Hide the desktop sidebar on mobile. */}
      <div className='hidden md:block'>
        <div
          data-sidebar
          onMouseLeave={collapseSidebar}
          className='fixed left-4 top-4 z-[730] w-[232px]'
        >
          {showBackButton ? (
            <div
              className={`ui-glass-pill flex h-11 w-fit items-center overflow-hidden ${
                !isCollapsed ? 'ui-glass-control-active' : ''
              }`}
            >
              <button
                type='button'
                aria-label={
                  isCollapsed
                    ? t('common.openSidebar')
                    : t('nav.collapseSidebar')
                }
                onMouseEnter={openSidebar}
                onFocus={openSidebar}
                onClick={handleToggle}
                className='flex h-full w-11 items-center justify-center text-zinc-300 transition-colors hover:bg-[var(--ui-glass-row-hover)] hover:text-white'
              >
                <Menu className='h-5 w-5 shrink-0' />
              </button>
              <div className='ui-glass-divider h-5 w-px' />
              <button
                type='button'
                aria-label={t('common.back')}
                onClick={() => window.history.back()}
                className='flex h-full w-11 items-center justify-center text-zinc-300 transition-colors hover:bg-[var(--ui-glass-row-hover)] hover:text-white'
              >
                <ArrowLeft className='h-5 w-5 shrink-0' />
              </button>
            </div>
          ) : (
            <button
              type='button'
              aria-label={
                isCollapsed ? t('common.openSidebar') : t('nav.collapseSidebar')
              }
              onMouseEnter={openSidebar}
              onFocus={openSidebar}
              onClick={handleToggle}
              className={`ui-glass-control flex h-11 w-11 items-center justify-center ${
                !isCollapsed ? 'ui-glass-control-active' : ''
              }`}
            >
              <Menu className='h-5 w-5 shrink-0' />
            </button>
          )}
          <AnimatePresence>
            {!isCollapsed ? (
              <motion.div
                key='desktop-sidebar-panel'
                className='ui-glass-panel mt-2 flex max-h-[calc(100vh-5.25rem)] flex-col overflow-hidden p-2'
                style={{
                  originX: 0,
                  originY: 0,
                }}
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        scale: 0.88,
                        y: -8,
                        filter: 'blur(8px)',
                      }
                }
                animate={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
                }
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        scale: 0.9,
                        y: -6,
                        filter: 'blur(6px)',
                      }
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : {
                        type: 'spring',
                        stiffness: 520,
                        damping: 38,
                        mass: 0.7,
                      }
                }
              >
                {/* Primary navigation */}
                <nav className='space-y-1'>
              <Link
                href='/'
                onClick={(event) => {
                  setActive('/');
                  collapseSidebar();
                  navigateLinkWithMatrixLoading(event, '/');
                }}
                data-active={active === '/'}
                className={`ui-glass-row group flex items-center px-2 py-2 pl-4 text-zinc-300 hover:text-white data-[active=true]:text-white font-medium duration-200 min-h-[40px] ${
                  isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                } gap-3 justify-start`}
              >
                <div className='w-4 h-4 flex items-center justify-center'>
                  <Home className='h-4 w-4 text-zinc-400 group-hover:text-white data-[active=true]:text-white' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                    {t('common.home')}
                  </span>
                )}
              </Link>
              <Link
                href='/search'
                onClick={(event) => {
                  setActive('/search');
                  collapseSidebar();
                  navigateLinkWithMatrixLoading(event, '/search');
                }}
                data-active={active === '/search'}
                className={`ui-glass-row group flex items-center px-2 py-2 pl-4 text-zinc-300 hover:text-white data-[active=true]:text-white font-medium duration-200 min-h-[40px] ${
                  isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                } gap-3 justify-start`}
              >
                <div className='w-4 h-4 flex items-center justify-center'>
                  <Search className='h-4 w-4 text-zinc-400 group-hover:text-white data-[active=true]:text-white' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                    {t('common.search')}
                  </span>
                )}
              </Link>
              <Link
                href='/my'
                onClick={(event) => {
                  setActive('/my');
                  collapseSidebar();
                  navigateLinkWithMatrixLoading(event, '/my');
                }}
                data-active={active === '/my'}
                className={`ui-glass-row group flex items-center px-2 py-2 pl-4 text-zinc-300 hover:text-white data-[active=true]:text-white font-medium duration-200 min-h-[40px] ${
                  isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                } gap-3 justify-start`}
              >
                <div className='w-4 h-4 flex items-center justify-center'>
                  <UserRound className='h-4 w-4 text-zinc-400 group-hover:text-white data-[active=true]:text-white' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                    {t('common.myLibrary')}
                  </span>
                )}
              </Link>
                </nav>

                {/* Divider */}
                <div className='ui-glass-divider mx-3 mt-3 h-px'></div>

                {/* Category navigation */}
                <div className='overflow-y-auto pt-3'>
                  <div className='space-y-1'>
                    {menuItems.map((item) => {
                      // Check whether the current path matches this item.
                      const typeMatch = item.href.match(/type=([^&]+)/)?.[1];

                      // Decode URLs before comparison.
                      const decodedActive = decodeURIComponent(active);
                      const decodedItemHref = decodeURIComponent(item.href);

                      const isActive =
                        decodedActive === decodedItemHref ||
                        (decodedActive.startsWith('/discover') &&
                          decodedActive.includes(`type=${typeMatch}`));
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.label}
                          href={item.href}
                          onClick={(event) => {
                            setActive(item.href);
                            collapseSidebar();
                            navigateLinkWithMatrixLoading(event, item.href);
                          }}
                          data-active={isActive}
                          className={`ui-glass-row group flex items-center px-2 py-2 pl-4 text-sm text-zinc-300 hover:text-white data-[active=true]:text-white duration-200 min-h-[40px] ${
                            isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                          } gap-3 justify-start`}
                        >
                          <div className='w-4 h-4 flex items-center justify-center'>
                            <Icon className='h-4 w-4 text-zinc-400 group-hover:text-white data-[active=true]:text-white' />
                          </div>
                          {!isCollapsed && (
                            <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                              {item.label}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <div className='sidebar-offset w-0'></div>
      </div>
    </SidebarContext.Provider>
  );
};

export default Sidebar;
