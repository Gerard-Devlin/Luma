export type CuratedMediaType = 'movie' | 'tv';

export interface CuratedCategoryConfig {
  slug: string;
  title: string;
  mediaType: CuratedMediaType;
  query: Record<string, string>;
  fallbackQuery?: Record<string, string>;
}

export const TOP_RATED_CATEGORY_CONFIGS: CuratedCategoryConfig[] = [
  {
    slug: 'top-rated-movies',
    title: 'Top Rated Movies',
    mediaType: 'movie',
    query: {
      sort_by: 'vote_average.desc',
      vote_average_gte: '7.0',
      vote_count_gte: '3000',
    },
    fallbackQuery: {
      sort_by: 'popularity.desc',
      vote_count_gte: '1000',
    },
  },
  {
    slug: 'top-rated-tvshows',
    title: 'Top Rated Series',
    mediaType: 'tv',
    query: {
      sort_by: 'vote_average.desc',
      vote_average_gte: '7.0',
      vote_count_gte: '500',
    },
    fallbackQuery: {
      sort_by: 'popularity.desc',
      vote_count_gte: '300',
    },
  },
];

export const HOME_CURATED_CATEGORY_CONFIGS: CuratedCategoryConfig[] = [
  {
    slug: 'early-2000s-movies',
    title: '2000s Movies',
    mediaType: 'movie',
    query: {
      release_from: '2000-01-01',
      release_to: '2009-12-31',
      vote_count_gte: '100',
      vote_average_gte: '6.0',
      without_genres: '10749',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'popular-movies',
    title: 'Popular Movies',
    mediaType: 'movie',
    query: {
      vote_count_gte: '500',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'popular-tvshows',
    title: 'Popular Series',
    mediaType: 'tv',
    query: {
      with_origin_country: 'US',
      vote_count_gte: '100',
      vote_average_gte: '6.5',
      release_from: '2010-01-01',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'nolan-films',
    title: 'Christopher Nolan Movies',
    mediaType: 'movie',
    query: {
      with_people: '525',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'scifi-fantasy-movies',
    title: 'Sci-Fi & Fantasy Movies',
    mediaType: 'movie',
    query: {
      with_genres: '878|14',
      vote_count_gte: '150',
      vote_average_gte: '6.2',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'binge-worthy-series',
    title: 'Binge-Worthy Series',
    mediaType: 'tv',
    query: {
      with_genres: '18|35|80|10759|10765',
      with_origin_country: 'US',
      vote_count_gte: '80',
      vote_average_gte: '6.5',
      release_from: '2010-01-01',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'comedy-movies',
    title: 'Comedy Movies',
    mediaType: 'movie',
    query: {
      with_genres: '35',
      vote_count_gte: '100',
      vote_average_gte: '6.0',
      runtime_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'a24-films',
    title: 'A24 Movies',
    mediaType: 'movie',
    query: {
      with_companies: '41077',
      vote_count_gte: '20',
      vote_average_gte: '5.5',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'thriller-movies',
    title: 'Thriller Movies',
    mediaType: 'movie',
    query: {
      with_genres: '53',
      vote_count_gte: '150',
      vote_average_gte: '6.3',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'limited-series',
    title: 'Limited Series',
    mediaType: 'tv',
    query: {
      with_type: '2',
      vote_average_gte: '7.5',
      vote_count_gte: '30',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'drama-movies',
    title: 'Drama Movies',
    mediaType: 'movie',
    query: {
      with_genres: '18',
      vote_count_gte: '150',
      vote_average_gte: '6.8',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'critically-acclaimed',
    title: 'Critically Acclaimed',
    mediaType: 'movie',
    query: {
      vote_average_gte: '7.8',
      vote_count_gte: '1500',
      without_genres: '99,10770,10749',
      runtime_gte: '90',
      sort_by: 'vote_average.desc',
    },
  },
  {
    slug: 'eighties-movies',
    title: '80s Movies',
    mediaType: 'movie',
    query: {
      release_from: '1980-01-01',
      release_to: '1989-12-31',
      vote_count_gte: '100',
      vote_average_gte: '6.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'reality-tv',
    title: 'Reality TV',
    mediaType: 'tv',
    query: {
      with_genres: '10764',
      vote_count_gte: '50',
      vote_average_gte: '6.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'nineties-movies',
    title: '90s Movies',
    mediaType: 'movie',
    query: {
      release_from: '1990-01-01',
      release_to: '1999-12-31',
      vote_count_gte: '150',
      vote_average_gte: '6.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'romcom-movies',
    title: 'Romantic Comedies',
    mediaType: 'movie',
    query: {
      with_genres: '10749,35',
      vote_count_gte: '80',
      vote_average_gte: '6.0',
      runtime_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'docuseries',
    title: 'Docuseries',
    mediaType: 'tv',
    query: {
      with_genres: '99',
      vote_count_gte: '30',
      vote_average_gte: '7.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'hidden-gems',
    title: 'Hidden Gems',
    mediaType: 'movie',
    query: {
      vote_average_gte: '7.3',
      vote_count_gte: '500',
      vote_count_lte: '5000',
      without_genres: '99,10770,10749',
      runtime_gte: '85',
      sort_by: 'vote_average.desc',
    },
  },
  {
    slug: 'marvel-mcu',
    title: 'Marvel Cinematic Universe',
    mediaType: 'movie',
    query: {
      with_companies: '420',
      vote_count_gte: '100',
      vote_average_gte: '6.0',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'horror-movies',
    title: 'Horror Movies',
    mediaType: 'movie',
    query: {
      with_genres: '27',
      vote_count_gte: '100',
      vote_average_gte: '5.8',
      runtime_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'crime-movies',
    title: 'Crime Movies',
    mediaType: 'movie',
    query: {
      with_genres: '80',
      vote_count_gte: '150',
      vote_average_gte: '6.5',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'mystery-movies',
    title: 'Mystery Movies',
    mediaType: 'movie',
    query: {
      with_genres: '9648',
      vote_count_gte: '100',
      vote_average_gte: '6.3',
      runtime_gte: '90',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'warner-bros',
    title: 'Warner Bros. Movies',
    mediaType: 'movie',
    query: {
      with_companies: '174',
      vote_count_gte: '20',
      vote_average_gte: '5.5',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'universal-films',
    title: 'Universal Pictures Movies',
    mediaType: 'movie',
    query: {
      with_companies: '33',
      vote_count_gte: '20',
      vote_average_gte: '5.5',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'spielberg-films',
    title: 'Steven Spielberg Movies',
    mediaType: 'movie',
    query: {
      with_people: '488',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'scorsese-films',
    title: 'Martin Scorsese Movies',
    mediaType: 'movie',
    query: {
      with_people: '1032',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'fincher-films',
    title: 'David Fincher Movies',
    mediaType: 'movie',
    query: {
      with_people: '7467',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'villeneuve-films',
    title: 'Denis Villeneuve Movies',
    mediaType: 'movie',
    query: {
      with_people: '27571',
      vote_count_gte: '80',
      sort_by: 'popularity.desc',
    },
  },
  {
    slug: 'blockbuster-hits',
    title: 'Blockbuster Hits',
    mediaType: 'movie',
    query: {
      vote_count_gte: '3000',
      vote_average_gte: '6.5',
      runtime_gte: '100',
      without_genres: '99,10770,10749',
      sort_by: 'revenue.desc',
    },
  },
];

export const ALL_CURATED_CATEGORY_CONFIGS: CuratedCategoryConfig[] = [
  ...TOP_RATED_CATEGORY_CONFIGS,
  ...HOME_CURATED_CATEGORY_CONFIGS,
];

const curatedMap = new Map(
  ALL_CURATED_CATEGORY_CONFIGS.map((item) => [item.slug, item])
);

export function getCuratedCategoryBySlug(
  slug: string
): CuratedCategoryConfig | null {
  return curatedMap.get(slug) || null;
}

export function buildCuratedCategoryQuery(
  config: CuratedCategoryConfig,
  page = 1,
  useFallback = false
): URLSearchParams {
  const params = new URLSearchParams({
    media: config.mediaType,
    include_adult: 'false',
    page: String(Math.max(1, page)),
  });

  const query = useFallback && config.fallbackQuery ? config.fallbackQuery : config.query;
  Object.entries(query).forEach(([key, value]) => {
    if (!value) return;
    params.set(key, value);
  });

  return params;
}
