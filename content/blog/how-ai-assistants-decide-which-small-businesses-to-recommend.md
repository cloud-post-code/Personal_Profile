---
title: How AI Assistants Decide Which Small Businesses to Recommend
description: How ChatGPT, Claude, and Gemini select and cite small businesses, and the concrete markup, crawl, and content changes that get an SMB into AI answers.
date: 2026-08-11
topic: ai-discoverability
keywords: AI discoverability, SMB AI visibility, ChatGPT recommendations, structured data, AI search optimization, generative engine optimization
---

Small businesses spent two decades learning to rank in a list of ten blue links. That model is ending. When a customer asks ChatGPT for a bookkeeper in Austin or asks Claude to compare local HVAC companies, the assistant returns one synthesized answer with a handful of names in it. Either your business is one of those names or you do not exist in that conversation.

Most advice on this topic stays vague. This post goes one level down: what these systems actually read, how they retrieve, and which changes to your site have a mechanical effect on whether you get recommended.

## The two pipelines that produce an AI recommendation

When an assistant names a business, the name arrived through one of two paths, and they have different optimization surfaces.

**Path one is training data.** Models memorize entities that appear consistently across their training corpus. If your business name, category, and location co-occur across your site, directories, reviews, and press, the model forms a stable association. This is slow to influence and updates only when a model retrains.

**Path two is retrieval.** For anything local, current, or comparative, assistants run live web searches, fetch pages, and synthesize from what they retrieve. ChatGPT browses with OpenAI's crawlers, and Google's AI features draw on the same index as Search. This path is where an SMB can move the needle in weeks, not years, because retrieval rewards pages that are fetchable, parseable, and quotable today.

The practical conclusion: treat AI discoverability as a retrieval problem first. You are optimizing to be fetched, extracted, and cited inside a generated answer.

## Step one: let the crawlers in

Retrieval fails at the front door more often than anywhere else. Each major AI provider fetches with named user agents, and many SMB sites block them by accident through aggressive bot rules, CDN firewall defaults, or a stale robots.txt.

Check your robots.txt and firewall rules for these agents:

- **GPTBot** and **OAI-SearchBot** for OpenAI. OpenAI documents these separately because they do different jobs: one gathers training data, the other powers search citations in ChatGPT. Blocking OAI-SearchBot removes you from ChatGPT's cited answers specifically.
- **ClaudeBot** for Anthropic.
- **Google-Extended** controls Gemini training, while normal Googlebot access feeds AI Overviews.

Cloudflare's Radar data shows AI crawler traffic has grown into a major share of total bot traffic on the web, which means these fetches are already hitting your site. The only question is whether they get a 200 response or a 403.

## Step two: structured data is how machines read you

Language models are good at prose, but retrieval systems and answer engines lean heavily on structured signals to establish facts about an entity. Schema.org markup in JSON-LD is the standard, and for an SMB three types do most of the work:

- **LocalBusiness** (or a specific subtype like Plumber or AccountingService) with name, address, phone, geo coordinates, opening hours, and price range.
- **Service** or **Product** entries describing what you actually sell, with plain-language descriptions.
- **FAQPage** for the questions customers genuinely ask, because a question-and-answer block maps almost one to one onto the question-and-answer format of an assistant conversation.

Google's own documentation is explicit that structured data helps its systems understand page content and eligibility for rich results, and the same parsed facts flow into AI-generated answers. The key technical detail: the markup must agree with the visible page content. Contradictions between JSON-LD and rendered text get your markup ignored.

## Step three: write pages that survive extraction

A generative answer is built from extracted passages. Retrieval systems chunk your pages, embed the chunks, and pull the few passages that best match the question. That mechanic dictates a writing style:

1. One clear claim per paragraph, with the business name and location near the claim. A paragraph that says "We serve the Denver metro area with same-day furnace repair, licensed since 2009" is a perfect extraction unit. A paragraph of mood copy is not.
2. Answer real questions verbatim. Harvest phrasing from actual customer emails and calls, then use those exact questions as H2 headings with a direct answer in the first sentence below.
3. State numbers and specifics. Models preferentially cite pages that contain concrete figures, dates, and credentials, because those make an answer verifiable.

Research groups studying this under the name generative engine optimization found that adding citations, quotations, and statistics to pages measurably increased visibility in generated answers, in some experiments by 30 to 40 percent. The mechanism is simple: answer engines want to ground their claims, and pages that carry groundable facts are safer to cite.

## Step four: consistency across the entity graph

Assistants cross-check. If your Google Business Profile says one address, your site footer another, and a directory a third, you look like an ambiguous entity, and ambiguous entities get dropped from answers in favor of clean ones. Audit name, address, phone, hours, and category descriptions everywhere they appear and make them byte-for-byte consistent. This is tedious and it is also the cheapest ranking factor in the entire stack.

## What to measure

You cannot manage what you cannot see, and AI referral traffic is measurable today. In your analytics, segment sessions by referrer for chatgpt.com, perplexity.ai, gemini.google.com, and copilot.microsoft.com. Then run a monthly hand test: ask each major assistant the five questions your customers would ask, and record whether you appear, what the assistant says, and which page it cites. McKinsey's State of AI research shows the majority of organizations now use generative AI regularly, and consumer behavior is following the same curve, so this referral segment should trend up. If it does not, the failure is in one of the four steps above, and the hand test tells you which.

## The window

The technical bar here is low. Most SMB competitors have not unblocked AI crawlers, have no structured data, and write pages that extract poorly. That is precisely why acting now matters: assistants form stable entity associations, early citations compound into training data for the next model generation, and the businesses that are quotable today become the default answers of the next few years.

## Sources

- Google Search Central, [Introduction to structured data markup](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- OpenAI, [Overview of OpenAI crawlers and bots](https://platform.openai.com/docs/bots)
- Cloudflare Radar, [AI bot and crawler traffic trends](https://radar.cloudflare.com/bots)
- McKinsey and Company, [The State of AI](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai)
- Schema.org, [LocalBusiness type definition](https://schema.org/LocalBusiness)
