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
| Violet soft | `#A48BFF` | Gradients, hovers |
| Amber (accent) | `#FFB84D` | The spark — live dots, highlights, CTAs |
| Text | `#E8ECFF` | Body |
| Muted | `#9AA3C7` | Secondary text |

High contrast, glow-y accents. Two ambient radial gradients (violet + amber)
sit behind everything so the page feels lit from within.

## Type

- **Headings:** Space Grotesk — geometric, modern, characterful.
- **Body:** Inter — clean, highly readable.
- **Mono:** JetBrains Mono — for code/terminal moments.

All three are open-source, commercial-safe, and self-hosted via `next/font`.

## Signature moves

- **Chat-first homepage** — the conversation is the hero.
- **Gradient wordmark** (violet → amber) on the big headline.
- **Glow** on the primary composer and login card.
- **Amber "live" dot** in the wordmark — the site feels awake.

## To rebrand from your real vibe

1. Drop your LinkedIn headline / About / a few posts into a chat with me.
2. I'll pull real colors + a font pairing + voice from it.
3. Edit `lib/theme.ts` (tokens) and mirror them in `app/globals.css` `:root`.
4. Update the persona/bio in the admin so the chatbot speaks in your voice.
