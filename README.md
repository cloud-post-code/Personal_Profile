# Blake — Personal Site (agent chatbot)

Not a normal personal website. The homepage **is a conversation**: an AI host
(powered by Claude) answers questions about Blake — his projects, background,
worldview, and recent posts — using only the content Blake adds in the admin
portal. There's a public site and a password-gated admin control room.

## What's here

- **Chat homepage** (`/`) — chat box + 5 starter questions, streaming answers.
- **Projects page** (`/projects`) — curated projects, scanned links, photo gallery.
- **Admin portal** (`/admin`) — password login → dashboard to:
  - edit profile, bio & the chatbot's **persona** (how it talks),
  - **add links** that get fetched + summarized/tagged by Claude,
  - **upload photos**,
  - manage projects.

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

## Deploy to Railway

1. Push this repo to GitHub (see below).
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
