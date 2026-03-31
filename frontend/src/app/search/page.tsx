"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SearchResult {
  title: string;
  url: string;
  image: string;
  anime_id: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const router = useRouter();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.searchAnime(query);
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (anime: SearchResult) => {
    // Navigate to download page with URL and image pre-filled
    const params = new URLSearchParams({ url: anime.url });
    if (anime.image) params.set("image", anime.image);
    router.push(`/download?${params.toString()}`);
  };

  return (
    <div className="space-y-8 animate-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search for anime to download
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3">
        <Input
          placeholder="Search anime by title..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
          autoFocus
        />
        <Button type="submit" disabled={loading || query.length < 2}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {/* Loading skeletons */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-border overflow-hidden">
              <Skeleton className="h-56 rounded-none" />
              <CardContent className="pt-3">
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results grid */}
      {!loading && results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((anime) => (
            <Card
              key={anime.url}
              className="group cursor-pointer overflow-hidden border-border transition-colors duration-200 hover:border-primary/40"
              onClick={() => handleSelect(anime)}
            >
              {anime.image ? (
                <div className="relative h-56 overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={anime.image}
                    alt={anime.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute bottom-3 left-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/90 px-2 py-1 text-xs font-medium text-primary-foreground">
                      ↓ Download
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex h-56 items-center justify-center bg-muted/50 text-muted-foreground text-sm">
                  No Image
                </div>
              )}
              <CardHeader className="p-4">
                <CardTitle className="text-sm leading-snug line-clamp-2">
                  {anime.title}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && searched && results.length === 0 && (
        <Card className="border-border">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              No results found for &quot;{query}&quot;
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
