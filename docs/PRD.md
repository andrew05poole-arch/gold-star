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

No interactive mockups exist yet (see `design/DESIGN.md` for mood-board-level visual direction); these are functional descriptions of the screens needed for the DailyStep MVP.

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
