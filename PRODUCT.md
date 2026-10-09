# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + Supabase (Postgres, Auth with GitHub provider, Storage) deployed on Vercel. Chosen by the user from a recommendation.

## Users

- **Hackathon participants** (DEÜ CS&AI community events): students, often on a laptop under time pressure near the end of a hackathon. Their job: connect GitHub once, pick a public repo, fill four fields, and know with certainty their project is registered.
- **Team members** joining an existing project via an invite link.
- **Organizers / jury (admins)**: identified by GitHub username. Their job: set the deadline, lock submissions, and download the frozen code archives.
- **Public visitors**: browse the gallery of submitted projects after (and before) the lock.

## Product Purpose

A submission lock for hackathons. Registration starts the first archive job. After each new push, teams explicitly update their submission version. Only a ZIP stored and verified by our server before the database deadline is accepted. At lock, the last accepted version is sealed; late pushes and delayed GitHub Events cannot change it. Failed updates preserve the previous accepted version. Registration and accepted code delivery are distinct states.

Success: zero disputes about "what was submitted when"; registration takes under a minute.

## Positioning

The frozen copy lives on our side (SHA + archive), not just a link to a repo that can still change. The deadline is enforced by the server, not by trust.

## Operating Context

- Live event, countdown visible; last-minute submissions are the peak load.
- Required project record fields: Proje adı, Ekip adı, kısa özet, logo. Optional HTTPS demo link in a collapsed section.
- Teams: one creator, others join via invite link and can edit details until lock.
- Language: Turkish.

## Capabilities and Constraints

- Public repositories only (hackathon rule). Private repos are rejected. No GitHub App; GitHub OAuth via Supabase Auth.
- Admin panel: deadline, lock, queue and cron health, bulk jury ZIP/CSV, archive retry, awards with reasons.
- After lock: participant edits rejected by DB triggers and API checks; accepted and sealed code is immutable. Workers may finalize existing accepted versions, never accept new code.
- Public searchable gallery shows project details, optional demo and jury awards. Code archives are available only to admins and the project's team.
- Preparation checklist, delivery timeline, ownership transfer, explicit destructive confirmation, server-based countdown, in-app/Telegram reminders and a stage QR.

## Brand Commitments

- Community: DEÜ CS&AI. Tagline from mascot sheet: "Düşün, Bağlan, Üret."
- Mascot: a cute brain character with neural lines and square terminals on its right side, black outlines, pink blush, small black legs. Expressions: normal, mutlu, meraklı, odaklı (sunglasses), uykulu, heyecanlı; themed variants (kodlama, hackathon headband + laptop, etc.). Must be redrawn as SVG faithful to the sheet (source: `WhatsApp Image 2026-10-03 at 22.12.44.jpeg`).
- Mascot palette (binding): near-black, indigo/violet range, pink blush, off-white.
- User-pinned aesthetic: strict minimalism, nothing unnecessary on screen.

## Evidence on Hand

- Mascot sheet (raster). No real project data yet; any demo entries must be labeled as examples.

## Product Principles

1. Certainty over features: the user must always know whether they are registered and whether the system is locked.
2. Four required registration fields; explicit version acceptance makes code delivery certain.
3. The lock is absolute and server-enforced.
4. The mascot carries the warmth; the interface stays quiet.
