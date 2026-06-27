'use client';

import { Menu, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { BackButton } from './BackButton';
import { UserMenu } from './UserMenu';

interface MobileHeaderProps {
  showBackButton?: boolean;
  isMenuOpen?: boolean;
  onMenuToggle?: () => void;
  onSearchOpen?: () => void;
  isHomePage?: boolean;
}

const MobileHeader = ({
  showBackButton = false,
  isMenuOpen = false,
  onMenuToggle,
  onSearchOpen,
  isHomePage = false,
}: MobileHeaderProps) => {
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (isMenuOpen) {
      setIsHidden(false);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    let ticking = false;
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

    const update = () => {
      const currentY = getScrollY();
      const delta = currentY - lastScrollY.current;
      lastScrollY.current = currentY;

      if (isMenuOpen) {
        setIsHidden(false);
        return;
      }

      if (Math.abs(delta) < 2) return;

      if (currentY < 24) {
        setIsHidden(false);
      } else if (delta > 0) {
        setIsHidden(true);
      } else {
        setIsHidden(false);
      }
    };

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    };

    mainEl = document.querySelector('main');
    lastScrollY.current = getScrollY();
    update();

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
  }, [isMenuOpen]);

  return (
    <header
      className={`md:hidden fixed left-0 right-0 z-[650] transition-all duration-300 ease-out ${
        isHidden
          ? '-translate-y-full opacity-0 pointer-events-none'
          : 'translate-y-0 opacity-100'
      }`}
      style={{ top: 0, paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div
        className={`relative mx-auto h-12 max-w-[720px] ${
          isHomePage
            ? 'mt-3 w-[calc(100%-2.5rem)]'
            : 'mt-2 w-[calc(100%-1.5rem)]'
        }`}
      >
        <div className='relative flex h-full items-center justify-between'>
          <div className='flex items-center'>
            {onMenuToggle && showBackButton ? (
              <div className='ui-glass-pill flex h-11 items-center overflow-hidden'>
                <button
                  type='button'
                  aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                  onClick={onMenuToggle}
                  className='flex h-full w-11 items-center justify-center transition-colors hover:text-white'
                >
                  {isMenuOpen ? (
                    <X className='h-5 w-5' />
                  ) : (
                    <Menu className='h-5 w-5' />
                  )}
                </button>
                <div className='ui-glass-divider h-5 w-px' />
                <BackButton className='flex h-full w-11 items-center justify-center text-zinc-200 transition-colors hover:text-white' />
              </div>
            ) : onMenuToggle ? (
              <div className='ui-glass-control flex h-11 w-11 items-center justify-center'>
                <button
                  type='button'
                  aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                  onClick={onMenuToggle}
                  className='flex h-full w-full items-center justify-center rounded-full text-zinc-200 transition-colors hover:text-white'
                >
                  {isMenuOpen ? (
                    <X className='h-5 w-5' />
                  ) : (
                    <Menu className='h-5 w-5' />
                  )}
                </button>
              </div>
            ) : null}
            {!onMenuToggle && showBackButton ? (
              <BackButton className='ui-glass-control flex h-11 w-11 items-center justify-center text-zinc-200 hover:text-white' />
            ) : null}
          </div>

          <div className='ui-glass-pill flex h-11 items-center overflow-hidden'>
            {onSearchOpen ? (
              <>
                <button
                  type='button'
                  aria-label='Search'
                  onClick={onSearchOpen}
                  className='flex h-full w-11 items-center justify-center transition-colors hover:text-white'
                >
                  <Search className='h-5 w-5' />
                </button>
                <div className='ui-glass-divider h-5 w-px' />
              </>
            ) : null}
            <UserMenu
              avatarSize='compact'
              triggerClassName='m-0 flex h-full w-11 items-center justify-center border-0 bg-transparent text-zinc-200 shadow-none transition-colors hover:text-white'
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
