const ImagePlaceholder = ({ aspectRatio }: { aspectRatio: string }) => (
  <div
    className={`skeleton-card-surface w-full animate-pulse ${aspectRatio}`}
  />
);

export { ImagePlaceholder };
