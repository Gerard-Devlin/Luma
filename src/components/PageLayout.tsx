import BackToTop from './BackToTop';
import DesktopTopHistory from './DesktopTopHistory';
import DesktopTopSearch from './DesktopTopSearch';
import MobileNavController from './MobileNavController';
import Sidebar from './Sidebar';
import { UserMenu } from './UserMenu';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  disableMobileTopPadding?: boolean;
  forceShowBackButton?: boolean;
  showDesktopTopSearch?: boolean;
}

const PageLayout = ({
  children,
  activePath = '/',
  disableMobileTopPadding = false,
  forceShowBackButton = false,
  showDesktopTopSearch = false,
}: PageLayoutProps) => {
  const isHomePage = activePath === '/';
  const showBackButton = forceShowBackButton || ['/play'].includes(activePath);

  return (
    <div className='w-full min-h-screen'>
      <MobileNavController
        activePath={activePath}
        showBackButton={showBackButton}
        useHeroHeaderStyle={isHomePage || disableMobileTopPadding}
      />

      <div className='flex md:grid md:grid-cols-[auto_1fr] w-full min-h-screen md:min-h-auto'>
        <div className='hidden md:block'>
          <Sidebar activePath={activePath} showBackButton={showBackButton} />
        </div>

        <div className='relative min-w-0 flex-1 transition-all duration-300'>
          <div className='absolute right-4 top-4 z-[700] hidden md:flex items-center gap-2 [&>*]:m-0'>
            {showDesktopTopSearch ? (
              <>
                <div className='shrink-0'>
                  <DesktopTopSearch />
                </div>
                <div className='shrink-0'>
                  <DesktopTopHistory />
                </div>
              </>
            ) : null}
            <div className='shrink-0'>
              <UserMenu />
            </div>
          </div>

          <main
            className={`flex-1 md:min-h-0 ${
              isHomePage || disableMobileTopPadding
                ? 'pt-0 md:pt-0'
                : 'pt-[calc(env(safe-area-inset-top)+4rem)] md:pt-0'
            }`}
            style={{
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {children}
          </main>
          <BackToTop />
        </div>
      </div>
    </div>
  );
};

export default PageLayout;
