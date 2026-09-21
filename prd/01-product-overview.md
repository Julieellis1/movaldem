# 01 — Product Overview

**Depends on:** 00-README
**Audience:** Everyone (business context for all later documents)

## 1. Summary

MOVALDEM needs more than an informational church website. The platform is a **digital ministry hub** with three independent modules connected through shared authentication, database and administration:

```text
                     MOVALDEM
                        |
        +---------------+---------------+
        |               |               |
    TEACHING          GIVING       BIBLE QUIZ
        |               |               |
  Sermons           Tithe          Categories
  Bible Study       Offering       Timed quizzes
  Sunday School     General        Weekly / Monthly /
                    Projects       Annual leaderboards
```

Visitors and members can learn about the ministry, read/listen/watch/download teachings, see events and programmes, view galleries, give online through Paystack, and take Bible quizzes with competitive leaderboards. Administrators manage everything from a central admin dashboard.

## 2. Goals

| ID | Goal |
|----|------|
| G1 | Establish a professional digital presence for MOVALDEM. |
| G2 | Make church teachings easy to find and access online, in audio, video and document form. |
| G3 | Preserve sermons and teaching materials digitally. |
| G4 | Simplify secure online giving through Paystack. |
| G5 | Encourage consistent Bible study through quizzes and leaderboards. |
| G6 | Give administrators a single place to manage content, quizzes, events and giving. |
| G7 | Work well on phones, tablets and desktops, with mobile as the primary design target. |
| G8 | Keep the architecture modular so future ministry features can be added without a rebuild. |

## 3. Users

| User | Account | Description |
|------|---------|-------------|
| **Visitor** | No | Anyone browsing. Can read sermons, listen, watch, download enabled files, browse Bible studies, Sunday school, events, programmes, galleries and church information. Can give (guest giving) and view the quiz landing page and public leaderboards. Must register to take a quiz. |
| **Registered Member (Quiz User)** | Yes | Everything a visitor can do, plus: take quizzes, view quiz history, scores and personal rank, view weekly/monthly/annual leaderboards, choose quiz categories, update profile and leaderboard-display privacy. |
| **Content Manager** | Yes (staff) | Manages sermons, Bible studies, Sunday school, events and gallery. |
| **Quiz Manager** | Yes (staff) | Manages quizzes, questions, categories, leaderboards and quiz reports. |
| **Admin** | Yes (staff) | Manages content, quizzes, events, users and giving reports. |
| **Super Admin** | Yes (staff) | Unrestricted. Manages administrators, roles, Paystack configuration, system settings and logs. |

Full permission rules are in `03-roles-permissions-audit.md`.

## 4. Scope

### 4.1 In scope for V1

**Public website:** Home, About, Leadership, Sermons, Bible Study, Sunday School, Events, Programmes, Gallery, Giving, Bible Quiz, Contact, plus legal and utility pages.

**CMS:** sermons, Bible studies, Sunday school (with series), events, programmes (with sessions), gallery albums, media library, About/leadership content.

**Giving:** Paystack integration, tithe, offering, general giving, project fundraising, server-side verification, webhooks, receipts, admin transactions and reports.

**Quiz:** registration/login, categories, quiz creation, question bank, CSV import, timed attempts, scoring, results, weekly/monthly/annual leaderboards, quiz history.

**Administration:** dashboard, users, roles, reports, settings, contact inbox, audit logs.

**Cross-cutting:** global search, filtering, SEO, social sharing, email receipts and transactional emails, performance and accessibility work.

### 4.2 Out of scope for V1 (design so they are easy to add)

| Feature | Notes |
|---------|-------|
| Live streaming (YouTube/Facebook Live) | Embed component and an `events.live_url` field can be added later. |
| Prayer requests | Member submission and admin moderation. |
| Testimonies | Submission with approval workflow. |
| Membership registration | Extends the `users` entity. |
| Counselling appointments | Needs a scheduling module. |
| Daily devotional and Bible reading plans | New content type using the shared content pattern. |
| Push notifications | The notification service should be channel-based (see `08`). |
| Refund initiation from the platform | V1 records refund status only. |
| Question types other than multiple choice | Schema supports extension (see `07`). |
| Paid content or e-commerce | Not planned. |

## 5. Product Principles

1. **Modules are independent.** Content, giving and quiz share auth, database and admin, but do not depend on each other's internals.
2. **The server is the source of truth** for money, time and scores.
3. **Configurable over hard-coded.** Unspecified rules become settings.
4. **Mobile-first, low-bandwidth-aware.** Many users are on smartphones and slower connections.
5. **Content is durable.** Published teaching content and quiz history are never silently lost.
