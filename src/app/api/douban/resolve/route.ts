import { NextResponse } from 'next/server';


type DoubanMediaType = 'movie' | 'tv';

interface DoubanSuggestItem {
  id?: string;
  title?: string;
  sub_title?: string;
  url?: string;
  type?: string;
  year?: string;
}

function normalizeType(value: string | null): DoubanMediaType {
  return value === 'tv' || value === 'show' ? 'tv' : 'movie';
}

function normalizeYear(value: string | null): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

function buildFallbackUrl(title: string): string {
  const params = new URLSearchParams({
    cat: '1002',
    q: title,
  });
  return `https://www.douban.com/search?${params.toString()}`;
}

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function scoreCandidate(
  item: DoubanSuggestItem,
  expectedType: DoubanMediaType,
  title: string,
  year: string
): number {
  let score = 0;
  const type = normalizeText(item.type);
  const expected = normalizeText(expectedType);
  const itemTitle = normalizeText(item.title);
  const subTitle = normalizeText(item.sub_title);
  const query = normalizeText(title);

  if (type === expected) score += 10;
  if (itemTitle === query || subTitle === query) score += 6;
  if (itemTitle.includes(query) || subTitle.includes(query)) score += 2;
  if (year && item.year === year) score += 6;

  return score;
}

async function fetchSuggest(
  title: string,
  signal: AbortSignal
): Promise<DoubanSuggestItem[]> {
  const params = new URLSearchParams({ q: title });
  const response = await fetch(
    `https://movie.douban.com/j/subject_suggest?${params.toString()}`,
    {
      signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
        Accept: 'application/json, text/plain, */*',
      },
    }
  );

  if (!response.ok) return [];

  const data = (await response.json()) as DoubanSuggestItem[];
  return Array.isArray(data) ? data : [];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || '').trim();

  if (!title) {
    return NextResponse.json(
      { error: 'missing title parameter' },
      { status: 400 }
    );
  }

  const mediaType = normalizeType(searchParams.get('type'));
  const year = normalizeYear(searchParams.get('year'));
  const fallbackUrl = buildFallbackUrl(title);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const suggestions = await fetchSuggest(title, controller.signal);

    if (suggestions.length === 0) {
      return NextResponse.redirect(fallbackUrl, 307);
    }

    const sorted = [...suggestions].sort(
      (a, b) =>
        scoreCandidate(b, mediaType, title, year) -
        scoreCandidate(a, mediaType, title, year)
    );

    const best = sorted[0];
    const subjectId = (best?.id || '').trim();
    const targetUrl =
      subjectId.length > 0
        ? `https://movie.douban.com/subject/${subjectId}/`
        : (best?.url || '').trim() || fallbackUrl;

    return NextResponse.redirect(targetUrl, 307);
  } catch {
    return NextResponse.redirect(fallbackUrl, 307);
  } finally {
    clearTimeout(timeoutId);
  }
}

