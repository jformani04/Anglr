import { COLORS } from "@/lib/colors";
import { getSpeciesArticleWithCache, speciesNameToSlug } from "@/lib/speciesArticles";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

type SpeciesGuideLinkProps = {
  speciesName?: string | null;
  style?: ViewStyle;
};

export default function SpeciesGuideLink({
  speciesName,
  style,
}: SpeciesGuideLinkProps) {
  const normalizedSpecies = useMemo(
    () => String(speciesName ?? "").trim(),
    [speciesName]
  );
  const [articleSlug, setArticleSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!normalizedSpecies) {
      setArticleSlug(null);
      return;
    }

    const slug = speciesNameToSlug(normalizedSpecies);
    if (!slug) {
      setArticleSlug(null);
      return;
    }

    const load = async () => {
      try {
        const result = await getSpeciesArticleWithCache(slug, (cachedArticle) => {
          if (!cancelled && cachedArticle) {
            setArticleSlug(cachedArticle.slug);
          }
        });

        if (!cancelled) {
          setArticleSlug(result.article?.slug ?? null);
        }
      } catch {
        if (!cancelled) {
          setArticleSlug(null);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [normalizedSpecies]);

  if (!articleSlug) return null;

  return (
    <Pressable
      style={[styles.linkCard, style]}
      onPress={() =>
        router.push({
          pathname: "/articles/[slug]",
          params: { slug: articleSlug },
        })
      }
    >
      <Text style={styles.linkText}>View Species Guide</Text>
      <ChevronRight color={COLORS.primary} size={16} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linkCard: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(253,123,65,0.28)",
    backgroundColor: "rgba(253,123,65,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  linkText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
});
