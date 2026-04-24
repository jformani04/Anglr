import { COLORS } from "@/lib/colors";
import {
  SpeciesArticle,
  SpeciesArticleSection,
  getSpeciesArticleWithCache,
} from "@/lib/speciesArticles";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Fish, RefreshCcw } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const SECTION_ORDER = [
  "quick_id",
  "look_for",
  "habitat",
  "size",
  "behavior",
  "best_baits",
  "similar",
  "handling",
  "fun_facts",
  "common_keywords",
];

type DisplaySection = SpeciesArticleSection & { key: string };

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function SpeciesArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const normalizedSlug = useMemo(
    () => (typeof slug === "string" ? slug.trim().toLowerCase() : ""),
    [slug]
  );

  const [article, setArticle] = useState<SpeciesArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  const displaySections: DisplaySection[] = useMemo(() => {
    if (!article) return [];

    const baseSections = [...article.sections];
    baseSections.sort((a, b) => {
      const aIndex = SECTION_ORDER.indexOf(a.key);
      const bIndex = SECTION_ORDER.indexOf(b.key);
      const left = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
      const right = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
      return left - right;
    });

    if (article.keywords.length > 0) {
      baseSections.push({
        key: "common_keywords",
        title: "Common Names / Keywords",
        bullets: article.keywords,
      });
    }

    return baseSections;
  }, [article]);

  const loadArticle = useCallback(async () => {
    if (!normalizedSlug) {
      setError("Missing article slug.");
      setLoading(false);
      return;
    }

    setError(null);
    setMissing(false);
    setLoading(true);
    setRefreshing(false);

    try {
      const result = await getSpeciesArticleWithCache(
        normalizedSlug,
        (cachedArticle) => {
          setArticle(cachedArticle);
          setLoading(false);
          setRefreshing(true);
        }
      );

      if (!result.article) {
        setArticle(null);
        setMissing(true);
      } else {
        setArticle(result.article);
      }
    } catch (err: any) {
      setError(err?.message ?? "Unable to load article.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [normalizedSlug]);

  useEffect(() => {
    loadArticle();
  }, [loadArticle]);

  const jumpToSection = useCallback((sectionKey: string) => {
    const y = sectionOffsets.current[sectionKey];
    if (typeof y !== "number") return;
    scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true });
  }, []);

  const fallbackName = humanizeSlug(normalizedSlug);

  if (loading && !article) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.centerTitle}>Loading article...</Text>
      </View>
    );
  }

  if (error && !article) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.centerTitle}>Could not load article</Text>
        <Text style={styles.centerSub}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadArticle}>
          <RefreshCcw color="#000" size={16} strokeWidth={2.2} />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (missing) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.centerTitle}>Article Coming Soon</Text>
        <Text style={styles.centerSub}>
          Article coming soon for this species.
        </Text>
        <Text style={styles.centerSpecies}>{fallbackName}</Text>
        <Pressable style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!article) return null;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>{article.name}</Text>
            <Text style={styles.subtitle}>
              {article.scientificName || "Scientific name unavailable"}
            </Text>
          </View>
        </View>

        {article.featuredImageUrl ? (
          <Image source={{ uri: article.featuredImageUrl }} style={styles.heroImage} />
        ) : (
          <View style={[styles.heroImage, styles.heroImageFallback]}>
            <Fish color={COLORS.textSecondary} size={52} strokeWidth={1.5} />
            <Text style={styles.heroFallbackText}>No image available</Text>
          </View>
        )}

        <View style={styles.indexCard}>
          <Text style={styles.indexTitle}>Quick Index</Text>
          <View style={styles.indexWrap}>
            {displaySections.map((section) => (
              <Pressable
                key={section.key}
                style={styles.indexChip}
                onPress={() => jumpToSection(section.key)}
              >
                <Text style={styles.indexChipText}>{section.title}</Text>
              </Pressable>
            ))}
          </View>
          {refreshing && <Text style={styles.refreshingText}>Updating article...</Text>}
        </View>

        <View style={styles.sectionsList}>
          {displaySections.map((section) => (
            <View
              key={section.key}
              onLayout={(event) => {
                sectionOffsets.current[section.key] = event.nativeEvent.layout.y;
              }}
              style={styles.sectionCard}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionBullets}>
                {section.bullets.length > 0 ? (
                  section.bullets.map((bullet, index) => (
                    <View style={styles.bulletRow} key={`${section.key}-${index}`}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{bullet}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyBullet}>No details yet.</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.updatedAt}>
          Last updated: {new Date(article.updatedAt).toLocaleDateString("en-US")}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  centerTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  centerSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  centerSpecies: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  retryButton: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  retryText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(221,220,219,0.1)",
    borderWidth: 1,
    borderColor: "rgba(221,220,219,0.2)",
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: COLORS.text,
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  heroImage: {
    width: "100%",
    height: 220,
    borderRadius: 20,
    backgroundColor: "rgba(221,220,219,0.08)",
    marginBottom: 12,
  },
  heroImageFallback: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  heroFallbackText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  heroFallbackIcon: {
    width: 28,
    height: 28,
    resizeMode: "contain",
  },
  indexCard: {
    backgroundColor: "rgba(0,0,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  indexTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  indexWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  indexChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(253,123,65,0.35)",
    backgroundColor: "rgba(253,123,65,0.14)",
  },
  indexChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  refreshingText: {
    marginTop: 8,
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  sectionsList: {
    gap: 10,
  },
  sectionCard: {
    backgroundColor: "rgba(0,0,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 12,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionBullets: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 7,
    backgroundColor: COLORS.primary,
  },
  bulletText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyBullet: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontStyle: "italic",
  },
  updatedAt: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 14,
    textAlign: "center",
  },
});
