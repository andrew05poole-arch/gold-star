# StepLeague — Product Requirements Document

**Status:** Draft v1
**Date:** 2026-06-23
**Owner:** Andrew Poole

---

## 1. Vision

> **"Make movement the most played game in the world."**

This is the north star for every decision. Every proposed feature should be tested against one question:

> Does this make movement more **fun**, **social**, or **habitual**?

If the answer is no, it doesn't belong in StepLeague — regardless of how technically interesting it is.

---

## 2. Problem & Opportunity

Fitness and step-tracking apps (Apple Health, Google Fit, Fitbit) are accurate but **boring** — they log activity without making it compelling to repeat. Meanwhile, games are compelling but **sedentary**. The market gap is an app that takes the core loop of a game (score, compete, level up, return tomorrow) and applies it to the one activity everyone already does: walking.

Adjacent products validate pieces of this:
- Strava proves people will compete over real-world movement.
- Duolingo proves streaks + light competition drive daily return visits for a low-effort habit.
- Pokémon GO proves movement + game mechanics can become genuinely viral.

StepLeague's differentiator is combining all three: **scoring fairness, social competition, and AI-driven rivalry**, instead of just being "Strava for walking."

---

## 3. Target Users

| Persona | Description | Primary motivation |
|---|---|---|
| **The Habit Builder** | Wants to walk more consistently but loses motivation after a few days. | Streaks, daily small wins, low-pressure progress. |
| **The Competitive Walker** | Already active, enjoys leaderboards and beating friends or a rival. | Weekly leaderboards, AI rivals, bragging rights. |
| **The Social Sharer** | Motivated by visibility and validation from friends. | Feed, reactions, invites, group challenges. |

The MVP (see Section 8) is built primarily for **the Habit Builder**, via the **DailyStep** World.

---

## 4. Core Concept & Loop

**StepLeague = a real-world movement game.**

### Core Loop
1. **Move** (walk / steps)
2. **Get scored** (steps + presence + segments)
3. **Compare** (leaderboards / AI rivals)
4. **Improve** (streaks / challenges)
5. **Repeat daily**

This loop must complete in under a minute of in-app time per day — the app should feel like checking a game's daily login reward, not logging a workout.

---

## 5. Product Structure

### 5.1 Platform

**StepLeague** is the umbrella app. A single account, a single step-data pipeline, multiple front-end experiences ("Worlds") built on top of it.

### 5.2 Worlds (Metaverse Concept)

Each World applies a different gamification lens to the same underlying movement data. Users can move between Worlds, which keeps long-term engagement fresh without requiring new step-tracking infrastructure per World.

| World | Gamification style | MVP status |
|---|---|---|
| **DailyStep** | Streaks & habits | ✅ **MVP flagship** |
| Walkaholic | Social + viral | Post-MVP |
| FootRace | Competitive + speed | Post-MVP |
| Stride | Exploration | Post-MVP |
| Presence | Mindful / phone-free | Post-MVP (Phase 2) |
| StepQuest | Adventure / missions | Post-MVP |
| MoveMentor | AI coaching | Post-MVP |

**DailyStep is the MVP flagship World.** It is the simplest expression of the core loop (steps → streak → leaderboard) and most directly serves the Habit Builder persona. All MVP design and engineering work (Section 8, 9) is scoped to DailyStep only; the multi-World "metaverse" framing is a Phase 2+ expansion, not a launch requirement.

---

## 6. Core Game Mechanics

Each mechanic is tagged for its build phase.

### 🔢 Scoring
- Raw steps — **MVP**
- Normalized steps (fairness across age/device/stride length) — **MVP**
- Segment scores (time-based, e.g. morning/afternoon/evening splits) — Phase 2
- Presence score (phone-free bonus) — Phase 2

### 🏆 Competition
- Friends leaderboard — **MVP**
- Weekly leaderboard (resets weekly = re-engagement hook) — **MVP**
- AI rivals (key differentiator: a simulated opponent calibrated to the user's pace) — **MVP (basic version)**

### 🔥 Engagement
- Streaks — **MVP**
- Challenges (solo + group) — **MVP (simple version)**
- Badges / titles — Phase 2

### 📍 Advanced
- Geo leaderboards (city → global) — Future
- Exploration bonuses — Future (belongs primarily to the Stride World)

---

## 7. System Architecture

Carried over from the original concept, annotated with MVP scope.

### Data Layer
- Step tracking via platform Health APIs (Apple HealthKit / Google Fit) — **MVP**
- GPS (optional, for future Stride/geo features) — Future
- Phone usage tracking (for Presence scoring) — Phase 2

### Core Engine
- Step Normalizer (fairness across users/devices) — **MVP**
- Segment Scorer — Phase 2
- Presence Scorer — Phase 2

### Game Engine
- Streak Tracker — **MVP**
- Leaderboard Manager — **MVP**
- Challenge Engine — **MVP (basic)**

### AI Layer
- Rival Generator (creates a believable, fair AI opponent from the user's own pace history) — **MVP (basic)**
- Habit Coach (proactive nudges, encouragement) — Future

### Social Layer
- Feed — Future
- Reactions — Future
- Invites — **MVP (minimal, needed to form a friends leaderboard)**

---

## 8. MVP Scope

The MVP is **DailyStep only** — no other World is user-facing at launch.

### MUST HAVE
- Step tracking (via Health API)
- Friends leaderboard (weekly, resets)
- Basic streaks
- Simple challenges
- AI rival (basic)
- Minimal invite flow (to populate a friends leaderboard)

### DO NOT BUILD YET
- Other Worlds (Walkaholic, FootRace, Stride, StepQuest, MoveMentor) — the "metaverse" framing is post-MVP
- Presence scoring (Phase 2)
- Geo leaderboards
- Advanced AI (Habit Coach, adaptive coaching)
- Social feed / reactions
- Celebrities feature (see Section 10 — explicitly deferred)

---

## 9. Key User Flows (Text Wireframes)

These are functional descriptions of the screens needed for the DailyStep MVP. Visual direction and tokens are in `design/DESIGN.md`; an interactive, theme-accurate mockup of all five screens lives in `prototype/index.html`, and the React Native implementation is in `app-mobile/app/`. Data shapes referenced below are defined in Section 13.

### 9.1 Onboarding & Permissions
- **Purpose:** Get the user moving and scored within the first session.
- **Elements:** Welcome/vision framing → Health API permission request → optional friend invite (skippable) → land directly on Home/Dashboard.
- **Primary action:** Grant step-tracking permission.

### 9.2 Home / Daily Dashboard (DailyStep)
- **Purpose:** The daily "login screen" — answers "how am I doing today, and is my streak safe?"
- **Elements:** Today's step count (large, primary), streak counter with flame/visual indicator, today's progress toward a daily goal, a glanceable comparison to the AI rival's pace.
- **Primary action:** Open leaderboard or rival comparison; implicit action is simply walking.

### 9.3 Friends Leaderboard
- **Purpose:** Weekly ranked list of friends by normalized step score.
- **Elements:** Ranked list with avatars, step totals, rank movement (up/down arrows), countdown to weekly reset, invite-friends CTA at the bottom.
- **Primary action:** Invite a friend / tap a friend to see their profile.

### 9.4 AI Rival Comparison
- **Purpose:** Head-to-head pace comparison against a calibrated AI opponent.
- **Elements:** Side-by-side step/pace bars (you vs. rival), today's gap, a short status line ("You're 412 steps ahead").
- **Primary action:** Close the gap by walking more today.

### 9.5 Streak & Challenge Screen
- **Purpose:** Shows streak history and active/available challenges.
- **Elements:** Streak calendar/history strip, current active challenge with progress bar, list of joinable simple challenges (e.g., "10k steps for 3 days").
- **Primary action:** Join a challenge.

---

## 10. Future Features Backlog

Explicitly out of MVP scope, ordered roughly by likely sequencing:

1. **Additional Worlds** — Walkaholic, FootRace, Stride, StepQuest, MoveMentor (full "metaverse" rollout)
2. **Presence scoring** — phone-free bonus mechanic
3. **Geo leaderboards** — city → national → global ranking tiers
4. **Advanced AI** — adaptive Habit Coach, smarter rival calibration
5. **Social feed & reactions** — activity feed, likes/comments, richer invite flows
6. **Celebrities feature** *(added during concept discussion)*:
   - Follow and compare yourself against celebrity profiles (real, partnered, or simulated)
   - Acts as an **aspirational motivation layer**, distinct from the friends leaderboard
   - Progression framing: compete with people you know → then people you admire
   - Open questions: licensing/partnership requirements for real celebrities vs. simulated "celebrity-style" rival profiles; whether this lives inside DailyStep or becomes its own World

---

## 11. Success Metrics

- **DAU/WAU ratio** — target stickiness comparable to habit apps (Duolingo-class: >40%)
- **D1 / D7 / D30 retention** — primary signal that the core loop is working
- **Streak length distribution** — % of users reaching 3-day, 7-day, 30-day streaks
- **Leaderboard participation rate** — % of WAU who view the friends leaderboard at least 3x/week
- **AI rival engagement** — % of sessions where the user views the rival comparison

---

## 12. Risks & Open Questions

- **Step-data spoofing / anti-cheat** — leaderboards and challenges create incentive to fake step counts; needs a fraud-detection approach before competitive features scale.
- **Health-data privacy & permissions** — Health API access is sensitive; onboarding must clearly explain data use and comply with platform health-data policies.
- **Normalization fairness** — raw step counts disadvantage shorter strides, older users, or different device accuracy; the Step Normalizer algorithm needs real validation, not just a stated intent.
- **AI rival believability** — a rival that's too easy feels pointless; too hard feels discouraging. Calibration logic is a core risk to get right even in the "basic" MVP version.
- **Celebrity feature feasibility** — real-celebrity partnerships involve licensing and ongoing content overhead; simulated celebrity-style profiles avoid that but may feel less compelling. Needs a decision before this leaves the backlog.

---

## 13. Technical Design Detail (MVP)

This section grounds the MVP in concrete data shapes and algorithms. The TypeScript types in `app-mobile/lib/types.ts` mirror the entities here so the doc and the scaffold stay in agreement.

### 13.1 Data Model Sketch

Core entities for the DailyStep MVP. Fields are indicative, not a final schema.

| Entity | Key fields | Notes |
|---|---|---|
| **User** | `id`, `displayName`, `avatarColor`/`avatarUrl`, `dailyGoal`, `heightCm?`, `strideLengthCm?`, `createdAt` | `height`/`stride` feed normalization (optional; estimated if absent) |
| **StepRecord** | `id`, `userId`, `date` (local day), `rawSteps`, `normalizedSteps`, `source` (`healthkit`/`googlefit`/`mock`) | One row per user per local day; `normalizedSteps` computed (§13.2) |
| **Streak** | `userId`, `currentLength`, `longestLength`, `lastQualifiedDate`, `freezesRemaining` | A day "qualifies" when `rawSteps >= dailyGoal` (or a streak-floor) |
| **Friendship/Follow** | `userId`, `friendId`, `status` (`pending`/`accepted`), `createdAt` | Symmetric for friends; directional model leaves room for the future follow/celebrity feature |
| **Challenge** | `id`, `title`, `type` (`solo`/`group`), `goalType` (`stepsPerDay`/`totalSteps`/`daysStreak`), `goalValue`, `durationDays`, `participantIds`, `progressByUser` | MVP ships simple presets (e.g. "10k steps for 3 days") |
| **LeaderboardEntry** | `userId`, `weekId`, `normalizedScore`, `rank`, `previousRank` | `previousRank` drives the up/down/flat rank-change arrow |
| **RivalProfile** | `userId` (owner), `name`, `pacePerDay`, `difficultyBand`, `todayProgress` | A per-user generated opponent, not a real account (§13.3) |

### 13.2 Step Normalizer (MVP)

**Why:** raw step counts unfairly reward longer strides and penalize shorter/older users, and device sensors differ. Leaderboards and the rival should compare *effort*, not stride length.

**MVP approach — distance-equivalent normalization:**

```
strideLengthCm = user.strideLengthCm
              ?? (user.heightCm ? user.heightCm * 0.415 : DEFAULT_STRIDE_CM)
normalizedSteps = rawSteps * (strideLengthCm / REFERENCE_STRIDE_CM)
```

- `REFERENCE_STRIDE_CM` is a fixed baseline (e.g. 71 cm) so everyone is expressed in "reference steps."
- `0.415` is a standard height→stride estimate when stride isn't measured.
- **Phase 2:** add a per-source calibration factor (device accuracy) and outlier capping. The formula above is a documented placeholder to be validated against real data — see Risks §12.

Leaderboard ranking and the rival comparison both use `normalizedSteps`; the big number shown to the user on Home is `rawSteps` (more motivating / intuitive).

### 13.3 AI Rival (basic) Logic

The MVP rival is a **per-user simulated opponent derived from the user's own recent pace** — not a shared bot and not a real account. Goal: a believable, fair, beatable-but-not-trivial daily target.

```
trailingAvg = mean(normalizedSteps over last 7 days, ignoring zero/no-data days)
band = { chill: 0.95, even: 1.05, pushy: 1.15 }[user.difficultyBand]
rivalDailyTarget = clamp(round(trailingAvg * band), MIN_TARGET, MAX_TARGET)
```

- The rival "walks" through the day on a smooth schedule (e.g. proportional to a typical hourly activity curve) so the head-to-head bar updates live rather than jumping at midnight.
- **Calibration guardrails:** `MIN_TARGET` prevents a demoralizingly-low rival for inactive users; `MAX_TARGET` (and the `band` cap) prevents an impossible rival. New users with <3 days of data get a gentle default target.
- **Phase 2 (Advanced AI):** adapt the band to recent win/loss streaks (ease off after repeated losses, push after easy wins) and add personality/voice lines.

### 13.4 Weekly Leaderboard Reset

- Leaderboards aggregate `normalizedSteps` over a **week window**, then reset — the reset is itself an engagement hook (fresh start, new rank race).
- **Open decision (timezone):** week boundary needs a defined anchor. Options: per-user local Monday 00:00 (most intuitive per user, harder to rank a shared board consistently) vs. a single global anchor (e.g. UTC or a fixed region) for one canonical board. **Recommendation:** single global anchor for the shared friends board, displayed to each user as a localized countdown (`CountdownPill`). Revisit if it confuses users in distant timezones.
- `weekId` on `LeaderboardEntry` keys each week's standings and lets `previousRank` carry across resets for the rank-change arrow.

### 13.5 Streak Edge Cases (Open Questions)

- **Day boundary:** a streak day is the user's **local** calendar day. Crossing midnight while walking should not double-count or break a streak mid-walk.
- **Qualifying threshold:** does a day require hitting `dailyGoal`, or a lower "streak floor" (e.g. 60% of goal) so an off day doesn't instantly reset weeks of progress? **Proposed:** a streak floor below the daily goal, tunable.
- **Streak freeze / grace:** Duolingo-style — should users get a small number of "freezes" (`freezesRemaining`) that auto-save a missed day? **Proposed:** yes, 1–2 freezes, earned back slowly; reduces rage-quit on a single missed day. Flagged for product decision.
- **Backfill / late sync:** if Health data syncs late (e.g. a phone was offline), a previously-missed day may retroactively qualify. MVP should recompute the streak when historical step data arrives rather than treating the streak as immutable.

### 13.6 Implementation Status

The data model above is implemented as a real Supabase (Postgres) backend —
see `../supabase/README.md` and `../supabase/migrations/0001_init.sql` for
the schema, triggers, RLS policies, and `get_leaderboard` / `get_rival_target`
RPCs, and `app-mobile/lib/api/` for the client-side wrappers. The streak
floor (§13.5) ships at 60% of `dailyGoal`, with 2 starting freezes. The step
*sensor* layer (HealthKit/Google Fit, §7 Data Layer) is still mocked —
`app-mobile/lib/useStepData.ts` — but writes through to `step_records`, so
the rest of the backend operates on genuinely persisted data ahead of real
Health integration.
