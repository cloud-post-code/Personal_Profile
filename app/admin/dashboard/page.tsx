import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { prisma, getProfile } from "@/lib/db";
import { safeTags } from "@/lib/knowledge";
import {
  logout,
  saveProfile,
  addProject,
  deleteProject,
  addLink,
  rescanLink,
  updateLinkSummary,
  deleteLink,
  uploadPhoto,
  deletePhoto,
} from "../actions";
import { panel, field, btn, btnGhost, btnDanger, SectionTitle, Label } from "../ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  if (!(await isAuthed())) redirect("/admin");

  const [profile, projects, links, photos] = await Promise.all([
    getProfile(),
    prisma.project.findMany({ orderBy: { order: "asc" } }),
    prisma.link.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.photo.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "24px 20px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Control room</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Everything here feeds the chatbot & site.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="/" style={btnGhost as React.CSSProperties}>
            View site
          </a>
          <form action={logout}>
            <button style={btnGhost as React.CSSProperties}>Log out</button>
          </form>
        </div>
      </header>

      {/* ── PROFILE / PERSONA ── */}
      <section style={panel}>
        <SectionTitle>Profile & persona</SectionTitle>
        <form action={saveProfile}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <Label>Name</Label>
              <input name="name" defaultValue={profile.name} style={field} />
            </div>
            <div>
              <Label>Tagline</Label>
              <input name="tagline" defaultValue={profile.tagline} style={field} />
            </div>
          </div>
          <Label>Bio (facts the bot can state about you)</Label>
          <textarea name="bio" defaultValue={profile.bio} rows={4} style={{ ...field, resize: "vertical" }} />
          <Label>Persona (how the bot should talk — voice, worldview)</Label>
          <textarea name="persona" defaultValue={profile.persona} rows={3} style={{ ...field, resize: "vertical" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <Label>Email</Label>
              <input name="email" defaultValue={profile.email} style={field} />
            </div>
            <div>
              <Label>LinkedIn URL</Label>
              <input name="linkedin" defaultValue={profile.linkedin} style={field} />
            </div>
            <div>
              <Label>GitHub URL</Label>
              <input name="github" defaultValue={profile.github} style={field} />
            </div>
          </div>
          <button style={btn}>Save profile</button>
        </form>
      </section>

      {/* ── LINKS ── */}
      <section style={panel}>
        <SectionTitle>Links — scanned & summarized by Claude</SectionTitle>
        <form action={addLink} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            name="url"
            placeholder="https://linkedin.com/posts/…  or any URL"
            style={{ ...field, marginBottom: 0, flex: 1 }}
          />
          <button style={btn}>Scan link</button>
        </form>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16 }}>
          Fetches the page, extracts text, and asks Claude for a summary + tags. LinkedIn often
          blocks bots — if a scan is thin, edit the summary manually below.
        </p>

        {links.length === 0 && <Empty>No links yet.</Empty>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {links.map((l) => (
            <div key={l.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                    <StatusPill status={l.status} />
                    <strong style={{ fontSize: 14 }}>{l.title || l.url}</strong>
                  </div>
                  <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, wordBreak: "break-all" }}>
                    {l.url}
                  </a>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <form action={rescanLink}>
                    <input type="hidden" name="id" value={l.id} />
                    <button style={btnGhost as React.CSSProperties}>Rescan</button>
                  </form>
                  <form action={deleteLink}>
                    <input type="hidden" name="id" value={l.id} />
                    <button style={btnDanger as React.CSSProperties}>Delete</button>
                  </form>
                </div>
              </div>
              {l.error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{l.error}</p>}
              <form action={updateLinkSummary} style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={l.id} />
                <textarea
                  name="summary"
                  defaultValue={l.summary ?? ""}
                  rows={2}
                  placeholder="Summary the chatbot will use…"
                  style={{ ...field, marginBottom: 8, resize: "vertical" }}
                />
                {safeTags(l.tags).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {safeTags(l.tags).map((t) => (
                      <span key={t} style={{ fontSize: 11, color: "var(--primary-soft)" }}>
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <button style={btnGhost as React.CSSProperties}>Save summary</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROJECTS ── */}
      <section style={panel}>
        <SectionTitle>Projects</SectionTitle>
        <form action={addProject}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input name="name" placeholder="Project name" style={field} />
            <input name="url" placeholder="URL (optional)" style={field} />
          </div>
          <textarea name="blurb" placeholder="Short description" rows={2} style={{ ...field, resize: "vertical" }} />
          <input name="order" type="number" placeholder="Order (0 = first)" style={{ ...field, maxWidth: 160 }} />
          <div>
            <button style={btn}>Add project</button>
          </div>
        </form>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.length === 0 && <Empty>No projects yet.</Empty>}
          {projects.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 14px",
              }}
            >
              <div>
                <strong style={{ fontSize: 14 }}>{p.name}</strong>
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{p.blurb}</p>
              </div>
              <form action={deleteProject}>
                <input type="hidden" name="id" value={p.id} />
                <button style={btnDanger as React.CSSProperties}>Delete</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      {/* ── PHOTOS ── */}
      <section style={panel}>
        <SectionTitle>Photos</SectionTitle>
        <form action={uploadPhoto} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="file" name="file" accept="image/*" required style={{ ...field, marginBottom: 0, maxWidth: 260 }} />
          <input name="caption" placeholder="Caption (optional)" style={{ ...field, marginBottom: 0, flex: 1 }} />
          <select name="kind" style={{ ...field, marginBottom: 0, maxWidth: 140 }}>
            <option value="gallery">Gallery</option>
            <option value="project">Project</option>
            <option value="profile">Profile</option>
          </select>
          <button style={btn}>Upload</button>
        </form>
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 10,
          }}
        >
          {photos.length === 0 && <Empty>No photos yet.</Empty>}
          {photos.map((ph) => (
            <div key={ph.id} style={{ position: "relative" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/uploads/${ph.filename}`}
                alt={ph.caption || "photo"}
                style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)", display: "block" }}
              />
              <form action={deletePhoto} style={{ position: "absolute", top: 6, right: 6 }}>
                <input type="hidden" name="id" value={ph.id} />
                <button
                  style={{
                    ...btnDanger,
                    padding: "2px 8px",
                    background: "rgba(11,16,32,0.8)",
                  } as React.CSSProperties}
                >
                  ✕
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{children}</p>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    scanned: { c: "var(--success)", t: "scanned" },
    pending: { c: "var(--accent)", t: "pending" },
    failed: { c: "var(--danger)", t: "failed" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: s.c,
        border: `1px solid ${s.c}`,
        borderRadius: 999,
        padding: "1px 7px",
      }}
    >
      {s.t}
    </span>
  );
}
