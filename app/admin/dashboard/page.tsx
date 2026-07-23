import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { prisma, getProfile } from "@/lib/db";
import { safeTags, safeSocials } from "@/lib/knowledge";
import { safeJson } from "@/lib/util";
import { FONT_OPTIONS } from "@/lib/fonts";
import {
  logout,
  saveDetails,
  saveBio,
  uploadBioFile,
  savePersona,
  uploadHeadshot,
  rescanSource,
  updateSourceSummary,
  deleteSource,
  addProject,
  deleteProject,
  uploadPhoto,
  updatePhoto,
  deletePhoto,
  toggleContactHandled,
  deleteContact,
} from "../actions";
import { Extractor } from "../Extractor";
import { Tabs } from "../Tabs";
import { panel, field, btn, btnGhost, btnDanger, SectionTitle, Label } from "../ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  if (!(await isAuthed())) redirect("/admin");

  const [profile, projects, sources, photos, contacts] = await Promise.all([
    getProfile(),
    prisma.project.findMany({ orderBy: { order: "asc" } }),
    prisma.source.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.photo.findMany({ orderBy: { order: "asc" } }),
    prisma.contact.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const unhandled = contacts.filter((c) => !c.handled).length;
  const socials = safeSocials(profile.socials);
  const colors = safeJson<{ bg?: string; primary?: string; accent?: string }>(profile.themeColors, {});

  // ── DETAILS TAB ──
  const detailsTab = (
    <section style={panel}>
      <SectionTitle>Details</SectionTitle>
      <form action={saveDetails}>
        <div style={grid2}>
          <div>
            <Label>Name</Label>
            <input name="name" defaultValue={profile.name} style={field} />
          </div>
          <div>
            <Label>Location</Label>
            <input name="location" defaultValue={profile.location} placeholder="City, Country" style={field} />
          </div>
        </div>
        <div style={grid2}>
          <div>
            <Label>Email</Label>
            <input name="email" defaultValue={profile.email} style={field} />
          </div>
          <div>
            <Label>LinkedIn URL</Label>
            <input name="linkedin" defaultValue={profile.linkedin} style={field} />
          </div>
        </div>
        <Label>GitHub URL</Label>
        <input name="github" defaultValue={profile.github} style={field} />

        <Label>Social media (label + URL — add up to 6)</Label>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <input
              name="social_label"
              defaultValue={socials[i]?.label ?? ""}
              placeholder="e.g. Twitter, Instagram"
              style={{ ...field, flex: "0 0 200px" }}
            />
            <input
              name="social_url"
              defaultValue={socials[i]?.url ?? ""}
              placeholder="https://…"
              style={{ ...field, flex: 1 }}
            />
          </div>
        ))}
        <button style={btn}>Save details</button>
      </form>
    </section>
  );

  // ── BIO TAB ──
  const bioTab = (
    <section style={panel}>
      <SectionTitle>Bio</SectionTitle>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 14 }}>
        Fill your bio by uploading a CSV or text file — Claude turns it into a bio — or write it
        directly below.
      </p>
      <form action={uploadBioFile} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input type="file" name="file" accept=".csv,.txt,.md,text/*" required style={{ ...field, marginBottom: 0, flex: 1, minWidth: 240 }} />
        <button style={btn}>Generate bio from file</button>
      </form>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16 }}>
        Voice upload is coming soon (needs a transcription service wired up).
      </p>
      <form action={saveBio}>
        <Label>Bio (editable)</Label>
        <textarea name="bio" defaultValue={profile.bio} rows={7} style={{ ...field, resize: "vertical" }} />
        <button style={btn}>Save bio</button>
      </form>
    </section>
  );

  // ── PERSONA & THEME TAB ──
  const personaTab = (
    <section style={panel}>
      <SectionTitle>Persona & brand</SectionTitle>

      {/* Headshot */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18 }}>
        {profile.headshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.headshot} alt="headshot" style={{ width: 72, height: 72, borderRadius: 999, objectFit: "cover", border: "1px solid var(--border)" }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 999, background: "var(--bg-soft)", border: "1px solid var(--border)" }} />
        )}
        <form action={uploadHeadshot} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="file" name="file" accept="image/*" required style={{ ...field, marginBottom: 0, maxWidth: 240 }} />
          <button style={btnGhost as React.CSSProperties}>Upload headshot</button>
        </form>
      </div>

      <form action={savePersona}>
        <Label>Tagline</Label>
        <input name="tagline" defaultValue={profile.tagline} style={field} />

        <Label>Overview (short intro of who you are)</Label>
        <textarea name="overview" defaultValue={profile.overview} rows={2} style={{ ...field, resize: "vertical" }} />

        <Label>Voice / worldview / opinions (how the bot should talk)</Label>
        <textarea name="persona" defaultValue={profile.persona} rows={3} style={{ ...field, resize: "vertical" }} />

        <div style={grid2}>
          <div>
            <Label>Values</Label>
            <textarea name="values" defaultValue={profile.values} rows={2} style={{ ...field, resize: "vertical" }} />
          </div>
          <div>
            <Label>Tone / voice</Label>
            <textarea name="tone" defaultValue={profile.tone} rows={2} style={{ ...field, resize: "vertical" }} />
          </div>
        </div>

        <Label>Aesthetic (describe the visual feeling you want)</Label>
        <textarea name="aesthetic" defaultValue={profile.aesthetic} rows={2} style={{ ...field, resize: "vertical" }} />

        <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0", paddingTop: 16 }}>
          <strong style={{ fontSize: 14 }}>Theme — this restyles the live site</strong>
          <div style={{ ...grid2, marginTop: 10 }}>
            <div>
              <Label>Heading font</Label>
              <select name="themeFont" defaultValue={profile.themeFont} style={field}>
                {FONT_OPTIONS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <ColorField name="color_bg" label="Background" value={colors.bg} placeholder="#0B1020" />
            <ColorField name="color_primary" label="Primary" value={colors.primary} placeholder="#7C5CFF" />
            <ColorField name="color_accent" label="Accent" value={colors.accent} placeholder="#FFB84D" />
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Leave a color blank to keep the default. Changes apply site-wide after saving.
          </p>
        </div>

        <button style={btn}>Save persona & theme</button>
      </form>
    </section>
  );

  // ── PROJECTS TAB ──
  const projectsTab = (
    <section style={panel}>
      <SectionTitle>Projects (GitHub + Live links)</SectionTitle>
      <form action={addProject}>
        <div style={grid2}>
          <input name="name" placeholder="Project name" style={field} />
          <input name="order" type="number" placeholder="Order (0 = first)" style={field} />
        </div>
        <textarea
          name="blurb"
          placeholder="Short description — LEAVE BLANK to auto-generate from the link"
          rows={2}
          style={{ ...field, resize: "vertical" }}
        />
        <div style={grid2}>
          <input name="githubUrl" placeholder="GitHub URL (optional)" style={field} />
          <input name="liveUrl" placeholder="Live URL (optional)" style={field} />
        </div>
        <Label>Cover image (optional)</Label>
        <input type="file" name="image" accept="image/*" style={field} />
        <button style={btn}>Add project</button>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
          Leave the description blank and add a GitHub or Live link — Claude writes the short
          description automatically from that page.
        </p>
      </form>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {projects.length === 0 && <Empty>No projects yet.</Empty>}
        {projects.map((p) => (
          <div key={p.id} style={rowCard}>
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{p.name}</strong>
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{p.blurb}</p>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                {p.githubUrl && (
                  <a href={p.githubUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>GitHub</a>
                )}
                {p.liveUrl && (
                  <a href={p.liveUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Live</a>
                )}
              </div>
            </div>
            <form action={deleteProject}>
              <input type="hidden" name="id" value={p.id} />
              <button style={btnDanger as React.CSSProperties}>Delete</button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );

  // ── KNOWLEDGE TAB ──
  const knowledgeTab = (
    <section style={panel}>
      <SectionTitle>Add knowledge — link, PDF, or text</SectionTitle>
      <Extractor />
      {sources.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
          {sources.map((s) => (
            <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                    <TypePill t={s.type} />
                    <StatusPill status={s.status} />
                    <strong style={{ fontSize: 14 }}>{s.title || s.filename || s.url || "(untitled)"}</strong>
                  </div>
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, wordBreak: "break-all" }}>{s.url}</a>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {s.type === "link" && (
                    <form action={rescanSource}>
                      <input type="hidden" name="id" value={s.id} />
                      <button style={btnGhost as React.CSSProperties}>Rescan</button>
                    </form>
                  )}
                  <form action={deleteSource}>
                    <input type="hidden" name="id" value={s.id} />
                    <button style={btnDanger as React.CSSProperties}>Delete</button>
                  </form>
                </div>
              </div>
              {s.error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{s.error}</p>}
              <form action={updateSourceSummary} style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={s.id} />
                <textarea name="summary" defaultValue={s.summary ?? ""} rows={2} placeholder="Summary the chatbot will use…" style={{ ...field, marginBottom: 8, resize: "vertical" }} />
                {safeTags(s.tags).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {safeTags(s.tags).map((t) => (
                      <span key={t} style={{ fontSize: 11, color: "var(--primary-soft)" }}>#{t}</span>
                    ))}
                  </div>
                )}
                <button style={btnGhost as React.CSSProperties}>Save summary</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  // ── PHOTOS TAB ──
  const photosTab = (
    <section style={panel}>
      <SectionTitle>Photos (auto-described by Claude vision)</SectionTitle>
      <form action={uploadPhoto} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" name="file" accept="image/*" required style={{ ...field, marginBottom: 0, maxWidth: 260 }} />
        <input name="caption" placeholder="Short caption (optional)" style={{ ...field, marginBottom: 0, flex: 1 }} />
        <select name="kind" style={{ ...field, marginBottom: 0, maxWidth: 140 }}>
          <option value="gallery">Gallery</option>
          <option value="project">Project</option>
          <option value="profile">Profile</option>
        </select>
        <button style={btn}>Upload</button>
      </form>
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {photos.length === 0 && <Empty>No photos yet.</Empty>}
        {photos.map((ph) => (
          <div key={ph.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/uploads/${ph.filename}`} alt={ph.description || "photo"} style={{ width: "100%", borderRadius: 8, display: "block", marginBottom: 8 }} />
            <form action={updatePhoto}>
              <input type="hidden" name="id" value={ph.id} />
              <textarea name="description" defaultValue={ph.description} rows={3} placeholder="One-paragraph description…" style={{ ...field, marginBottom: 6, fontSize: 13, resize: "vertical" }} />
              <input name="caption" defaultValue={ph.caption ?? ""} placeholder="Caption" style={{ ...field, marginBottom: 8, fontSize: 13 }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button style={btnGhost as React.CSSProperties}>Save</button>
                <FormDelete id={ph.id} />
              </div>
            </form>
          </div>
        ))}
      </div>
    </section>
  );

  // ── CONTACTS TAB ──
  const contactsTab = (
    <section style={panel}>
      <SectionTitle>Contact submissions{unhandled > 0 ? ` · ${unhandled} new` : ""}</SectionTitle>
      {contacts.length === 0 && <Empty>No submissions yet. They arrive via the in-chat contact form.</Empty>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {contacts.map((c) => (
          <div key={c.id} style={{ border: `1px solid ${c.handled ? "var(--border)" : "var(--primary)"}`, borderRadius: 10, padding: 14, opacity: c.handled ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{c.name}</strong>{" "}
                <a href={`mailto:${c.email}`} style={{ fontSize: 13 }}>{c.email}</a>
                <p style={{ color: "var(--text)", fontSize: 14, marginTop: 6, whiteSpace: "pre-wrap" }}>{c.message}</p>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{c.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <form action={toggleContactHandled}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="handled" value={String(c.handled)} />
                  <button style={btnGhost as React.CSSProperties}>{c.handled ? "Reopen" : "Mark handled"}</button>
                </form>
                <form action={deleteContact}>
                  <input type="hidden" name="id" value={c.id} />
                  <button style={btnDanger as React.CSSProperties}>Delete</button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Control room</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Everything here feeds the chatbot & site.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href="/" style={btnGhost as React.CSSProperties}>View site</a>
          <form action={logout}>
            <button style={btnGhost as React.CSSProperties}>Log out</button>
          </form>
        </div>
      </header>

      <Tabs
        tabs={[
          { key: "details", label: "Details", content: detailsTab },
          { key: "bio", label: "Bio", content: bioTab },
          { key: "persona", label: "Persona & Theme", content: personaTab },
          { key: "projects", label: "Projects", content: projectsTab },
          { key: "knowledge", label: "Knowledge", content: knowledgeTab },
          { key: "photos", label: "Photos", content: photosTab },
          { key: "contacts", label: "Contacts", badge: unhandled, content: contactsTab },
        ]}
      />
    </main>
  );
}

function ColorField({ name, label, value, placeholder }: { name: string; label: string; value?: string; placeholder: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <input name={name} defaultValue={value ?? ""} placeholder={placeholder} style={{ ...field, fontFamily: "var(--font-mono)" }} />
    </div>
  );
}

function FormDelete({ id }: { id: string }) {
  return (
    <form action={deletePhoto}>
      <input type="hidden" name="id" value={id} />
      <button style={btnDanger as React.CSSProperties}>Delete</button>
    </form>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{children}</p>;
}

function TypePill({ t }: { t: string }) {
  const icon = t === "pdf" ? "PDF" : t === "text" ? "TXT" : "LINK";
  return (
    <span style={{ fontSize: 11, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px" }}>{icon}</span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    scanned: { c: "var(--success)", t: "scanned" },
    pending: { c: "var(--accent)", t: "pending" },
    failed: { c: "var(--danger)", t: "failed" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: s.c, border: `1px solid ${s.c}`, borderRadius: 999, padding: "1px 7px" }}>{s.t}</span>
  );
}

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const rowCard: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "10px 14px",
  gap: 10,
};
