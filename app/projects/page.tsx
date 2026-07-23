import { prisma } from "@/lib/db";
import { safeTags } from "@/lib/knowledge";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [projects, links, photos] = await Promise.all([
    prisma.project.findMany({ orderBy: { order: "asc" } }),
    prisma.link.findMany({ where: { status: "scanned" }, orderBy: { createdAt: "desc" } }),
    prisma.photo.findMany({ where: { kind: "gallery" }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <Link href="/" style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 18, color: "var(--text)" }}>
          ← Blake
        </Link>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Projects & posts</span>
      </header>

      <h1 style={{ fontSize: 40, marginBottom: 8 }}>What I&apos;m building</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 40 }}>
        Curated projects, recent posts, and links — the same knowledge my chatbot draws from.
      </p>

      {projects.length > 0 && (
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, marginBottom: 16 }}>Projects</h2>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {projects.map((p) => (
              <a
                key={p.id}
                href={p.url || undefined}
                style={card}
                target={p.url ? "_blank" : undefined}
                rel="noreferrer"
              >
                <h3 style={{ fontSize: 18, marginBottom: 6 }}>{p.name}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{p.blurb}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {links.length > 0 && (
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, marginBottom: 16 }}>Recent posts & links</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {links.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noreferrer" style={card}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={kindTag}>{l.kind}</span>
                  <h3 style={{ fontSize: 16 }}>{l.title || l.url}</h3>
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{l.summary}</p>
                {safeTags(l.tags).length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {safeTags(l.tags).map((t) => (
                      <span key={t} style={miniTag}>
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section>
          <h2 style={{ fontSize: 22, marginBottom: 16 }}>Gallery</h2>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {photos.map((ph) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={ph.id}
                src={`/api/uploads/${ph.filename}`}
                alt={ph.caption || "photo"}
                style={{ width: "100%", borderRadius: 12, border: "1px solid var(--border)" }}
              />
            ))}
          </div>
        </section>
      )}

      {projects.length === 0 && links.length === 0 && photos.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          Nothing added yet. Head to the <Link href="/admin">admin portal</Link> to add projects,
          links, and photos.
        </p>
      )}
    </main>
  );
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 18,
  color: "var(--text)",
  textDecoration: "none",
  display: "block",
};
const kindTag: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--accent)",
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "2px 8px",
};
const miniTag: React.CSSProperties = { fontSize: 12, color: "var(--primary-soft)" };
