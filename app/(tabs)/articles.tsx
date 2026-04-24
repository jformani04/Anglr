import { COLORS } from "@/lib/colors";
import { FRESHWATER_SPECIES } from "@/lib/freshwaterSpecies";
import {
  getSpeciesArticleSummaries,
  speciesNameToSlug,
} from "@/lib/speciesArticles";
import { router } from "expo-router";
import { ArrowLeft, Fish, Search } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type SpeciesListItem = {
  name: string;
  slug: string;
  summary: string;
  imageUrl: string | null;
};

const LOCAL_SPECIES: SpeciesListItem[] = FRESHWATER_SPECIES.map((name) => ({
  name,
  slug: speciesNameToSlug(name),
  summary: "",
  imageUrl: null,
}));

export default function ArticlesScreen() {
  const [query, setQuery] = useState("");
  const [speciesImagesBySlug, setSpeciesImagesBySlug] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    let cancelled = false;

    getSpeciesArticleSummaries()
      .then((summaries) => {
        if (cancelled) return;

        const nextImages: Record<string, string> = {};
        for (const summary of summaries) {
          if (summary.featuredImageUrl) {
            nextImages[summary.slug] = summary.featuredImageUrl;
          }
        }

        setSpeciesImagesBySlug(nextImages);
      })
      .catch(() => {
        if (!cancelled) setSpeciesImagesBySlug({});
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const speciesList = useMemo(
    () =>
      LOCAL_SPECIES.map((item) => ({
        ...item,
        imageUrl: speciesImagesBySlug[item.slug] ?? null,
      })),
    [speciesImagesBySlug]
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return speciesList;
    return speciesList.filter((item) =>
      item.name.toLowerCase().includes(normalized)
    );
  }, [query, speciesList]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/(tabs)/home")} style={styles.backButton}>
          <ArrowLeft color={COLORS.text} size={20} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Species Articles</Text>
          <Text style={styles.subtitle}>{LOCAL_SPECIES.length} freshwater species</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search color={COLORS.textSecondary} size={16} strokeWidth={2.2} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search species"
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            style={styles.itemCard}
            onPress={() =>
              router.push({
                pathname: "/articles/[slug]",
                params: { slug: item.slug },
              })
            }
          >
            <View style={styles.thumb}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.thumbImage} />
              ) : (
                <Fish color={COLORS.textSecondary} size={28} strokeWidth={1.5} />
              )}
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemSummary} numberOfLines={1}>
                {item.summary || "Tap to read this field guide article"}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No species found</Text>
            <Text style={styles.emptySub}>Try a different search term.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 48,
    paddingHorizontal: 16,
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
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 40,
    gap: 8,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(221,220,219,0.08)",
    padding: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.16)",
    overflow: "hidden",
  },
  thumbIcon: {
    width: 28,
    height: 28,
    resizeMode: "contain",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  itemBody: {
    flex: 1,
  },
  itemName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  itemSummary: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  emptyState: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(221,220,219,0.08)",
    padding: 16,
    alignItems: "center",
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  emptySub: {
    marginTop: 4,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
});
