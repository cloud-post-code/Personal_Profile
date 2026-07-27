import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { prisma, getProfile } from "@/lib/db";
import { safeTags, safeSocials, safeExperience } from "@/lib/knowledge";
import { safeJson, siteOrigin } from "@/lib/util";
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
  rescanSource,
  updateSourceSummary,
  deleteSource,
  addProject,
  uploadPhoto,
  updatePhoto,
  deletePhoto,
  toggleContactHandled,
  deleteContact,
  saveBookingSettings,
  disconnectGoogle,
  deleteBooking,
  deleteChatSession,
  saveChatFeedback,
} from "../actions";
import { Extractor } from "../Extractor";
import { GithubImport } from "../GithubImport";
import { GraphPanel } from "../GraphPanel";
import { AnswersPanel } from "../AnswersPanel";
import { PersonaPrompt } from "../PersonaPrompt";
import { personaExtractionPrompt } from "@/lib/personaPrompt";
import { graphStats, listEntities, listEdges, suggestedMerges } from "@/lib/retrieval/graph";
import { seedStarterAnswers, listCannedAnswers } from "@/lib/canned";
import { draftBlankAnswers } from "@/lib/answerDrafts";
import { ProjectRow } from "../ProjectRow";
import { Tabs } from "../Tabs";
import { SaveButton } from "../SaveButton";
import { AutoUploadFile } from "../AutoUploadFile";
import { ThemePicker } from "../ThemePicker";
import type { ThemeColors } from "@/lib/theme";
import { panel, field, btn, btnGhost, btnDanger, SectionTitle, Label } from "../ui";
import { chatMetrics } from "@/lib/activity";
import { parseWeeklyHours, type WeeklyHours } from "@/lib/booking/slots";
import { googleRedirectUri } from "@/lib/google";
import { connectionStatus } from "@/lib/googleConnection";

/** What went wrong on the way back from Google, in words. */
function googleConnectError(reason: string | undefined): string {
  switch (reason) {
    case "access_denied":
      return "you declined the permissions Google asked about.";
    case "state-mismatch":
      return "the request didn't match the one this page started. Click Connect again.";
    case "no-code":
      return "Google sent no authorization code back.";
    case "no-client-credentials":
      return "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET aren't set.";
    case "exchange-failed":
      return "Google refused the code, or returned no refresh token. If you have connected before, remove this app at myaccount.google.com/permissions and try again.";
    default:
      return reason ?? "no reason given.";
  }
}

/** Sunday-first, matching the weekday indexing the slot grid uses. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  // The Google OAuth callback returns here with ?tab=booking&google=…, so the
  // page has to be able to open on a tab and report an outcome.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAuthed())) redirect("/admin");

  const query = await searchParams;
  const one = (k: string) => (Array.isArray(query[k]) ? query[k][0] : query[k]);

  const [
    profile,
    projects,
    sources,
    photos,
    contacts,
    bookings,
    chatSessions,
    gStats,
    gEntities,
    gEdges,
    gSuggestions,
    canned,
  ] = await Promise.all([
      getProfile(),
      prisma.project.findMany({ orderBy: { order: "asc" } }),
      prisma.source.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.photo.findMany({ orderBy: { order: "asc" } }),
      prisma.contact.findMany({ orderBy: { createdAt: "desc" } }),
      // Soonest first, and past meetings drop off on their own.
      prisma.booking.findMany({
        where: { endsAt: { gt: new Date() } },
        orderBy: { startsAt: "asc" },
      }),
      prisma.chatSession.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: { messages: { orderBy: { createdAt: "asc" } } },
      }),
      graphStats(),
      listEntities(),
      listEdges(),
      suggestedMerges(),
      // The starter chips ask the same five questions forever, so they're
      // pre-created — and any row still blank gets a first draft written from
      // the knowledge base, so the tab opens on a review queue rather than a
      // to-do list. Best-effort: a provider outage must not take down the admin.
      seedStarterAnswers()
        .then(() => draftBlankAnswers().catch(() => 0))
        .then(listCannedAnswers),
    ]);
  const metrics = chatMetrics(chatSessions);
  const unhandled = contacts.filter((c) => !c.handled).length;
  const google = await connectionStatus();
  const redirectUri = googleRedirectUri(siteOrigin(await headers()));
  const googleOutcome = one("google");
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

  // ── KNOWLEDGE TAB ──
  const knowledgeTab = (
    <section data-fill="surface" style={panel}>
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
              {s.error && <p style={{ color: "var(--danger-on-surface)", fontSize: 12, marginTop: 6 }}>{s.error}</p>}
              <form action={updateSourceSummary} style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={s.id} />
                <textarea name="summary" defaultValue={s.summary ?? ""} rows={2} placeholder="Summary the chatbot will use…" style={{ ...field, marginBottom: 8, resize: "vertical" }} />
                {safeTags(s.tags).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {safeTags(s.tags).map((t) => (
                      <span key={t} style={{ fontSize: 11, color: "var(--accent-on-surface)" }}>#{t}</span>
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

  // ── PHOTOS (rendered inside the Knowledge tab) ──
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

  // ── BOOKING TAB ──
  const savedBookingHours = parseWeeklyHours(safeJson<unknown>(profile.bookingHours, {}));
  // Never configured? Pre-fill weekdays 9-5 so the form is a working starting
  // point rather than seven blank boxes. It's only a form default — the values
  // are visible and editable before the first save, so nothing is assumed
  // behind Blake's back, and clearing a day still means unavailable.
  const bookingHours = Object.keys(savedBookingHours).length
    ? savedBookingHours
    : { 1: [[540, 1020]], 2: [[540, 1020]], 3: [[540, 1020]], 4: [[540, 1020]], 5: [[540, 1020]] } as WeeklyHours;
  const bookingTab = (
    <section data-fill="surface" style={panel}>
      <SectionTitle>Booking</SectionTitle>

      {/* Connection state first: every setting below is inert without it. */}
      <div
        style={{
          fontSize: 13,
          marginBottom: 16,
          padding: "12px 14px",
          borderRadius: 8,
          border: `1px solid ${google.connected ? "var(--success-on-surface)" : "var(--border)"}`,
        }}
      >
        {googleOutcome === "error" && (
          <p style={{ color: "var(--danger-on-surface)", marginBottom: 10 }}>
            Couldn&apos;t connect: {googleConnectError(one("reason"))}
          </p>
        )}

        {google.connected ? (
          <>
            <p>
              Google Calendar is connected
              {google.connectedAt
                ? ` — authorized ${google.connectedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}`
                : ""}
              .
            </p>
            {google.fromEnvironment ? (
              // Nothing to revoke from here: this token came from the deploy's
              // environment, so only the deploy can take it away.
              <p style={{ fontStyle: "italic", marginTop: 6 }}>
                Using GOOGLE_REFRESH_TOKEN from the environment. Clear that variable to manage the
                connection from here instead.
              </p>
            ) : (
              <form action={disconnectGoogle} style={{ marginTop: 10 }}>
                <button type="submit" style={btnDanger}>
                  Disconnect
                </button>
              </form>
            )}
          </>
        ) : google.appConfigured ? (
          <>
            <p>
              Google Calendar is <strong>not connected</strong> — the booking card stays hidden from
              visitors.
            </p>
            <p style={{ marginTop: 10 }}>
              <a href="/api/admin/google/connect" style={{ ...btn, display: "inline-block", textDecoration: "none" }}>
                Connect Google Calendar
              </a>
            </p>
            <p style={{ fontStyle: "italic", marginTop: 8 }}>
              Sign in as the calendar&apos;s owner. This asks only to see when you&apos;re busy and
              to add events — never to read your meetings.
            </p>
          </>
        ) : (
          // No client id/secret means the button cannot work, so it isn't shown.
          // What's missing is a Cloud Console step, so the console steps are.
          <>
            <p>
              Google Calendar is <strong>not connected</strong> — the booking card stays hidden from
              visitors. Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to
              get a Connect button here.
            </p>
            <ol style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>console.cloud.google.com → new project → enable the Google Calendar API.</li>
              <li>
                OAuth consent screen: External, add yourself as a test user, then <strong>publish</strong>{" "}
                it — while it stays in Testing, Google expires the grant after 7 days.
              </li>
              <li>
                Credentials → OAuth client ID → Web application, with this exact redirect URI:
                <br />
                <code>{redirectUri}</code>
              </li>
              <li>
                Put the client id and secret in the environment as <code>GOOGLE_CLIENT_ID</code> /{" "}
                <code>GOOGLE_CLIENT_SECRET</code> and redeploy.
              </li>
            </ol>
          </>
        )}
      </div>

      <form action={saveBookingSettings}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, fontSize: 14 }}>
          <input type="checkbox" name="bookingEnabled" defaultChecked={profile.bookingEnabled} />
          Offer the booking card in chat
        </label>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div>
            <Label>Meeting title</Label>
            <input name="bookingTitle" defaultValue={profile.bookingTitle} style={field} />
          </div>
          <div>
            <Label>Your timezone (IANA)</Label>
            <input name="bookingTz" defaultValue={profile.bookingTz} style={field} />
          </div>
          <div>
            <Label>Length (minutes)</Label>
            <input name="bookingMinutes" type="number" defaultValue={profile.bookingMinutes} style={field} />
          </div>
          <div>
            <Label>Notice required (hours)</Label>
            <input name="bookingLeadHours" type="number" defaultValue={profile.bookingLeadHours} style={field} />
          </div>
          <div>
            <Label>Book up to (days ahead)</Label>
            <input name="bookingDays" type="number" defaultValue={profile.bookingDays} style={field} />
          </div>
          <div>
            <Label>Buffer around meetings (min)</Label>
            <input
              name="bookingBufferMinutes"
              type="number"
              defaultValue={profile.bookingBufferMinutes}
              style={field}
            />
          </div>
        </div>

        <Label>Weekly hours — &quot;09:00-12:00, 13:00-17:00&quot;. Blank means unavailable.</Label>
        {WEEKDAYS.map((label, weekday) => (
          <div key={label} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span style={{ width: 44, fontSize: 13 }}>{label}</span>
            <input
              name={`hours_${weekday}`}
              defaultValue={(bookingHours[weekday] ?? [])
                .map(([a, b]) => `${hhmm(a)}-${hhmm(b)}`)
                .join(", ")}
              placeholder="unavailable"
              style={{ ...field, marginBottom: 0 }}
            />
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <SaveButton>Save booking settings</SaveButton>
        </div>
      </form>

      <SectionTitle>Booked{bookings.length ? ` · ${bookings.length}` : ""}</SectionTitle>
      {bookings.length === 0 && <Empty>Nothing booked yet. Meetings land here as visitors take slots.</Empty>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bookings.map((b) => (
          <div key={b.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14 }}>
                  {b.startsAt.toLocaleString("en-US", {
                    timeZone: profile.bookingTz || "UTC",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </strong>{" "}
                <span style={{ fontSize: 12, fontStyle: "italic" }}>({profile.bookingTz})</span>
                <p style={{ fontSize: 14, marginTop: 4 }}>
                  {b.name} <a href={`mailto:${b.email}`}>{b.email}</a>
                  {b.guestTz ? <span style={{ fontSize: 12, fontStyle: "italic" }}> · {b.guestTz}</span> : null}
                </p>
                {b.note && <p style={{ fontSize: 14, marginTop: 4, whiteSpace: "pre-wrap" }}>{b.note}</p>}
                {b.meetUrl && (
                  <a href={b.meetUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                    Video link ↗
                  </a>
                )}
              </div>
              {/* Deleting frees the slot again; it does not cancel in Google. */}
              <form action={deleteBooking}>
                <input type="hidden" name="id" value={b.id} />
                <button style={btnDanger as React.CSSProperties}>Delete</button>
              </form>
            </div>
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
        initial={one("tab")}
        tabs={[
          { key: "profile", label: "Profile", content: profileTab },
          { key: "persona", label: "Persona", content: personaTab },
          { key: "theme", label: "Theme", content: themeTab },
          { key: "projects", label: "Projects", content: projectsTab },
          {
            key: "knowledge",
            label: "Knowledge",
            content: (
              <>
                {knowledgeTab}
                {photosSection}
              </>
            ),
          },
          { key: "answers", label: "Answers", content: <AnswersPanel rows={canned} /> },
          {
            key: "graph",
            label: "Graph",
            content: <GraphPanel
                stats={gStats}
                entities={gEntities}
                edges={gEdges}
                suggestions={gSuggestions}
              />,
          },
          { key: "activity", label: "Activity", content: activityTab },
          { key: "contacts", label: "Contacts", badge: unhandled, content: contactsTab },
          { key: "booking", label: "Booking", badge: bookings.length, content: bookingTab },
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

function TypePill({ t }: { t: string }) {
  const icon = t === "pdf" ? "PDF" : t === "text" ? "TXT" : "LINK";
  return (
    <span style={{ fontSize: 11, color: "var(--on-surface)", fontStyle: "italic", border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px" }}>{icon}</span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    scanned: { c: "var(--success-on-surface)", t: "scanned" },
    pending: { c: "var(--accent-on-surface)", t: "pending" },
    failed: { c: "var(--danger-on-surface)", t: "failed" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: s.c, border: `1px solid ${s.c}`, borderRadius: 999, padding: "1px 7px" }}>{s.t}</span>
  );
}

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
