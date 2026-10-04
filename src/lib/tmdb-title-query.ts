// Keep whitespace out of the separator alternatives so adjacent quantifiers
// cannot partition the same whitespace run in quadratically many ways.
const SOURCE_CODE_PATTERN = /\b[a-z]{2,6}(?:\s*[-_]\s*|\s+)\d{2,6}\b/i;
const COMPACT_SOURCE_CODE_PATTERN = /\b[a-z]{2,6}\d{2,6}\b/i;

export function hasSourceCodeInTitle(title: string): boolean {
  return (
    SOURCE_CODE_PATTERN.test(title) || COMPACT_SOURCE_CODE_PATTERN.test(title)
  );
}
