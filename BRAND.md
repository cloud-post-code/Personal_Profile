# Blake — Brand Guide

> Invented as a starting point (no LinkedIn material was available). Everything
> here maps to `lib/theme.ts` + `app/globals.css`. Change those two files to
> rebrand and the whole site follows.

## The feeling

**"Curious builder."** Technical but warm. Playful but not gimmicky. Like a
sharp friend who actually ships things — confident, a little retro-future. The
site leans into its own gimmick honestly: the homepage *is* a chat, because
Blake would rather talk than list bullet points.

## Color

| Role | Hex | Use |
|------|-----|-----|
| Ink navy (bg) | `#0B1020` | Base "night terminal" background |
| Surface | `#1A2140` | Cards, bubbles, panels |
| Signal violet (primary) | `#7C5CFF` | Brand accent, buttons, links |
| Amber (accent) | `#FFB84D` | The spark — live dots, highlights, CTAs |
| Text | `#E8ECFF` | Body |

High contrast, flat solid colors. No gradients or glows — the background is a
single solid, and every accent is a flat fill. The three admin theme colors
(Background / Primary / Accent) are the single source of truth and everything
across the site derives from them.

**One text color per fill.** There is no muted grey. Every fill — background,
bg-soft, surface, accent — owns exactly one foreground, and secondary text
(captions, hints, blurbs, timestamps) is that same color set in *italics*. A
lighter neutral would be a fourth color outside the contrast pairs, which is
how text ended up unreadable on themed fills in the first place.

## Type

- **Headings:** Space Grotesk — geometric, modern, characterful.
- **Body:** Inter — clean, highly readable.
- **Mono:** JetBrains Mono — for code/terminal moments.

All three are open-source, commercial-safe, and self-hosted via `next/font`.

## Signature moves

- **Chat-first homepage** — the conversation is the hero.
- **Flat amber wordmark** on the big headline.
- **Amber "live" dot** in the wordmark — the site feels awake.

## To rebrand from your real vibe

1. Drop your LinkedIn headline / About / a few posts into a chat with me.
2. I'll pull real colors + a font pairing + voice from it.
3. Edit `lib/theme.ts` (tokens) and mirror them in `app/globals.css` `:root`.
4. Update the persona/bio in the admin so the chatbot speaks in your voice.
