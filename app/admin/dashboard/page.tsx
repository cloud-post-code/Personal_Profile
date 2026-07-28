import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { prisma, getProfile } from "@/lib/db";
import { safeTags, safeSocials, safeExperience } from "@/lib/knowledge";
import { safeJson } from "@/lib/util";
import { PERSONA_BLURB, PERSONA_SECTIONS, safePersonaSections } from "@/lib/persona";
import { FONT_OPTIONS, BODY_FONT_OPTIONS } from "@/lib/fonts";
import { RADIUS_OPTIONS } from "@/lib/theme";
import { SocialsEditor } from "../SocialsEditor";
import { ExperienceEditor } from "../ExperienceEditor";
import {
  logout,
  saveProfile,
  uploadResume,
  savePersona,
  saveTheme,
  uploadHeadshot,
  addProject,
  uploadPhoto,
  updatePhoto,
  deletePhoto,
  toggleContactHandled,
  deleteContact,
  deleteChatSession,
  saveChatFeedback,
} from "../actions";
import { KnowledgePanel, isDocSource } from "../KnowledgePanel";
import { GithubImport } from "../GithubImport";
import { GraphPanel } from "../GraphPanel";
import { AnswersPanel } from "../AnswersPanel";
import { A2uiPanel } from "../A2uiPanel";
import { seedStarterUiCards, listUiCards } from "@/lib/uiCards";
import { PersonaPrompt } from "../PersonaPrompt";
import { personaExtractionPrompt } from "@/lib/personaPrompt";
import { graphStats, listEntities, listEdges, suggestedMerges } from "@/lib/retrieval/graph";
import { seedStarterAnswers, listCannedAnswers } from "@/lib/canned";
import { draftBlankAnswers } from "@/lib/answerDrafts";
import { ProjectRow } from "../ProjectRow";
import { Tabs } from "../Tabs";
import { SubTabs } from "../SubTabs";
import { resolveAdminTab } from "../contentTabs";
import { SaveButton } from "../SaveButton";
import { AutoUploadFile } from "../AutoUploadFile";
import { ThemePicker } from "../ThemePicker";
import type { ThemeColors } from "@/lib/theme";
import { panel, field, btn, btnGhost, btnDanger, SectionTitle, Label } from "../ui";
import { chatMetrics } from "@/lib/activity";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  // Deep links (?tab=…) open the dashboard on a specific tab.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAuthed())) redirect("/admin");

  const query = await searchParams;
  const one = (k: string) => (Array.isArray(query[k]) ? query[k][0] : query[k]);
  // Legacy ?tab=projects / ?tab=knowledge links open the Content section on
  // that sub-tab; every other key still targets its own nav entry.
  const { nav: initialNav, sub: initialSub } = resolveAdminTab(one("tab"));

  const [
    profile,
    projects,
    sources,
    photos,
    contacts,
    chatSessions,
    gStats,
    gEntities,
    gEdges,
    gSuggestions,
    gOverviews,
    canned,
    uiCards,
  ] = await Promise.all([
      getProfile(),
      prisma.project.findMany({ orderBy: { order: "asc" } }),
      prisma.source.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.photo.findMany({ orderBy: { order: "asc" } }),
      prisma.contact.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.chatSession.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: { messages: { orderBy: { createdAt: "asc" } } },
      }),
      graphStats(),
      listEntities(),
      listEdges(),
      suggestedMerges(),
      prisma.chunk.findMany({
        where: { originKind: "cluster" },
        orderBy: { originLabel: "asc" },
        select: { id: true, originLabel: true, text: true },
      }),
      // The starter chips ask the same five questions forever, so they're
      // pre-created — and any row still blank gets a first draft written from
      // the knowledge base, so the tab opens on a review queue rather than a
      // to-do list. Best-effort: a provider outage must not take down the admin.
      seedStarterAnswers()
        .then(() => draftBlankAnswers().catch(() => 0))
        .then(listCannedAnswers),
      // Same bootstrap shape as the answers: the starter cards fill an empty
      // table once, then the rows are Blake's.
      seedStarterUiCards().then(listUiCards),
    ]);
  const metrics = chatMetrics(chatSessions);
  const unhandled = contacts.filter((c) => !c.handled).length;
  // LinkedIn is now just a social link. If a legacy linkedin value exists and
  // isn't already in socials, surface it as a pre-filled row so it's not lost.
  const savedSocials = safeSocials(profile.socials);
  const socials =
    profile.linkedin && !savedSocials.some((s) => s.url === profile.linkedin)
      ? [{ label: "LinkedIn", url: profile.linkedin }, ...savedSocials]
      : savedSocials;
  const colors = safeJson<ThemeColors>(profile.themeColors, {});
  const experience = safeExperience(profile.experience);
  const personaSections = safePersonaSections(profile.personaSections);

  // ── PROFILE TAB (Details + Bio merged) ──
  const profileTab = (
    <section data-fill="surface" style={panel}>
      <SectionTitle>Profile</SectionTitle>

      {/* Headshot — auto-uploads the moment a file is chosen. */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
        {profile.headshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.headshot} alt="headshot" style={{ width: 72, height: 72, borderRadius: 999, objectFit: "cover", border: "1px solid var(--border)" }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 999, background: "var(--bg-soft)", border: "1px solid var(--border)" }} />
        )}
        <form action={uploadHeadshot}>
          <Label>Headshot</Label>
          <AutoUploadFile name="file" accept="image/*" hint="Pick a photo — it uploads automatically." />
        </form>
      </div>

      {/* ── Upload resume — drops the resume's raw text into the Bio. ── */}
      <div style={{ border: "1px solid var(--primary)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 20 }}>
        <strong style={{ fontSize: 14, color: "var(--on-surface)", display: "block", marginBottom: 6 }}>
          Upload your resume
        </strong>
        <UploadToGenerate
          action={uploadResume}
          buttonLabel="Parse resume → fill everything"
          hint="Upload a PDF, Word doc, or text resume. It's split into your Bio, Experience cards, and an 'Other' section, and fills your name, location, email, and any social links found. Review and edit below."
        />
      </div>

      {/* One form for the whole Profile tab — identity, bio, experience, and
          other all save together from the single button at the bottom. */}
      <form action={saveProfile}>
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
            <Label>GitHub URL</Label>
            <input name="github" defaultValue={profile.github} style={field} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>Booking link</Label>
          <input
            name="bookingLink"
            defaultValue={profile.bookingLink}
            placeholder="https://calendly.com/you/intro"
            style={field}
          />
          <p style={{ fontSize: 12, color: "var(--on-surface)", fontStyle: "italic", margin: "4px 0 0" }}>
            A Calendly / Cal.com style link. When set, it appears on the contact card and the
            chat can offer it as its own booking card.
          </p>
        </div>

        <Label>Social media (add one at a time)</Label>
        <SocialsEditor initial={socials} />

        {/* ── Bio ── plain editable text (resume text lands here). */}
        <div style={{ borderTop: "1px solid var(--border)", margin: "18px 0", paddingTop: 16 }}>
          <Label>Bio</Label>
          <textarea name="bio" defaultValue={profile.bio} rows={10} style={{ ...field, resize: "vertical" }} />
        </div>

        {/* ── Experience ── a summary paragraph plus the per-role cards. */}
        <div style={{ borderTop: "1px solid var(--border)", margin: "18px 0", paddingTop: 16 }}>
          <Label>Experience — overview paragraph</Label>
          <textarea
            name="experienceSummary"
            defaultValue={profile.experienceSummary}
            rows={5}
            placeholder="A paragraph summarizing your work experience — this is what shows on your profile."
            style={{ ...field, resize: "vertical" }}
          />
          <Label>Experience roles (add one at a time)</Label>
          <ExperienceEditor initial={experience} />
        </div>

        {/* ── Other ── everything else from the resume (education, skills, etc.). */}
        <div style={{ borderTop: "1px solid var(--border)", margin: "18px 0", paddingTop: 16 }}>
          <Label>Other (education, skills, awards — everything else)</Label>
          <textarea name="other" defaultValue={profile.other} rows={7} style={{ ...field, resize: "vertical" }} />
        </div>

        <SaveButton>Save profile</SaveButton>
      </form>
    </section>
  );

  // ── PERSONA TAB — the tagline, plus one free-prose field ──
  const personaTab = (
    <section data-fill="surface" style={panel}>
      <SectionTitle>Persona</SectionTitle>
      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 18 }}>
        {PERSONA_BLURB}
      </p>

      <PersonaPrompt prompt={personaExtractionPrompt()} />

      <form action={savePersona}>
        <Label>Tagline (shown under your name on the live site)</Label>
        <input name="tagline" defaultValue={profile.tagline} style={field} />

        <div style={{ borderTop: "1px solid var(--border)", margin: "18px 0", paddingTop: 16 }}>
          {PERSONA_SECTIONS.map((s) => (
            <div key={s.key} style={{ marginBottom: 4 }}>
              <Label>{s.label}</Label>
              <textarea
                name={`section_${s.key}`}
                defaultValue={personaSections[s.key]}
                rows={s.rows}
                placeholder={s.hint}
                style={{ ...field, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>
          ))}
        </div>

        <SaveButton>Save persona</SaveButton>
      </form>
    </section>
  );

  // ── THEME TAB ──
  const themeTab = (
    <section data-fill="surface" style={panel}>
      <SectionTitle>Theme</SectionTitle>
      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 18 }}>
        Everything here restyles the live site.
      </p>

      <form action={saveTheme}>
        <Label>Aesthetic (describe the visual feeling you want)</Label>
        <textarea name="aesthetic" defaultValue={profile.aesthetic} rows={2} style={{ ...field, resize: "vertical" }} />

        <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0", paddingTop: 16 }}>
          <ThemePicker
            fontOptions={FONT_OPTIONS}
            bodyFontOptions={BODY_FONT_OPTIONS}
            radiusOptions={RADIUS_OPTIONS}
            initial={{
              themeFont: profile.themeFont,
              themeBodyFont: profile.themeBodyFont,
              themeRadius: profile.themeRadius,
              themeFontSize: profile.themeFontSize,
              themeHeadingWeight: profile.themeHeadingWeight,
              colors,
            }}
          />
        </div>

        <SaveButton>Save theme</SaveButton>
      </form>
    </section>
  );

  // ── PROJECTS TAB ──
  const projectsTab = (
    <section data-fill="surface" style={panel}>
      <SectionTitle>Projects (GitHub + Live links)</SectionTitle>

      {/* ── Import all repos from a GitHub profile link. ── */}
      <div style={{ border: "1px solid var(--primary)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 18 }}>
        <strong style={{ fontSize: 14, color: "var(--on-surface)", display: "block", marginBottom: 6 }}>
          Import from GitHub
        </strong>
        <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 10 }}>
          Paste your GitHub profile link — your top public repos become project cards, each
          enriched by Claude with a blurb, a &ldquo;Learn more&rdquo; write-up, and tags. Cards
          stream in one by one as they finish. Re-running refreshes projects whose repos have
          changed on GitHub since the last import and skips the rest.
        </p>
        <GithubImport />
      </div>

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
        <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 12, marginTop: 8 }}>
          Leave the description blank and add a GitHub or Live link — Claude writes the short
          description automatically from that page.
        </p>
      </form>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {projects.length === 0 && <Empty>No projects yet.</Empty>}
        {projects.map((p) => (
          <ProjectRow
            key={p.id}
            project={{
              id: p.id,
              name: p.name,
              blurb: p.blurb,
              detail: p.detail,
              tags: safeTags(p.tags),
              githubUrl: p.githubUrl,
              liveUrl: p.liveUrl,
              order: p.order,
            }}
          />
        ))}
      </div>
    </section>
  );

  // ── KNOWLEDGE TABS — one per kind: links, PDFs/docs, pasted text ──
  // Links is the catch-all so a source with an unexpected type stays visible
  // (and deletable) rather than dropping out of the dashboard entirely.
  const docSources = sources.filter((s) => isDocSource(s.type));
  const textSources = sources.filter((s) => s.type === "text");
  const linkSources = sources.filter((s) => !isDocSource(s.type) && s.type !== "text");

  const linksTab = (
    <KnowledgePanel
      mode="link"
      title="Links"
      blurb="Paste a URL and it gets fetched, then Claude writes a summary + tags the chatbot can cite. LinkedIn often blocks bots — if a scan comes back thin, edit the summary below it."
      rows={linkSources}
      empty="No links yet. Add one above."
    />
  );

  const pdfsTab = (
    <KnowledgePanel
      mode="pdf"
      title="PDFs & documents"
      blurb="Upload a PDF or Word document — a résumé, a deck, a writeup. The text is parsed out and Claude summarises it into knowledge the chatbot can cite."
      rows={docSources}
      empty="No documents yet. Upload one above."
    />
  );

  const textTab = (
    <KnowledgePanel
      mode="text"
      title="Text"
      blurb="Paste text or markdown straight in — notes, an essay, an opinion, a bit of your story. Claude summarises it the same way it does a scanned link."
      rows={textSources}
      empty="No pasted text yet. Add some above."
    />
  );

  // ── PHOTOS (its own tab in the Content section) ──
  const photosSection = (
    <section data-fill="surface" style={panel}>
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
    <section data-fill="surface" style={panel}>
      <SectionTitle>Contact submissions{unhandled > 0 ? ` · ${unhandled} new` : ""}</SectionTitle>
      {contacts.length === 0 && <Empty>No submissions yet. They arrive via the in-chat contact form.</Empty>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {contacts.map((c) => (
          <div key={c.id} style={{ border: `1px solid ${c.handled ? "var(--border)" : "var(--primary)"}`, borderRadius: 10, padding: 14, opacity: c.handled ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>{c.name}</strong>{" "}
                <a href={`mailto:${c.email}`} style={{ fontSize: 13 }}>{c.email}</a>
                <p style={{ color: "var(--on-surface)", fontSize: 14, marginTop: 6, whiteSpace: "pre-wrap" }}>{c.message}</p>
                <span style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 11 }}>{c.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
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

  // ── ACTIVITY TAB — what visitors are asking the chatbot ──
  const activityTab = (
    <section data-fill="surface" style={panel}>
      <SectionTitle>Activity — visitor conversations</SectionTitle>
      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>
        Every conversation people have with your chatbot is recorded here — their
        questions and the answers they got. Click any chat to read the full transcript.
      </p>

      {chatSessions.length === 0 ? (
        <Empty>No conversations yet. They&apos;ll appear here as visitors chat.</Empty>
      ) : (
        <>
          {/* ── Metrics overview ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <Stat label="Chats" value={metrics.totalChats} />
            <Stat label="This week" value={metrics.chatsThisWeek} />
            <Stat label="Questions" value={metrics.totalQuestions} />
            <Stat label="Messages" value={metrics.totalMessages} />
            <Stat label="Avg / chat" value={metrics.avgQuestions} />
            <Stat label="Flagged 👎" value={metrics.flaggedDown} />
          </div>

          {/* ── Most-asked questions ── */}
          {metrics.topQuestions.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <Label>Most asked</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {metrics.topQuestions.map((q) => (
                  <div
                    key={q.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "7px 12px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                    >
                      {q.label}
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--accent-on-bg-soft)",
                        background: "var(--bg-soft)",
                        borderRadius: 999,
                        padding: "1px 9px",
                      }}
                    >
                      {q.count}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Label>All conversations</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {chatSessions.map((s) => (
          <details key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
            <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", listStyle: "none" }}>
              <span style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: 14, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.firstQuery || "(no question)"}
                </strong>
                <span style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 11 }}>
                  {s.messages.length} messages · {s.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </span>
              </span>
              <form action={deleteChatSession}>
                <input type="hidden" name="id" value={s.id} />
                <button style={btnDanger as React.CSSProperties}>Delete</button>
              </form>
            </summary>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {s.messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}
            </div>
          </details>
        ))}
          </div>
        </>
      )}
    </section>
  );

  // ── AGENT BEHAVIOR TAB — how the chatbot answers and acts ──
  const goalsTab = (
    <section data-fill="surface" style={panel}>
      <SectionTitle>Goals</SectionTitle>
      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>
        What the chatbot should steer conversations toward — the outcomes you
        want from a visitor chat.
      </p>
      <Empty>Nothing here yet. Goals you add will appear here.</Empty>
    </section>
  );

  const rulesTab = (
    <section data-fill="surface" style={panel}>
      <SectionTitle>Rules</SectionTitle>
      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>
        Hard rules the chatbot must follow — things it should always or never do,
        regardless of what a visitor asks.
      </p>
      <Empty>Nothing here yet. Rules you add will appear here.</Empty>
    </section>
  );

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26 }}>Control room</h1>
          <p style={{ color: "var(--text)", fontStyle: "italic", fontSize: 14 }}>Everything here feeds the chatbot & site.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/" style={btnGhost as React.CSSProperties}>View site</Link>
          <form action={logout}>
            <button style={btnGhost as React.CSSProperties}>Log out</button>
          </form>
        </div>
      </header>

      <Tabs
        initial={initialNav}
        tabs={[
          {
            key: "profile",
            label: "Me",
            content: (
              <SubTabs
                initial={initialSub}
                ariaLabel="Me sections"
                tabs={[
                  { key: "profile", label: "Profile", content: profileTab },
                  { key: "persona", label: "Persona", content: personaTab },
                  { key: "theme", label: "Theme", content: themeTab },
                ]}
              />
            ),
          },
          {
            key: "content",
            label: "Content",
            content: (
              <SubTabs
                initial={initialSub}
                tabs={[
                  { key: "projects", label: "Projects", content: projectsTab },
                  { key: "links", label: "Links", content: linksTab },
                  { key: "pdfs", label: "PDFs", content: pdfsTab },
                  { key: "text", label: "Text", content: textTab },
                  { key: "photos", label: "Photos", content: photosSection },
                ]}
              />
            ),
          },
          {
            key: "graph",
            label: "Graph",
            content: <GraphPanel
                stats={gStats}
                entities={gEntities}
                edges={gEdges}
                suggestions={gSuggestions}
                overviews={gOverviews}
              />,
          },
          {
            key: "activity",
            label: "Activity",
            badge: unhandled,
            content: (
              <SubTabs
                initial={initialSub}
                ariaLabel="Activity sections"
                tabs={[
                  { key: "activity", label: "Conversations", content: activityTab },
                  {
                    key: "contacts",
                    label: unhandled > 0 ? `Contacts · ${unhandled}` : "Contacts",
                    content: contactsTab,
                  },
                ]}
              />
            ),
          },
          {
            key: "agent",
            label: "Agent Behavior",
            content: (
              <SubTabs
                initial={initialSub}
                ariaLabel="Agent Behavior sections"
                tabs={[
                  { key: "answers", label: "Presets", content: <AnswersPanel rows={canned} /> },
                  { key: "goals", label: "Goals", content: goalsTab },
                  { key: "rules", label: "Rules", content: rulesTab },
                  { key: "a2ui", label: "A2UI", content: <A2uiPanel rows={uiCards} /> },
                ]}
              />
            ),
          },
        ]}
      />
    </main>
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

/** A "pick a file → Claude generates content" upload block, its own form. */
function UploadToGenerate({
  action,
  buttonLabel,
  hint,
  footnote,
}: {
  action: (formData: FormData) => void | Promise<void>;
  buttonLabel: string;
  hint: string;
  footnote?: string;
}) {
  return (
    <div>
      <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 13, marginBottom: 10 }}>{hint}</p>
      <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="file"
          name="file"
          accept=".pdf,.docx,.csv,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
          required
          style={{ ...field, marginBottom: 0, flex: 1, minWidth: 240 }}
        />
        <button style={btn}>{buttonLabel}</button>
      </form>
      {footnote && (
        <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 12, marginTop: 8 }}>{footnote}</p>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--on-surface)", fontStyle: "italic", fontSize: 14 }}>{children}</p>;
}

/** One message in a transcript: the bubble, plus feedback controls on bot answers. */
function MessageRow({
  message,
}: {
  message: { id: string; role: string; content: string; rating: string | null; note: string | null };
}) {
  const isUser = message.role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 4 }}>
      <div
        style={{
          maxWidth: "85%",
          background: isUser ? "var(--primary)" : "var(--bg-soft)",
          color: isUser ? "var(--on-primary)" : "var(--on-bg-soft)",
          border: isUser ? "1px solid transparent" : "1px solid var(--border)",
          borderRadius: 12,
          padding: "8px 12px",
          fontSize: 13,
          whiteSpace: "pre-wrap",
        }}
      >
        {message.content}
      </div>
      {!isUser && <FeedbackControls id={message.id} rating={message.rating} note={message.note} />}
    </div>
  );
}

/**
 * Admin feedback on a bot answer. 👍/👎 buttons submit immediately; the note
 * (a correction the bot should follow next time) submits with its own Save.
 * Each is its own form so a rating click doesn't require typing a note.
 */
function FeedbackControls({
  id,
  rating,
  note,
}: {
  id: string;
  rating: string | null;
  note: string | null;
}) {
  const pill = (active: boolean): React.CSSProperties => ({
    ...(btnGhost as React.CSSProperties),
    padding: "4px 10px",
    fontSize: 13,
    ...(active ? { borderColor: "var(--primary)", color: "var(--accent-on-bg-soft)", background: "var(--bg-soft)" } : {}),
  });
  return (
    <div style={{ maxWidth: "85%", width: "100%" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <form action={saveChatFeedback} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="note" value={note ?? ""} />
          <button name="rating" value="up" style={pill(rating === "up")} title="Good answer">👍</button>
          <button name="rating" value="down" style={pill(rating === "down")} title="Bad answer">👎</button>
        </form>
        {rating && (
          <form action={saveChatFeedback}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="rating" value="" />
            <input type="hidden" name="note" value="" />
            <button style={{ ...(btnGhost as React.CSSProperties), padding: "4px 10px", fontSize: 12 }} title="Clear feedback">
              Clear
            </button>
          </form>
        )}
        {rating === "up" && <span style={{ fontSize: 11, color: "var(--success-on-surface)" }}>Marked good</span>}
      </div>

      {/* Correction note — steers future answers when the rating is 👎. */}
      <form action={saveChatFeedback} style={{ marginTop: 6 }}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="rating" value={rating ?? ""} />
        <textarea
          name="note"
          defaultValue={note ?? ""}
          rows={2}
          placeholder="What should it have done instead? Saved as a correction the bot follows on future chats."
          style={{ ...field, marginBottom: 6, fontSize: 12, resize: "vertical" }}
        />
        <button style={{ ...(btnGhost as React.CSSProperties), padding: "5px 12px", fontSize: 12 }}>
          Save correction
        </button>
      </form>
    </div>
  );
}

/** A single metric tile: big number over a small label. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      data-fill="bg-soft"
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
        background: "var(--bg-soft)",
        color: "var(--on-bg-soft)",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--font-heading)", lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--on-bg-soft)", fontStyle: "italic", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
