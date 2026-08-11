import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { siteOrigin } from "@/lib/util";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const posts = getAllPosts().map((p) => ({
    url: `${origin}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));
  return [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/blog`, changeFrequency: "daily", priority: 0.9 },
    ...posts,
  ];
}
