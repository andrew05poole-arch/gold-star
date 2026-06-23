# StepLeague — Design Concept

**Status:** Draft v1
**Scope:** Visual direction for the MVP flagship World, **DailyStep**.
**Companion doc:** `docs/PRD.md`

> ⚠️ **Image generation pending.** This doc was meant to include a Higgsfield-generated mood board and key-screen concept art. Every Higgsfield MCP tool call in this session (including read-only ones like `list_workspaces`) is currently failing with `MCP tool call requires approval`, which isn't resolving via retry. The written direction below is ready to generate from as soon as that's unblocked — see "Next Step" at the bottom.

---

## 1. Brand Personality

**Tone:** Energetic & playful — closer to Duolingo or Pokémon GO than to Strava or Apple Fitness.

- **Energetic** — motion, momentum, a sense of "go." Visuals should feel like they're mid-step, not static.
- **Playful** — rounded shapes, mascot/character energy, light celebratory moments (streak saves, challenge wins).
- **Encouraging, not punishing** — competitive elements (leaderboards, rivals) are framed as fun rivalry, never shame.
- **Slightly competitive** — an undercurrent of "can you beat your rival today?" without becoming hardcore/serious-athlete in feel.

**One-line mood statement:** *A daily game you play with your feet.*

---

## 2. Color & Type Direction

**Palette (energetic, high-contrast, game-like):**
- **Primary — Coral/Orange** (`#FF6B4A`-ish): CTAs, streak flame, primary actions. Warm, urgent-but-friendly.
- **Secondary — Teal** (`#1FB6A8`-ish): progress bars, secondary UI, "you" in rival comparisons.
- **Accent — Sunny Yellow** (`#FFD23F`-ish): celebration states, badges, streak milestones.
- **Neutral base — soft off-white / charcoal**: keeps the bright accents from feeling chaotic; avoid pure black/white for a softer, app-like feel.

**Type direction:** Rounded, friendly sans-serif (e.g., the general style family of Nunito / Poppins / SF Rounded) — large, bold numerals for step counts and streaks since those are the "scoreboard" of the app. Avoid anything condensed or technical-feeling.

---

## 3. Mood Board (planned)

Concept art to generate once Higgsfield access is restored, intended to capture overall brand vibe rather than literal UI:

1. **"Movement as game" hero image** — a person mid-stride rendered in a bright, slightly stylized/illustrated (not photoreal) style, motion lines, game-like energy, coral/teal/yellow palette.
2. **Mascot/character concept** — a friendly, abstract "rival" character concept (the AI Rival needs a face/personality eventually) — playful, simple geometric character design, not a literal animal/human likeness.
3. **Celebration moment** — visual representing a streak-saved or challenge-won moment: confetti-like burst, flame icon, badge — establishes the reward-state visual language.

## 4. Key Screen Concept Art (planned)

Each paired with the functional wireframe description from `docs/PRD.md` Section 9:

1. **DailyStep Home/Dashboard vibe** — large step counter, flame/streak indicator, bright background, single primary CTA. (Maps to PRD §9.2)
2. **Friends Leaderboard / AI Rival vibe** — ranked list energy with avatars and rank-change arrows, a head-to-head "you vs. rival" bar visual. (Maps to PRD §9.3–9.4)
3. **Streak-celebration vibe** — full-screen celebratory moment when a streak milestone or challenge is completed. (Maps to PRD §9.5)

---

## 5. Key Screens — Written Descriptions

(Duplicated/summarized from PRD §9 for design reference; PRD is the source of truth for functional requirements.)

| Screen | Visual priority | Key visual elements |
|---|---|---|
| Onboarding | Vision-first, low friction | Full-bleed hero illustration, single permission CTA |
| Home/Dashboard | Step count + streak dominate | Large numerals, flame icon, today's rival-pace sliver |
| Friends Leaderboard | Rank clarity | Avatar list, rank-change arrows, reset countdown |
| AI Rival Comparison | Head-to-head bars | "You" in teal vs. "Rival" in a contrasting tone, gap callout |
| Streak/Challenge | Progress + history | Streak calendar strip, challenge progress bar |

---

## 6. Next Step

1. Retry the Higgsfield connection (re-run `models_explore`/`generate_image`) — likely needs a fresh approval/auth step on the Higgsfield side rather than a code fix.
2. Generate the 6 concept images described in Sections 3–4 above and save them to `design/images/`, then embed them in this doc with captions.
3. Per the user's stated plan: once concept art exists, feed it into a UI design/prototyping tool to produce actual pixel-accurate mockups — that step is intentionally out of scope here.
