'use client';

import { type ReactNode, CSSProperties } from 'react';

import { cn } from '@/lib/utils';

interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <main>
      <div
        className={cn(
          'transition-bg relative flex h-[100vh] flex-col items-center justify-center bg-zinc-50 text-slate-950 dark:bg-zinc-900',
          className
        )}
        {...props}
      >
        <div
          className='absolute inset-0 overflow-hidden'
          style={
            {
              '--aurora':
                'repeating-linear-gradient(100deg,#164e9b_10%,#1e88e5_18%,#0ea5e9_26%,#34d399_34%,#a855f7_42%)',
              '--dark-gradient':
                'repeating-linear-gradient(100deg,#010409_0%,#010409_7%,transparent_10%,transparent_20%,#010409_16%)',
              '--white-gradient':
                'repeating-linear-gradient(100deg,#f8fafc_0%,#e0f2fe_7%,transparent_10%,transparent_20%,#fae8ff_16%)',
              '--blue-300': '#34d399',
              '--blue-400': '#0ea5e9',
              '--blue-500': '#164e9b',
              '--indigo-300': '#4c1d95',
              '--violet-200': '#a855f7',
              '--black': '#000',
              '--white': '#fff',
              '--transparent': 'transparent',
            } as CSSProperties
          }
        >
          <div
            className={cn(
              `after:animate-aurora pointer-events-none absolute -inset-[10px] [background-image:var(--white-gradient),var(--aurora)] [background-size:300%,_200%] [background-position:50%_50%,50%_50%] opacity-50 blur-[10px] invert filter will-change-transform [--aurora:repeating-linear-gradient(100deg,var(--blue-500)_10%,var(--indigo-300)_15%,var(--blue-300)_20%,var(--violet-200)_25%,var(--blue-400)_30%)] [--dark-gradient:repeating-linear-gradient(100deg,var(--black)_0%,var(--black)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--black)_16%)] [--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)] after:absolute after:inset-0 after:[background-image:var(--white-gradient),var(--aurora)] after:[background-size:200%,_100%] after:[background-attachment:fixed] after:mix-blend-difference after:content-[""] motion-reduce:after:animate-none motion-reduce:after:opacity-0 dark:[background-image:var(--dark-gradient),var(--aurora)] dark:invert-0 after:dark:[background-image:var(--dark-gradient),var(--aurora)]`,
              showRadialGradient &&
                '[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]'
            )}
          />
        </div>
        {children}
      </div>
    </main>
  );
};
