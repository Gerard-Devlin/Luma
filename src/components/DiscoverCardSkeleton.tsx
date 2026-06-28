import { ImagePlaceholder } from '@/components/ImagePlaceholder';

const DiscoverCardSkeleton = () => {
  return (
    <div className='w-full'>
      <div className='relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-white/10'>
        <ImagePlaceholder aspectRatio='aspect-[2/3]' />
        <div className='absolute bottom-2.5 right-2.5 h-6 w-12 rounded-md bg-black/55' />
      </div>
      <div className='mt-3 h-16'>
        <div className='h-4 w-28 animate-pulse rounded bg-white/15 sm:w-36' />
        <div className='mt-2 h-3.5 w-12 animate-pulse rounded bg-white/10' />
      </div>
    </div>
  );
};

export default DiscoverCardSkeleton;
