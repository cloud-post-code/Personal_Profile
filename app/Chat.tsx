"use client";

import { useRef, useState, useEffect } from "react";
import { Cards, type UiBlock } from "./cards/Cards";

type Msg = {
  role: "user" | "assistant";
  content: string;
  cards?: UiBlock[];
};
type Starter = { q: string };

/** A couple of short words from a question, for the compact chip row. */
function shortLabel(q: string): string {
  const map: Record<string, string> = {
    "What's your background and past experience?": "Background",
    "Tell me about yourself and how you see the world.": "About me",
    "How can I connect with you?": "Connect",
    "What are your recent projects?": "Projects",
    "Show me a bit about your life?": "My life",
  };
  return map[q] ?? q.split(" ").slice(0, 2).join(" ");
}

export default function Chat({
  name,
  tagline,
  starters,
}: {
  name: string;
  tagline: string;
  starters: Starter[];
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = messages.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setLoading(true);
    setMessages((m) => [...m, { role: "assistant", content: "", cards: [] }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      const cards: UiBlock[] = [];

      const flush = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          try {
            const obj = JSON.parse(l);
            if (obj.t === "text") acc += obj.v;
            else if (obj.t === "card") cards.push(obj.v);
          } catch {
            /* partial line — ignore */
          }
        }
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc, cards: [...cards] };
          return copy;
        });
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        flush(decoder.decode(value, { stream: true }));
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content:
            "Hmm, I hit a snag reaching my brain (the API). Try again in a moment — or reach out to Blake directly.",
          cards: [],
        };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.shell}>
      <div style={styles.topbar}>
        <a href="/" style={styles.brand}>
          <span style={styles.dot} /> {name}
        </a>
      </div>

      {!started ? (
        <section style={styles.hero}>
          <h1 style={styles.h1}>
            Hey, I&apos;m {name}.<br />
            <span style={styles.h1accent}>Talk to me.</span>
          </h1>
          <p style={styles.sub}>{tagline}</p>

          <Composer input={input} setInput={setInput} onSend={() => send(input)} loading={loading} big />

          <div style={styles.starters}>
            {starters.map((s) => (
              <button key={s.q} style={styles.chip} onClick={() => send(s.q)}>
                {s.q}
              </button>
            ))}
          </div>
          <p style={styles.footnote}>
            This whole site is a conversation. An AI host answers as {name}, using only what
            he&apos;s shared — and can show you cards, projects, and galleries right here.
          </p>
        </section>
      ) : (
        <section style={styles.chatWrap}>
          <div ref={scrollRef} style={styles.thread}>
            {messages.map((m, i) => (
              <Bubble
                key={i}
                role={m.role}
                content={m.content}
                cards={m.cards}
                loading={loading && i === messages.length - 1}
              />
            ))}
          </div>
          <div style={styles.composerDock}>
            <Composer input={input} setInput={setInput} onSend={() => send(input)} loading={loading} />
            <div style={styles.startersRow}>
              {starters.slice(0, 5).map((s) => (
                <button key={s.q} style={styles.chipSmall} onClick={() => send(s.q)} title={s.q}>
                  {shortLabel(s.q)}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Composer({
  input,
  setInput,
  onSend,
  loading,
  big,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  loading: boolean;
  big?: boolean;
}) {
  return (
    <div style={{ ...styles.composer, ...(big ? styles.composerBig : {}) }}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSend()}
        placeholder="Ask me anything…"
        style={styles.input}
        autoFocus
      />
      <button
        onClick={onSend}
        disabled={loading || !input.trim()}
        style={{ ...styles.sendBtn, opacity: loading || !input.trim() ? 0.5 : 1 }}
      >
        {loading ? "…" : "Send ↵"}
      </button>
    </div>
  );
}

function Bubble({
  role,
  content,
  cards,
  loading,
}: {
  role: "user" | "assistant";
  content: string;
  cards?: UiBlock[];
  loading: boolean;
}) {
  const isUser = role === "user";
  const hasCards = !!cards && cards.length > 0;
  return (
    <div style={{ ...styles.row, flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      {(content || !hasCards) && (
        <div style={isUser ? styles.userBubble : styles.botBubble}>
          {content ? (
            <span style={{ whiteSpace: "pre-wrap" }}>{content}</span>
          ) : loading ? (
            <span style={styles.typing}>
              <i style={{ ...styles.tdot, animationDelay: "0ms" }} />
              <i style={{ ...styles.tdot, animationDelay: "150ms" }} />
              <i style={{ ...styles.tdot, animationDelay: "300ms" }} />
            </span>
          ) : null}
        </div>
      )}
      {hasCards && (
        <div style={{ width: "100%", marginTop: 8 }}>
          {cards!.map((c, i) => (
            <Cards key={i} block={c} />
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: { minHeight: "100dvh", display: "flex", flexDirection: "column" },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 24px",
    maxWidth: 980,
    width: "100%",
    margin: "0 auto",
  },
  brand: {
    fontFamily: "var(--font-heading)",
    fontWeight: 700,
    fontSize: 18,
    color: "var(--text)",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "var(--accent)",
    boxShadow: "0 0 12px var(--accent)",
    display: "inline-block",
  },
  hero: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px 20px 80px",
    maxWidth: 720,
    margin: "0 auto",
    width: "100%",
  },
  h1: { fontSize: "clamp(40px, 8vw, 68px)", lineHeight: 1.02, marginBottom: 16 },
  h1accent: {
    background: "linear-gradient(90deg, var(--primary-soft), var(--accent))",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  sub: { color: "var(--text-muted)", fontSize: 18, marginBottom: 36, maxWidth: 520 },

  composer: {
    display: "flex",
    gap: 8,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: 8,
    width: "100%",
    boxShadow: "var(--glow-primary)",
  },
  composerBig: { maxWidth: 560, marginBottom: 28 },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    fontSize: 16,
    padding: "12px 14px",
  },
  sendBtn: {
    background: "linear-gradient(90deg, var(--primary), var(--primary-soft))",
    color: "white",
    border: "none",
    borderRadius: "var(--radius-md)",
    padding: "0 18px",
    fontWeight: 600,
    fontSize: 14,
  },

  starters: { display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 620 },
  chip: {
    background: "var(--bg-soft)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    borderRadius: 999,
    padding: "10px 16px",
    fontSize: 14,
  },
  footnote: { color: "var(--text-muted)", fontSize: 13, marginTop: 32, maxWidth: 460 },

  chatWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    maxWidth: 820,
    width: "100%",
    margin: "0 auto",
    padding: "0 16px 16px",
    minHeight: 0,
  },
  thread: { flex: 1, overflowY: "auto", padding: "12px 4px", display: "flex", flexDirection: "column", gap: 14 },
  row: { display: "flex", width: "100%" },
  userBubble: {
    background: "linear-gradient(90deg, var(--primary), var(--primary-soft))",
    color: "white",
    padding: "12px 16px",
    borderRadius: "18px 18px 4px 18px",
    maxWidth: "80%",
    fontSize: 15,
  },
  botBubble: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    padding: "12px 16px",
    borderRadius: "18px 18px 18px 4px",
    maxWidth: "80%",
    fontSize: 15,
  },
  typing: { display: "inline-flex", gap: 5, alignItems: "center", height: 20 },
  tdot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: "var(--primary-soft)",
    display: "inline-block",
    animation: "blink 1s infinite",
  },

  composerDock: { paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 },
  startersRow: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" },
  chipSmall: {
    background: "var(--bg-soft)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 13,
    lineHeight: 1.2,
  },
};
