import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getPost } from "@/lib/blog";
import { brand } from "@/lib/theme";
import { siteOrigin } from "@/lib/util";
import { BlogMarkdown } from "../BlogMarkdown";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — ${brand.name}`,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      authors: [brand.name],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const origin = siteOrigin();
  // Article structured data so search engines and AI answer engines can
  // attribute the piece — the whole point of the authority play.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Person", name: brand.name, url: origin },
    publisher: { "@type": "Person", name: brand.name, url: origin },
    mainEntityOfPage: `${origin}/blog/${post.slug}`,
    keywords: post.keywords.join(", "),
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/blog" style={{ color: "var(--accent-on-bg)", fontSize: 14 }}>
        ← All posts
      </Link>
      <article>
        <header style={{ margin: "24px 0 32px" }}>
          <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 8 }}>{post.date}</div>
          <h1 style={{ lineHeight: 1.2 }}>{post.title}</h1>
          <p style={{ opacity: 0.8, marginTop: 12, fontSize: 18 }}>{post.description}</p>
        </header>
        <BlogMarkdown markdown={post.body} />
      </article>
    </main>
  );
}

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}
