import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { brand } from "@/lib/theme";

export const metadata: Metadata = {
  title: `Blog — ${brand.name}`,
  description:
    "Technical essays on AI discoverability, AI readiness, and AI stack management for small and mid-sized businesses.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: `Blog — ${brand.name}`,
    description:
      "Technical essays on AI discoverability, AI readiness, and AI stack management for small and mid-sized businesses.",
    type: "website",
  },
};

const TOPIC_LABELS: Record<string, string> = {
  "ai-discoverability": "AI Discoverability",
  "ai-readiness": "AI Readiness",
  "ai-stack": "AI Stack Management",
};

export default function BlogIndex() {
  const posts = getAllPosts();
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ marginBottom: 8 }}>Blog</h1>
      <p style={{ opacity: 0.8, marginBottom: 32 }}>
        Technical essays on making small businesses visible, ready, and effective in an
        AI-first world.
      </p>
      {posts.length === 0 && <p>No posts yet. First one lands soon.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {posts.map((p) => (
          <article
            key={p.slug}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 24,
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
              {p.date}
              {TOPIC_LABELS[p.topic] ? ` · ${TOPIC_LABELS[p.topic]}` : ""}
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>
              <Link href={`/blog/${p.slug}`} style={{ color: "var(--on-surface)", textDecoration: "none" }}>
                {p.title}
              </Link>
            </h2>
            <p style={{ opacity: 0.85, margin: 0 }}>{p.description}</p>
            <Link
              href={`/blog/${p.slug}`}
              style={{ display: "inline-block", marginTop: 12, color: "var(--accent-on-surface)" }}
            >
              Read the essay →
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}
