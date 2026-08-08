"use client";

import { useEffect, useState } from "react";

/** Shared A2UI block types (mirrors lib/cards.ts). */
export type ProjectCard = {
  id: string;
  name: string;
  blurb: string;
  detail: string | null;
  githubUrl: string | null;
  liveUrl: string | null;
  imageUrl: string | null;
  tags: string[];
};
export type PhotoCard = {
  id: string;
  src: string;
  description: string;
  caption: string | null;
};
export type TimelineEntry = {
  role: string;
  company: string;
  dates: string;
  description: string;
};
export type CustomElement =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "badges"; items: string[] }
  | { kind: "stats"; items: { label: string; value: string }[] }
  | { kind: "buttons"; items: { label: string; url: string }[] }
  | { kind: "image"; src: string; alt?: string }
  | { kind: "quote"; text: string; by?: string }
  | { kind: "divider" };
export type UiBlock =
  | { type: "projects"; items: ProjectCard[] }
  | { type: "project"; item: ProjectCard | null }
  | { type: "gallery"; layout: "carousel" | "filmstrip"; items: PhotoCard[] }
  | { type: "contact"; bookingLink?: string | null }
  | { type: "timeline"; items: TimelineEntry[]; summary: string }
  | { type: "booking" }
  | { type: "booking_link"; url: string; name: string }
  | { type: "custom"; title?: string; elements: CustomElement[] }
  | { type: "html"; html: string; height?: number };

export function Cards({ block }: { block: UiBlock }) {
  if (block.type === "projects") {
    if (block.items.length === 0) return <Empty>No projects yet.</Empty>;
    return (
      <div style={grid}>
        {block.items.map((p) => (
          <ProjectCardView key={p.id} p={p} />
        ))}
      </div>
    );
  }
  if (block.type === "project") {
    if (!block.item) return <Empty>That project wasn&apos;t found.</Empty>;
    return (
      <div style={{ marginTop: 6 }}>
        <ProjectCardView p={block.item} big />
      </div>
    );
  }
  if (block.type === "gallery") {
    if (block.items.length === 0) return <Empty>No photos yet.</Empty>;
    return block.layout === "carousel" ? (
      <Carousel items={block.items} />
    ) : (
      <Filmstrip items={block.items} />
    );
  }
  if (block.type === "contact") {
    return <ContactForm bookingLink={block.bookingLink ?? null} />;
  }
  if (block.type === "timeline") {
    if (block.items.length === 0) return <Empty>No experience added yet.</Empty>;
    return <Timeline items={block.items} summary={block.summary} />;
  }
  if (block.type === "booking") {
    return <BookingCard />;
  }
  if (block.type === "booking_link") {
    return <BookingLinkCard url={block.url} name={block.name} />;
  }
  if (block.type === "custom") {
    return <CustomCard title={block.title} elements={block.elements} />;
  }
  if (block.type === "html") {
    return <HtmlCard html={block.html} height={block.height} />;
  }
  return null;
}

/**
 * A card the builder CODED — model-written HTML with inline CSS, rendered in a
 * sealed sandbox. Two independent walls stand between that code and the
 * visitor: the iframe sandbox (no scripts, no same-origin — popups only, so
 * target="_blank" links still work), and a CSP baked into the document that
 * allows inline styles and data: images and nothing else, so it cannot phone
 * out to any external host. Validation upstream also refuses to store markup
 * that even looks executable; this is the belt to that suspender.
 *
 * The site's theme variables are resolved here and injected into the document,
 * because a sandboxed iframe inherits nothing — without this, coded cards
 * would go off-palette the moment the admin changes the theme.
 */
function HtmlCard({ html, height }: { html: string; height?: number }) {
  const [themeCss, setThemeCss] = useState("");
  useEffect(() => {
    // The COMPLETE live token set, so coded cards see the same design system
    // the rest of the site computes — including per-theme readable-on variants.
    const root = getComputedStyle(document.documentElement);
    const names = [
      "--bg", "--bg-soft", "--surface", "--border", "--text",
      "--primary", "--accent", "--on-primary", "--on-accent",
      "--on-surface", "--on-bg-soft",
      "--accent-on-bg", "--accent-on-bg-soft", "--accent-on-surface",
      "--danger-on-bg-soft", "--danger-on-surface",
      "--success-on-bg-soft", "--success-on-surface",
      "--font-heading", "--heading-weight",
      "--radius-sm", "--radius-md", "--radius-lg", "--radius-pill",
    ];
    const vars = names.map((n) => `${n}:${root.getPropertyValue(n)};`).join("");
    const font = getComputedStyle(document.body).fontFamily;
    // Base element styles mirroring the site's card idiom, so even markup the
    // model leaves unstyled lands on-theme: body text 14/1.55 in the body
    // font, headings in the heading font at the site's card sizes, links in
    // the accent that is readable on this exact background.
    setThemeCss(
      `:root{${vars}}` +
        `body{margin:0;background:transparent;color:var(--on-bg-soft);font-family:${font};font-size:14px;line-height:1.55;}` +
        `h1,h2,h3,h4{font-family:var(--font-heading),${font};font-weight:var(--heading-weight,700);margin:0 0 8px;}` +
        `h1{font-size:17px}h2{font-size:15px}h3,h4{font-size:14px}` +
        `a{color:var(--accent-on-bg-soft);}`,
    );
  }, []);

  const doc =
    `<!doctype html><html><head>` +
    // img-src also allows this origin, so a coded card can show a real photo
    // from the owner's library or one the builder generated — both are served
    // from /api/uploads on our own host. Everything else stays denied, so the
    // card still cannot phone out to a third party.
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: 'self';">` +
    `<style>${themeCss}</style></head><body>${html}</body></html>`;
  const h = typeof height === "number" && height >= 40 && height <= 1200 ? height : 300;

  return (
    <iframe
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      title="Custom card"
      style={{
        width: "100%",
        maxWidth: 480,
        height: h,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-soft)",
        display: "block",
      }}
    />
  );
}

/**
 * A card composed in the admin card builder from the CustomElement vocabulary.
 * Rendered defensively: the elements come from stored model output, so an
 * unknown kind or a malformed entry is skipped, never a crash in a visitor's
 * chat. External links open in a new tab like every other card link here.
 */
function CustomCard({ title, elements }: { title?: string; elements: CustomElement[] }) {
  if (!Array.isArray(elements)) return null;
  return (
    <div data-fill="bg-soft" style={{ ...card, maxWidth: 480 }}>
      {title && (
        <strong style={{ fontSize: 15, fontFamily: "var(--font-heading)", display: "block", marginBottom: 8 }}>
          {title}
        </strong>
      )}
      {elements.map((el, i) => (
        <CustomEl key={i} el={el} />
      ))}
    </div>
  );
}

function CustomEl({ el }: { el: CustomElement }) {
  if (!el || typeof el !== "object") return null;
  switch (el.kind) {
    case "heading":
      return (
        <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-heading)", margin: "10px 0 4px" }}>
          {el.text}
        </div>
      );
    case "text":
      return (
        <p style={{ fontSize: 14, color: "var(--on-bg-soft)", lineHeight: 1.55, margin: "4px 0" }}>{el.text}</p>
      );
    case "list":
      if (!Array.isArray(el.items)) return null;
      return (
        <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
          {el.items.map((it, i) => (
            <li key={i} style={{ fontSize: 14, color: "var(--on-bg-soft)", lineHeight: 1.55 }}>
              {it}
            </li>
          ))}
        </ul>
      );
    case "badges":
      if (!Array.isArray(el.items)) return null;
      return (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
          {el.items.map((it, i) => (
            <span key={i} style={{ fontSize: 11, color: "var(--accent-on-bg-soft)" }}>
              #{it}
            </span>
          ))}
        </div>
      );
    case "stats":
      if (!Array.isArray(el.items)) return null;
      return (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "8px 0" }}>
          {el.items.map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--on-bg-soft)" }}>{s?.value}</div>
              <div style={{ fontSize: 11, color: "var(--on-bg-soft)", opacity: 0.75 }}>{s?.label}</div>
            </div>
          ))}
        </div>
      );
    case "buttons":
      if (!Array.isArray(el.items)) return null;
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 2px" }}>
          {el.items.map((b, i) => (
            <a key={i} href={b?.url} target="_blank" rel="noreferrer" style={{ ...linkBtn, ...(i === 0 ? liveBtn : {}) }}>
              {b?.label}
            </a>
          ))}
        </div>
      );
    case "image":
      if (!el.src) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={el.src} alt={el.alt ?? ""} style={{ width: "100%", borderRadius: "var(--radius-sm)", margin: "6px 0" }} />;
    case "quote":
      return (
        <blockquote
          style={{
            margin: "8px 0",
            paddingLeft: 12,
            borderLeft: "2px solid var(--accent-on-bg-soft)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--on-bg-soft)",
          }}
        >
          {el.text}
          {el.by && <div style={{ fontSize: 12, marginTop: 4, fontStyle: "normal", opacity: 0.75 }}>— {el.by}</div>}
        </blockquote>
      );
    case "divider":
      return <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "10px 0" }} />;
    default:
      return null;
  }
}

/** The external scheduler: one card, one button, opens in a new tab. */
function BookingLinkCard({ url, name }: { url: string; name: string }) {
  return (
    <div data-fill="bg-soft" style={{ ...card, maxWidth: 440 }}>
      <strong style={{ fontSize: 15, fontFamily: "var(--font-heading)" }}>
        Book a time with {name}
      </strong>
      <p style={{ color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 13, margin: "6px 0 12px" }}>
        Pick a slot that suits you — it goes straight onto the calendar.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{ ...linkBtn, ...liveBtn, padding: "10px 18px", display: "inline-block" }}
      >
        Open booking page
      </a>
    </div>
  );
}

function ContactForm({ bookingLink }: { bookingLink: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit() {
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Something went wrong.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("Network error. Try again.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div data-fill="bg-soft" style={{ ...card, borderColor: "var(--success-on-bg-soft)" }}>
        <strong style={{ fontSize: 15 }}>Got it — thank you.</strong>
        <p style={{ color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 14, marginTop: 6 }}>
          Your message reached Blake. He&apos;ll get back to you at {email}.
        </p>
      </div>
    );
  }

  return (
    <div data-fill="bg-soft" style={{ ...card, maxWidth: 440 }}>
      <strong style={{ fontSize: 15, fontFamily: "var(--font-heading)" }}>Leave your details</strong>
      <p style={{ color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 13, margin: "6px 0 12px" }}>
        Drop your info and a note — it goes straight to Blake.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        style={cf}
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        type="email"
        style={cf}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Your message"
        rows={3}
        style={{ ...cf, resize: "vertical" }}
      />
      {state === "error" && (
        <p style={{ color: "var(--danger-on-bg-soft)", fontSize: 13, marginBottom: 8 }}>{error}</p>
      )}
      <button
        onClick={submit}
        disabled={state === "sending" || !name || !email || !message}
        style={{
          ...linkBtn,
          ...liveBtn,
          padding: "10px 18px",
          opacity: state === "sending" || !name || !email || !message ? 0.55 : 1,
        }}
      >
        {state === "sending" ? "Sending…" : "Send to Blake"}
      </button>
      {bookingLink && (
        <p style={{ fontSize: 13, color: "var(--on-bg-soft)", margin: "12px 0 0" }}>
          Rather talk it through?{" "}
          <a
            href={bookingLink}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--on-bg-soft)", textDecoration: "underline" }}
          >
            Book a time directly
          </a>
        </p>
      )}
    </div>
  );
}

type Slot = { start: string; end: string };
type SlotsPayload = {
  enabled: boolean;
  connected: boolean;
  timezone: string;
  minutes: number;
  slots: Slot[];
};
type Confirmed = { start: string; end: string; meetUrl: string | null };

/**
 * The booking card: real open times from Blake's calendar, picked and confirmed
 * in the chat.
 *
 * Slots are fetched on mount rather than carried in the block, because a card
 * scrolled back to ten minutes later would otherwise still be offering times
 * that have since been taken. A lost race (409) refetches rather than just
 * apologising, so the visitor's next tap is against fresh data.
 *
 * Everything is rendered in the VISITOR's timezone, with Blake's named
 * underneath — the commonest way a booking UI wastes someone's morning is by
 * quietly showing them somebody else's clock.
 */
function BookingCard() {
  const [data, setData] = useState<SlotsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [done, setDone] = useState<Confirmed | null>(null);
  // Resolved after mount so the server and the first client render agree.
  const [tz, setTz] = useState("");

  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/booking/slots");
      const body = (await res.json()) as SlotsPayload & { ok?: boolean };
      if (!res.ok || !body.ok) {
        setFailed(true);
        return;
      }
      setData(body);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (done) return <BookingDone confirmed={done} tz={tz} />;

  if (failed) {
    return <Empty>Couldn&apos;t reach the calendar just now — try the contact form instead.</Empty>;
  }
  if (!data) return <Empty>Checking Blake&apos;s calendar…</Empty>;
  if (!data.enabled || !data.connected) {
    return <Empty>Booking isn&apos;t open right now — the contact form is the way in.</Empty>;
  }
  if (data.slots.length === 0) {
    return <Empty>No open times in the next couple of weeks. Try the contact form.</Empty>;
  }

  const byDay = groupByDay(data.slots, tz);
  const days = [...byDay.keys()];
  const activeDay = day && byDay.has(day) ? day : days[0];

  if (picked) {
    return (
      <BookingForm
        slot={picked}
        tz={tz}
        onCancel={() => setPicked(null)}
        onDone={setDone}
        onStale={async () => {
          setPicked(null);
          await load();
        }}
      />
    );
  }

  return (
    <div data-fill="bg-soft" style={{ ...card, maxWidth: 440 }}>
      <strong style={{ fontSize: 15, fontFamily: "var(--font-heading)" }}>Book a time</strong>
      <p style={{ color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 13, margin: "6px 0 12px" }}>
        {data.minutes} minutes, live from Blake&apos;s calendar. Times shown in
        {tz ? ` your timezone (${tz})` : " your local time"}.
      </p>

      <div style={chipRow}>
        {days.map((key) => (
          <button
            key={key}
            onClick={() => setDay(key)}
            style={{ ...linkBtn, ...(key === activeDay ? liveBtn : {}), cursor: "pointer" }}
          >
            {dayLabel(byDay.get(key)![0].start, tz)}
          </button>
        ))}
      </div>

      <div style={{ ...chipRow, marginTop: 10 }}>
        {(byDay.get(activeDay) ?? []).map((s) => (
          <button
            key={s.start}
            onClick={() => setPicked(s)}
            style={{ ...linkBtn, cursor: "pointer" }}
          >
            {timeLabel(s.start, tz)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Name, email and an optional note, then the slot is claimed. */
function BookingForm({
  slot,
  tz,
  onCancel,
  onDone,
  onStale,
}: {
  slot: Slot;
  tz: string;
  onCancel: () => void;
  onDone: (c: Confirmed) => void;
  onStale: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  async function submit() {
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, note, start: slot.start, guestTz: tz }),
      });
      const body = await res.json();
      if (res.status === 409) {
        // Somebody took it between the card loading and this click.
        await onStale();
        return;
      }
      if (!res.ok || !body.ok) {
        setError(body.error || "Something went wrong.");
        setState("error");
        return;
      }
      onDone({ start: body.start, end: body.end, meetUrl: body.meetUrl ?? null });
    } catch {
      setError("Network error. Try again.");
      setState("error");
    }
  }

  const ready = !!name && !!email && state !== "sending";
  return (
    <div data-fill="bg-soft" style={{ ...card, maxWidth: 440 }}>
      <strong style={{ fontSize: 15, fontFamily: "var(--font-heading)" }}>
        {dayLabel(slot.start, tz)} at {timeLabel(slot.start, tz)}
      </strong>
      <p style={{ color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 13, margin: "6px 0 12px" }}>
        Your details, and it&apos;s on both calendars.
      </p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={cf} />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email (the invite goes here)"
        type="email"
        style={cf}
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What's it about? (optional)"
        rows={2}
        style={{ ...cf, resize: "vertical" }}
      />
      {state === "error" && (
        <p style={{ color: "var(--danger-on-bg-soft)", fontSize: 13, marginBottom: 8 }}>{error}</p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={submit}
          disabled={!ready}
          style={{ ...linkBtn, ...liveBtn, padding: "10px 18px", opacity: ready ? 1 : 0.55 }}
        >
          {state === "sending" ? "Booking…" : "Confirm"}
        </button>
        <button onClick={onCancel} style={{ ...linkBtn, cursor: "pointer" }}>
          Pick another
        </button>
      </div>
    </div>
  );
}

function BookingDone({ confirmed, tz }: { confirmed: Confirmed; tz: string }) {
  return (
    <div data-fill="bg-soft" style={{ ...card, borderColor: "var(--success-on-bg-soft)" }}>
      <strong style={{ fontSize: 15 }}>You&apos;re booked.</strong>
      <p style={{ color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 14, marginTop: 6 }}>
        {dayLabel(confirmed.start, tz)} at {timeLabel(confirmed.start, tz)} — the invite is on its way
        to your inbox.
      </p>
      {confirmed.meetUrl && (
        <a
          href={confirmed.meetUrl}
          target="_blank"
          rel="noreferrer"
          style={{ ...linkBtn, ...liveBtn, display: "inline-block", marginTop: 10 }}
        >
          ↗ Video link
        </a>
      )}
    </div>
  );
}

/**
 * Slots bucketed by the visitor's local calendar date. Keyed with `en-CA`
 * because it renders YYYY-MM-DD, which sorts correctly as a string — the slots
 * arrive in order, so insertion order carries through.
 */
function groupByDay(slots: Slot[], tz: string): Map<string, Slot[]> {
  const out = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = new Date(s.start).toLocaleDateString("en-CA", tz ? { timeZone: tz } : {});
    const bucket = out.get(key);
    if (bucket) bucket.push(s);
    else out.set(key, [s]);
  }
  return out;
}

function dayLabel(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(tz ? { timeZone: tz } : {}),
  });
}

function timeLabel(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** How many roles show before the card offers to unfold the rest. */
const TIMELINE_VISIBLE = 4;

/**
 * Work history as a vertical timeline: a rail down the left, a dot per role.
 *
 * Entries render in the order they were stored — see experienceTimelineBlock in
 * lib/cards.ts for why nothing here tries to sort free-text dates.
 *
 * A long career would otherwise push the rest of the conversation off the
 * screen, so only the first few roles are drawn until the visitor asks for the
 * rest. The rail stops at the last dot on show rather than running past it,
 * which is what makes it read as a timeline instead of a bordered list.
 */
function Timeline({ items, summary }: { items: TimelineEntry[]; summary: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, TIMELINE_VISIBLE);
  const hidden = items.length - shown.length;

  return (
    <div data-fill="bg-soft" style={{ ...card, maxWidth: 480 }}>
      <strong style={{ fontSize: 15, fontFamily: "var(--font-heading)" }}>Experience</strong>
      {summary && (
        <p style={{ color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 13, margin: "6px 0 0" }}>
          {summary}
        </p>
      )}

      <div style={{ marginTop: 14 }}>
        {shown.map((e, i) => (
          <div
            key={`${e.role}-${e.company}-${i}`}
            style={{
              position: "relative",
              paddingLeft: 20,
              paddingBottom: i === shown.length - 1 ? 0 : 18,
              // The rail is this element's left edge, so it spans exactly the
              // entry it belongs to and ends with the final one.
              borderLeft: `1px solid ${i === shown.length - 1 ? "transparent" : "var(--border)"}`,
            }}
          >
            {/*
              --accent-on-bg-soft, not --primary: the theme lets `surface`
              double as `--primary`, which on the default palette paints a
              navy dot onto a navy card. This token is derived by readableOn()
              against this exact surface, so the dot survives any theme.
            */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: -4.5,
                top: 4,
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "var(--accent-on-bg-soft)",
              }}
            />
            {e.dates && (
              <div style={{ fontSize: 11, color: "var(--accent-on-bg-soft)", marginBottom: 2 }}>
                {e.dates}
              </div>
            )}
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--on-bg-soft)" }}>
              {e.role || e.company}
            </div>
            {e.company && e.role && (
              <div style={{ fontSize: 13, color: "var(--on-bg-soft)", opacity: 0.8 }}>{e.company}</div>
            )}
            {e.description && (
              <p style={{ fontSize: 13, color: "var(--on-bg-soft)", lineHeight: 1.55, marginTop: 5 }}>
                {e.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {(hidden > 0 || all) && items.length > TIMELINE_VISIBLE && (
        <button
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          style={{ ...linkBtn, cursor: "pointer", marginTop: 14 }}
        >
          {all ? "Show less ▴" : `${hidden} earlier role${hidden === 1 ? "" : "s"} ▾`}
        </button>
      )}
    </div>
  );
}

function ProjectCardView({ p, big }: { p: ProjectCard; big?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!p.detail && p.detail.trim().length > 0;
  return (
    <div data-fill="bg-soft" style={{ ...card, ...(big ? { maxWidth: 480 } : {}) }}>
      {p.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageUrl} alt={p.name} style={{ width: "100%", borderRadius: "var(--radius-sm)", marginBottom: 10 }} />
      )}
      <h3 style={{ fontSize: 17, marginBottom: 6, fontFamily: "var(--font-heading)" }}>{p.name}</h3>
      <p style={{ color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 14, marginBottom: 10 }}>{p.blurb}</p>
      {open && hasDetail && (
        <p style={{ color: "var(--on-bg-soft)", fontSize: 14, lineHeight: 1.55, marginBottom: 10 }}>
          {p.detail}
        </p>
      )}
      {p.tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {p.tags.map((t) => (
            <span key={t} style={{ fontSize: 11, color: "var(--accent-on-bg-soft)" }}>
              #{t}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {hasDetail && (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            style={{ ...linkBtn, cursor: "pointer" }}
          >
            {open ? "Show less ▴" : "Learn more ▾"}
          </button>
        )}
        {p.githubUrl && (
          <a href={p.githubUrl} target="_blank" rel="noreferrer" style={linkBtn}>
            ⌥ GitHub
          </a>
        )}
        {p.liveUrl && (
          <a href={p.liveUrl} target="_blank" rel="noreferrer" style={{ ...linkBtn, ...liveBtn }}>
            ↗ Live
          </a>
        )}
      </div>
    </div>
  );
}

function Carousel({ items }: { items: PhotoCard[] }) {
  const [i, setI] = useState(0);
  const ph = items[i];
  const go = (d: number) => setI((v) => (v + d + items.length) % items.length);
  return (
    <div data-fill="bg-soft" style={card}>
      <div style={{ position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ph.src} alt={ph.description} style={{ width: "100%", borderRadius: "var(--radius-sm)", display: "block" }} />
        {items.length > 1 && (
          <>
            <button style={{ ...navArrow, left: 8 }} onClick={() => go(-1)} aria-label="Previous">
              ‹
            </button>
            <button style={{ ...navArrow, right: 8 }} onClick={() => go(1)} aria-label="Next">
              ›
            </button>
          </>
        )}
      </div>
      {ph.description && (
        <p style={{ color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 14, marginTop: 10 }}>{ph.description}</p>
      )}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
        {items.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            aria-label={`Go to photo ${idx + 1}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              border: "none",
              background: idx === i ? "var(--primary)" : "var(--border)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Filmstrip({ items }: { items: PhotoCard[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div data-fill="bg-soft" style={card}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
        {items.map((ph, idx) => (
          <button
            key={ph.id}
            onClick={() => setOpen(idx)}
            style={{ flex: "0 0 auto", border: "none", background: "none", padding: 0, cursor: "pointer" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ph.src}
              alt={ph.description}
              style={{ height: 96, width: 96, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
            />
          </button>
        ))}
      </div>
      {open !== null && (
        <div style={lightbox} onClick={() => setOpen(null)}>
          <div data-fill="surface" style={lightboxInner} onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={items[open].src} alt={items[open].description} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: "var(--radius-sm)" }} />
            {items[open].description && (
              <p style={{ color: "var(--on-surface)", fontSize: 15, marginTop: 12 }}>{items[open].description}</p>
            )}
            <button style={{ ...linkBtn, marginTop: 14 }} onClick={() => setOpen(null)}>
              Close ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div data-fill="bg-soft" style={{ ...card, color: "var(--on-bg-soft)", fontStyle: "italic", fontSize: 14 }}>{children}</div>
  );
}

const chipRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};
const grid: React.CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
};
const card: React.CSSProperties = {
  background: "var(--bg-soft)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--on-bg-soft)",
  padding: 16,
};
const linkBtn: React.CSSProperties = {
  fontSize: 13,
  padding: "7px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  color: "var(--on-surface)",
  background: "var(--surface)",
  textDecoration: "none",
};
const cf: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  marginBottom: 10,
  outline: "none",
  fontSize: 14,
  color: "var(--on-surface)",
};
const liveBtn: React.CSSProperties = {
  background: "var(--primary)",
  color: "var(--on-primary)",
  border: "none",
};
const navArrow: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 34,
  height: 34,
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--on-surface)",
  fontSize: 20,
  lineHeight: 1,
};
const lightbox: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(5,8,18,0.85)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
};
const lightboxInner: React.CSSProperties = {
  maxWidth: 720,
  width: "100%",
  textAlign: "center",
  background: "var(--surface)",
  color: "var(--on-surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: 20,
};
