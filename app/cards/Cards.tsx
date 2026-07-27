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
export type UiBlock =
  | { type: "projects"; items: ProjectCard[] }
  | { type: "project"; item: ProjectCard | null }
  | { type: "gallery"; layout: "carousel" | "filmstrip"; items: PhotoCard[] }
  | { type: "contact" }
  | { type: "booking" };

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
    return <ContactForm />;
  }
  if (block.type === "booking") {
    return <BookingCard />;
  }
  return null;
}

function ContactForm() {
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

function ProjectCardView({ p, big }: { p: ProjectCard; big?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!p.detail && p.detail.trim().length > 0;
  return (
    <div data-fill="bg-soft" style={{ ...card, ...(big ? { maxWidth: 480 } : {}) }}>
      {p.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageUrl} alt={p.name} style={{ width: "100%", borderRadius: 10, marginBottom: 10 }} />
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
        <img src={ph.src} alt={ph.description} style={{ width: "100%", borderRadius: 10, display: "block" }} />
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
              style={{ height: 96, width: 96, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
            />
          </button>
        ))}
      </div>
      {open !== null && (
        <div style={lightbox} onClick={() => setOpen(null)}>
          <div data-fill="surface" style={lightboxInner} onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={items[open].src} alt={items[open].description} style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 10 }} />
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
  borderRadius: 999,
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
