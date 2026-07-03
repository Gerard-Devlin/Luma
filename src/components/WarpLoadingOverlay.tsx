'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface WarpLoadingOverlayProps {
  visible?: boolean;
  className?: string;
}

const Warp = dynamic(
  () => import('@paper-design/shaders-react').then((mod) => mod.Warp),
  { ssr: false }
);

export default function WarpLoadingOverlay({
  visible = true,
  className,
}: WarpLoadingOverlayProps) {
  const [size, setSize] = useState({ width: 1280, height: 720 });

  useEffect(() => {
    if (!visible) return;

    const updateSize = () => {
      setSize({
        width: Math.ceil(window.innerWidth),
        height: Math.ceil(window.innerHeight),
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[2000] overflow-hidden bg-black',
        className
      )}
    >
      <Warp
        width={size.width}
        height={size.height}
        colors={[
          '#3c1515',
          '#944752',
          '#ffc085',
          '#8838ff',
          '#33cc99',
          '#3399cc',
          '#3333cc',
        ]}
        proportion={0.5}
        softness={1}
        distortion={0.09}
        swirl={0.9}
        swirlIterations={6}
        shape='checks'
        shapeScale={0.25}
        speed={3}
        scale={2.5}
        rotation={1.35}
        className='h-full w-full'
      />
    </div>
  );
}
