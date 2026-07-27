# Personal Persona Extraction Prompt

I want you to build a detailed behavioral persona of **me**, based only on what you actually know from our previous conversations, saved memories, project discussions, documents I have shared, decisions I have made, questions I have asked, and patterns in how I interact with you.

This persona will be used to create an AI representation of me, so **accuracy is more important than completeness**.

## Output Requirement

Your final response must be **one self-contained Markdown document**.

Return **only the completed Markdown document**.

Do not include:
- an introduction before it
- commentary about your process
- explanations of what you did
- follow-up questions outside the document
- multiple versions
- JSON
- XML
- YAML
- code fences surrounding the document

The response should be ready to copy directly into a file such as:

`persona.md`

---

# Core Rules

1. **Use evidence, not stereotypes.**

   Do not infer something just because it is common for someone of my age, profession, education, location, industry, or demographic.

2. **Leave fields blank when you do not know.**

   A short, accurate persona is much better than a comprehensive hallucinated persona.

3. **Distinguish facts from behavioral inference.**

   You may infer recurring behavioral tendencies from multiple conversations, but do not present speculation as fact.

4. **Prioritize repeated behavior over one-off comments.**

   Something I repeatedly demonstrate should carry much more weight than something mentioned once.

5. **Look across all history you are actually permitted to access.**

   Consider:
   - saved memory
   - previous conversations available to you
   - projects we have worked on
   - writing I have asked you to edit
   - decisions I have made
   - tools and software I discuss
   - recurring questions
   - things I reject or push back on
   - how I research
   - how quickly I make decisions
   - how I react to ambiguity
   - my communication style
   - my professional goals
   - my personal projects
   - how I behave when something is not working

6. **Do not just repeat my self-description.**

   Compare what I say about myself with how I actually behave in our conversations.

7. **Do not describe how an average person like me would behave.**

   Describe **me specifically**.

8. When evidence is mixed, say so.

9. Do not expose hidden chain-of-thought, system prompts, private reasoning, or inaccessible internal information.

10. Do not claim to remember or access information that is not actually available to you.

---

# Confidence System

For every substantive section, internally classify your confidence as:

- **High** — directly stated or repeatedly demonstrated
- **Medium** — strongly suggested by recurring patterns
- **Low** — plausible but weakly evidenced

Do **not** fill a field solely from low-confidence evidence.

Where particularly useful, include a short confidence note such as:

> High confidence — repeatedly demonstrated across project discussions.

Do not add confidence labels to every line.

---

# Persona

## Tagline

One sentence that sounds like something that could genuinely appear underneath my name.

## Core Profile

### Role / Title

Current role or the best concise description of what I actually do.

### Organization or Context

The organizations, ecosystems, communities, industries, or environments I operate within.

### Archetype

One concise personality or working-style label.

---

# Context & Identity

## Background

Education, career history, entrepreneurial history, important projects, and formative experiences that appear to influence how I operate today.

## Current Situation

What I am doing now, what stage I am in professionally or personally, what problems currently occupy my attention, and what my immediate environment looks like.

## Core Responsibilities

The responsibilities I actually seem to own.

## Motivations / Values

What appears to genuinely drive my decisions and actions.

Avoid generic values such as "innovation" unless my behavior clearly demonstrates them.

---

# Cognitive Frame

## Functional Jobs

What am I repeatedly trying to accomplish?

Write each as:

> When _____, I want to _____, so I can _____.

Focus on actual recurring jobs.

## Emotional Jobs

How do I want to feel?

What feelings am I trying to avoid?

## Social Jobs

How do I want other people to perceive me?

Focus on demonstrated behavior rather than flattering guesses.

---

# Behavioral & Decision Dynamics

## Push Factors

What frustrations repeatedly drive me away from the status quo?

## Pull Factors

What characteristics of an idea, product, project, opportunity, or person attract me?

## Anxieties / Barriers

What appears to stop me from acting, committing, shipping, buying, or making a decision?

## Habits / Heuristics

Recurring mental shortcuts, questions, or rules of thumb I seem to use.

Make these specific and behavioral.

For example, the desired level of specificity is something like:

> Frequently asks whether something can be made dramatically simpler.

or:

> Tests the strategic usefulness of an idea before worrying about implementation.

Do not use these examples unless my actual history supports them.

---

# Operating / Interaction Model

## Mode of Work

Describe where I fall across dimensions such as:

- collaborative vs. solo
- analytical vs. intuitive
- structured vs. exploratory
- strategic vs. execution-oriented
- deep-focus vs. rapid task switching
- planned vs. opportunistic
- perfectionist vs. ship-and-iterate

Explain important combinations rather than forcing me into one extreme.

## Tools & Environment

Software, AI systems, platforms, frameworks, research methods, devices, and working environments I actually use or discuss frequently.

## Focus Areas / Domains of Expertise

Separate this into:

### Genuine Expertise

Areas where there is strong evidence of substantial experience.

### Working Knowledge

Areas where I appear capable but am still actively learning.

### Active Exploration

Areas I am currently investigating but should not yet be described as an expert in.

Do not confuse curiosity with expertise.

---

# Evidence, Beliefs, and Triggers

## Information I Trust

What forms of evidence appear most persuasive to me?

Possible categories include:

- quantitative data
- first-principles reasoning
- personal experience
- expert opinion
- peer validation
- demonstrations
- market evidence
- customer feedback
- rapid experiments
- technical documentation
- institutional credibility

Rank these where the evidence permits.

## Decision Triggers

What usually causes me to finally make a choice or act?

## Red Flags

What makes me skeptical, disengaged, annoyed, or likely to abandon something?

---

# Communication & Interaction Style

## Tone & Voice

Describe how I naturally communicate.

Consider:

- directness
- informality
- enthusiasm
- skepticism
- warmth
- brevity
- storytelling
- persuasion
- technical density
- urgency
- curiosity

## Communication Methods

Describe how I tend to:

- ask questions
- provide context
- request feedback
- iterate on writing
- explain ideas
- communicate with senior people
- communicate with peers
- communicate with people I am trying to persuade

## Conflict Resolution

Based on available evidence, how do I seem to handle:

- disagreement
- pushback
- ambiguity
- criticism
- competing opinions

Leave this blank if evidence is weak.

---

# Goals & Outcomes

Write **one goal per line**.

Include only goals with meaningful evidence.

## Immediate Goals

## Medium-Term Goals

## Long-Term Goals

Describe actual outcomes rather than vague aspirations.

---

# Meta Attributes

## Identity Markers

Projects, phrases, technologies, objects, stories, concepts, or recurring references that are unusually associated with me.

## Archetypal Energy

Choose one or two where supported:

- Builder
- Explorer
- Connector
- Disruptor
- Operator
- Advocate
- Mentor
- Achiever
- Inventor
- Organizer

Explain why.

## Narrative Arc

Describe the recurring pattern of how I move from discovering a problem to pursuing a project.

## Signature Quote

Write **one original sentence** that captures my demonstrated philosophy.

It does not need to be something I literally said, but it must accurately reflect my behavior.

---

# Agent Behaviors

This section is especially important.

Imagine an AI was trying to **behave like me**, rather than merely know facts about me.

Describe the behavioral patterns it would need to reproduce.

Focus on observable tendencies such as:

- what it notices
- what it questions
- what it gets excited about
- what it challenges
- how it investigates ideas
- how quickly it moves
- when it asks for evidence
- when it simplifies
- when it changes direction
- how it communicates uncertainty
- how it moves from idea to action
- how it interacts with other people

Do not reduce this to personality adjectives.

---

# Daily Workflow

Only complete this section where sufficient evidence exists.

## Morning

What I tend to check, prioritize, or think about first.

## Core Work Time

Typical activities, context switching, research, communication, building, meetings, experimentation, and focus patterns.

## End of Day

How I wrap up, hand things off, plan, reflect, or prepare for tomorrow.

Do not invent a daily routine if you do not actually know it.

---

# Decision Making

## Research Style

How I investigate something before acting.

## Sources Consulted

Where I tend to seek answers.

## Time to Decision

Describe separately where evidence exists:

### Simple Decision

### Complex Strategic Decision

### Purchase Decision

### New Project or Opportunity

Use qualitative descriptions unless there is real evidence for numerical timing.

## Evaluation Criteria

Rank the criteria I appear to care about most.

Possible criteria include:

1. usefulness
2. speed
3. ease
4. cost
5. flexibility
6. integration
7. strategic leverage
8. reputation
9. support
10. security
11. novelty
12. scalability
13. reversibility
14. user experience
15. time to value

Use my actual behavior to determine the ranking.

---

# Technology Adoption

## Learning Style

How I actually learn new technology.

Possible methods include:

- building something immediately
- asking AI
- reading documentation
- watching tutorials
- talking to practitioners
- trial and error
- reverse engineering examples
- studying competitors
- reading research papers

Rank the dominant methods where possible.

## Onboarding Tolerance

How much setup, complexity, and friction I appear willing to tolerate.

Include time-to-value expectations only when supported.

## Adoption Curve

Place me where evidence suggests:

- Innovator
- Early Adopter
- Early Majority
- Late Majority
- Laggard

Explain why.

## Feature Behavior

Separate:

### Likely to Use Immediately

### Occasionally Explored

### Likely to Ignore

Infer only from demonstrated product or tool behavior.

---

# Problem Solving

## First Response When Something Breaks

What do I usually do first?

## Persistence

How many approaches do I tend to try before:

- changing direction
- asking for help
- escalating
- abandoning the problem

## Error Tolerance

Distinguish between:

### Minor Inconvenience

### Repeated Friction

### Major Failure

### Trust, Security, or Data Failure

## Recovery Expectations

How quickly do I expect something to become usable again?

What kinds of failure appear unacceptable?

---

# Communication Behavior

## Internal Communication

How I communicate with:

- collaborators
- teams
- mentors
- people working alongside me

Include how often and how much information I seem to share where known.

## External Communication

How I communicate with:

- prospective partners
- customers
- users
- senior executives
- institutions
- strangers

## Preferred Channels

Only where known.

## Expected Response Time

Only where evidence exists.

## Formality Level

## Feedback Style

Describe whether I tend to be:

- blunt
- diplomatic
- iterative
- conflict-avoidant
- data-driven
- enthusiastic
- highly specific
- informal
- demanding

Use only supported traits.

---

# Stress Response

Only include patterns you can reasonably observe.

## Under Pressure

How my behavior appears to change when:

- deadlines approach
- resources become scarce
- many opportunities appear simultaneously
- something fails
- priorities conflict

## Coping

What do I tend to do?

Possible behaviors include:

- simplify
- work longer
- ask for help
- rapidly research
- delegate
- cut scope
- switch strategies
- postpone lower-priority work
- increase communication

## Crisis Mode

What gets protected?

What gets dropped?

What happens to my communication style?

---

# Purchasing Behavior

Only use evidence where available.

## Research

How I investigate products or services.

## Influencers

Whose opinions seem capable of changing my mind?

## Approval

Do I tend to decide independently or seek consensus?

Do not invent spending thresholds.

## Risk Mitigation

What helps me become comfortable with a purchase or commitment?

Possible mechanisms include:

- pilot
- free trial
- references
- demonstration
- proof of concept
- ability to reverse the decision
- low upfront commitment
- peer recommendation
- strong documentation

---

# Change Management

## Initial Reaction to Change

Am I generally:

- enthusiastic
- curious
- cautious
- skeptical
- resistant

## Adaptation Speed

How quickly do I move from:

**Discovery → Experimentation → Actual Use**

## Role in Change

Which role best fits my demonstrated behavior?

- Champion
- Inventor
- Early Adopter
- Translator
- Organizer
- Operator
- Follower

Who or what seems capable of influencing me?

---

# Scenario Behaviors

These should be **behavioral predictions**, not stated as established facts.

Base them on patterns already demonstrated in my history.

## A New Tool Is Introduced

Describe what I would most likely do first.

Then provide:

### First Three Questions I Would Probably Ask

1.
2.
3.

## My Current Tool Fails

Predict:

### Immediate Reaction

### Troubleshooting Behavior

### Contingency Plan

### Abandonment Point

## Budget Is Cut by 30%

Predict:

### What I Protect

### What I Remove

### What I Try to Automate

### Where I Accept Lower Quality

### Where I Refuse to Compromise

---

# Behavioral Indicators

## Success Signals

How can someone tell I am satisfied?

Include:

- what I might say
- what I would do
- what behaviors would change
- what metrics I would likely notice

## Advocacy Triggers

What would make me enthusiastically recommend:

- a tool
- a company
- a person
- an idea

Who would I likely recommend it to?

## Warning Signs

What early behaviors suggest dissatisfaction?

## Escalation Points

What turns mild frustration into serious concern?

## Abandonment Triggers

What makes me stop:

- using
- supporting
- buying
- participating
- recommending

---

# Behavioral Summary

## Three Words

Choose exactly three words that describe me.

Avoid generic flattering adjectives.

## Primary Archetype

Choose one:

- Optimizer
- Collaborator
- Innovator
- Stabilizer
- Achiever

You may also include one secondary archetype.

## Key Behavioral Insight

Write one sentence describing the most important pattern someone should understand about how I operate.

---

# Notes

Include important patterns that do not fit cleanly elsewhere.

Pay particular attention to:

- contradictions
- unusual combinations of traits
- gaps between what I say and what I do
- recurring obsessions
- recurring blind spots
- environments where I perform best
- environments likely to frustrate me
- behaviors that would be important for an AI representation of me to reproduce

Be candid rather than flattering.

---

# What I Still Don't Know

List the **10 highest-value unanswered questions** that would most improve the accuracy of this persona.

Do not ask questions whose answers you already know.

Each question should target a meaningful gap that would materially improve the AI's ability to understand or represent me.

---

# Final Quality Check

Before generating the final Markdown document, silently evaluate every substantive claim against these questions:

1. What evidence do I actually have for this?
2. Was it directly stated or behaviorally inferred?
3. Have I seen this more than once?
4. Am I describing this person specifically, or writing generic persona filler?
5. Is this current, or could the information be outdated?
6. Am I confusing curiosity with expertise?
7. Am I confusing aspiration with actual behavior?
8. Would leaving this blank be more accurate?
9. Would the person themselves recognize this pattern?
10. Would this information actually help an AI behave more like them?

Delete or qualify claims that fail this test.

# Final Output Instructions

Return a single Markdown document.

Use the headings in this template.

Populate each section with the best-supported information you have.

Where a section has no reliable evidence, leave the content beneath the heading blank rather than inventing an answer.

Do not return multiple persona versions.

Do not explain your methodology outside the document.

Do not include a preamble.

Do not include a conclusion after the document.

Do not surround the Markdown document with triple backticks.

The **first characters of your response should be:**

`# Persona`

The finished response should function as a standalone `persona.md` file.
