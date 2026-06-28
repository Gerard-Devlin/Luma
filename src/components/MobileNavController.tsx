'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';

import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import MobileSearchOverlay from './MobileSearchOverlay';

interface MobileNavControllerProps {
  activePath?: string;
  showBackButton?: boolean;
  useHeroHeaderStyle?: boolean;
}

const MobileNavController = ({
  activePath,
  showBackButton = false,
  useHeroHeaderStyle = false,
}: MobileNavControllerProps) => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const showTopSearch = pathname !== '/search';
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);
  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);
  const handleOpenSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);
  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  return (
    <>
      <MobileHeader
        showBackButton={showBackButton}
        isMenuOpen={isOpen}
        onMenuToggle={handleToggle}
        onSearchOpen={showTopSearch ? handleOpenSearch : undefined}
        isHomePage={activePath === '/' || useHeroHeaderStyle}
      />
      <MobileBottomNav
        activePath={activePath}
        isOpen={isOpen}
        onClose={handleClose}
        onMenuToggle={handleToggle}
        showBackButton={showBackButton}
        useHeroHeaderStyle={useHeroHeaderStyle}
      />
      {showTopSearch ? (
        <MobileSearchOverlay open={isSearchOpen} onClose={handleCloseSearch} />
      ) : null}
    </>
  );
};

export default MobileNavController;
