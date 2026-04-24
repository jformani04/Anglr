import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

export interface SpeciesArticleSection {
  key: string;
  title: string;
  bullets: string[];
}

export interface SpeciesArticle {
  id: string;
  slug: string;
  name: string;
  scientificName: string | null;
  featuredImageUrl: string | null;
  keywords: string[];
  sections: SpeciesArticleSection[];
  updatedAt: string;
}

export interface SpeciesArticleSummary {
  slug: string;
  name: string;
  featuredImageUrl: string | null;
}

type SpeciesArticleRow = {
  id: string;
  slug: string;
  name: string;
  scientific_name: string | null;
  featured_image_url: string | null;
  keywords: string[] | null;
  sections: unknown;
  updated_at: string;
};

const CACHE_PREFIX = "species_article:";

function mapSection(raw: unknown): SpeciesArticleSection | null {
  if (!raw || typeof raw !== "object") return null;

  const maybe = raw as {
    key?: unknown;
    title?: unknown;
    bullets?: unknown;
  };

  if (typeof maybe.key !== "string" || typeof maybe.title !== "string") {
    return null;
  }

  const bullets = Array.isArray(maybe.bullets)
    ? maybe.bullets.filter((item): item is string => typeof item === "string")
    : [];

  return {
    key: maybe.key,
    title: maybe.title,
    bullets,
  };
}

function mapRowToArticle(row: SpeciesArticleRow): SpeciesArticle {
  const rawSections = Array.isArray(row.sections) ? row.sections : [];
  const sections = rawSections
    .map(mapSection)
    .filter((section): section is SpeciesArticleSection => section !== null);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    scientificName: row.scientific_name,
    featuredImageUrl: row.featured_image_url,
    keywords: row.keywords ?? [],
    sections,
    updatedAt: row.updated_at,
  };
}

function mapRowToSummary(row: {
  slug: string;
  name: string;
  featured_image_url: string | null;
}): SpeciesArticleSummary {
  return {
    slug: row.slug,
    name: row.name,
    featuredImageUrl: row.featured_image_url,
  };
}

function getCacheKey(slug: string) {
  return `${CACHE_PREFIX}${slug}`;
}

export function speciesNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function getSpeciesArticleBySlug(
  slug: string
): Promise<SpeciesArticle | null> {
  const { data, error } = await supabase
    .from("species_articles")
    .select(
      "id, slug, name, scientific_name, featured_image_url, keywords, sections, updated_at"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapRowToArticle(data as SpeciesArticleRow);
}

export async function getSpeciesArticleSummaries(): Promise<
  SpeciesArticleSummary[]
> {
  const { data, error } = await supabase
    .from("species_articles")
    .select("slug, name, featured_image_url");

  if (error) throw error;

  return (data ?? []).map((row) =>
    mapRowToSummary(
      row as {
        slug: string;
        name: string;
        featured_image_url: string | null;
      }
    )
  );
}

export async function getCachedSpeciesArticle(
  slug: string
): Promise<SpeciesArticle | null> {
  const raw = await AsyncStorage.getItem(getCacheKey(slug));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SpeciesArticle;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setCachedSpeciesArticle(
  slug: string,
  article: SpeciesArticle
): Promise<void> {
  await AsyncStorage.setItem(getCacheKey(slug), JSON.stringify(article));
}

export interface SpeciesArticleWithCacheResult {
  article: SpeciesArticle | null;
  fromCache: boolean;
  updatedFromNetwork: boolean;
}

export async function getSpeciesArticleWithCache(
  slug: string,
  onCached?: (article: SpeciesArticle) => void
): Promise<SpeciesArticleWithCacheResult> {
  const cached = await getCachedSpeciesArticle(slug);
  if (cached) onCached?.(cached);

  try {
    const fresh = await getSpeciesArticleBySlug(slug);
    if (!fresh) {
      return {
        article: cached ?? null,
        fromCache: Boolean(cached),
        updatedFromNetwork: false,
      };
    }

    const updatedFromNetwork =
      !cached || fresh.updatedAt !== cached.updatedAt;

    if (updatedFromNetwork) {
      await setCachedSpeciesArticle(slug, fresh);
    }

    return {
      article: fresh,
      fromCache: false,
      updatedFromNetwork,
    };
  } catch (error) {
    if (cached) {
      return {
        article: cached,
        fromCache: true,
        updatedFromNetwork: false,
      };
    }
    throw error;
  }
}
