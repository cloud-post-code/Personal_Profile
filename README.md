# Blake — Personal Site (agent chatbot)

Not a normal personal website. The homepage **is a conversation**: an AI host
(powered by Claude) answers questions about Blake — his projects, background,
worldview, and recent posts — using only the content Blake adds in the admin
portal. There's a public site and a password-gated admin control room.

## What's here

- **Chat homepage** (`/`) — chat box + 5 starter questions, streaming answers.
  The bot renders **rich A2UI cards inline** — project cards, single-project
  cards, and photo galleries (carousel or filmstrip+lightbox) — via Claude tool
  use, not just plain text.
- **Projects page** (`/projects`) — curated project cards (GitHub + Live links),
  extracted posts/docs/notes, photo gallery.
- **Admin portal** (`/admin`) — password login → dashboard to:
  - edit profile, bio/history & the chatbot's **persona** (voice, opinions),
  - **Add knowledge** — one ingest for a **link, a PDF, or pasted text/markdown**;
    each is fetched/parsed then summarized + tagged by Claude and becomes
    chatbot knowledge,
  - **Projects** — each with a **GitHub URL + Live URL** (either optional) and an
    optional cover image; rendered as cards,
  - **Photos** — on upload, **Claude vision writes a one-paragraph description**
    (editable); exposed individually and in galleries.

### A2UI (agent-to-UI)

The chat API (`app/api/chat/route.ts`) gives Claude three tools —
`show_projects`, `show_project`, `show_gallery` — and streams an ndjson protocol
(`{"t":"text"|"card", ...}`) to the client. `app/cards/Cards.tsx` renders each
card block. Ask the bot "show me your projects" or "let me see some photos" and
it renders cards, not paragraphs.

## Stack

Next.js 15 (App Router) · React 19 · Prisma + Postgres · Anthropic Claude API ·
photo uploads to a Railway volume. One theme file (`lib/theme.ts`) controls the
whole look.

## Brand

See [`BRAND.md`](./BRAND.md). The design ("Curious builder" — ink navy, signal
violet, amber, Space Grotesk + Inter) is invented as a starting point. To
rebrand from your real LinkedIn vibe, edit `lib/theme.ts` + `app/globals.css`.

## Local setup

```bash
npm install
cp .env.example .env          # fill in ANTHROPIC_API_KEY + ADMIN_PASSWORD + AUTH_SECRET
# For DATABASE_URL: point at a local Postgres, OR use Docker:
#   docker run -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=blake -p 5432:5432 -d postgres
#   DATABASE_URL="postgresql://postgres:pw@localhost:5432/blake?schema=public"

npm run db:migrate            # create tables
npm run db:seed               # seed the placeholder Blake persona
npm run dev                   # http://localhost:3000
```

Then open `/admin`, log in with `ADMIN_PASSWORD`, and start adding content.

> Prefer SQLite for a zero-Postgres local run? In `prisma/schema.prisma` set
> `provider = "sqlite"` and `DATABASE_URL="file:./dev.db"`, then `db:migrate`.

## SQLite (local) vs Postgres (deploy)

The repo is developed on **SQLite** locally (`prisma/dev.db`) and runs on
**Postgres** in production. Only the schema's `provider` line + long-text
annotations differ. A helper flips it:

```bash
node scripts/use-postgres.mjs            # -> postgres (for deploy)
node scripts/use-postgres.mjs --sqlite   # -> sqlite (for local dev)
```

**Before you push/deploy, run `node scripts/use-postgres.mjs`** so the committed
schema targets Postgres.

## Deploy to Railway

1. Run `node scripts/use-postgres.mjs`, then push this repo to GitHub (see below).
2. In Railway: **New Project → Deploy from GitHub repo** → pick this repo.
3. Add a **Postgres** plugin — Railway sets `DATABASE_URL` automatically.
4. Add a **Volume**, mount it at `/data`, and set `UPLOAD_DIR=/data/uploads`.
5. Set env vars: `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `AUTH_SECRET`,
   `CLAUDE_MODEL` (e.g. `claude-sonnet-5`), `NEXT_PUBLIC_SITE_URL`.
6. Deploy. The build runs `prisma migrate deploy` automatically.
7. Run the seed once from the Railway shell: `npm run db:seed` (optional).

## Push to GitHub

```bash
cd blake-personal-site
git init
git add .
git commit -m "feat: Blake agent-chatbot personal site"
git branch -M main
git remote add origin https://github.com/cloud-post-code/Personal_Profile.git
git push -u origin main
```

## Notes

- **LinkedIn scraping**: LinkedIn blocks bots, so auto-scans of LinkedIn URLs
  are often thin. The admin lets you paste/edit the summary manually — that's
  what the chatbot uses. Public blog/GitHub/article URLs scrape well.
- The chatbot only states facts you've added. It won't invent credentials.

## Known audit notes

- `npm audit` reports advisories in **`sharp`/libvips** (transitive via Next.js
  image optimization, currently at latest `sharp@0.34.5`). No non-breaking fix
  is published upstream yet. This app serves uploaded images through a raw route
  and does not call sharp directly, so exposure is minimal. Re-run `npm audit`
  periodically and bump `next` when a patched release lands.
