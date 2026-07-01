export interface IdentifiableListItem {
  id: string;
}

export function uniqueById<T extends IdentifiableListItem>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function mergeUniqueById<T extends IdentifiableListItem>(
  previousItems: T[],
  nextItems: T[]
): T[] {
  if (previousItems.length === 0) return uniqueById(nextItems);

  const seen = new Set(previousItems.map((item) => item.id));
  const merged = [...previousItems];

  for (const item of nextItems) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }

  return merged;
}
