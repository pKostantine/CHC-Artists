# CHC Artists

**CHC Artists** is the artist and creator portal for the **Coptic Hymns Centre (CHC)** platform.

It is designed for cantors, choirs, hymn groups, musicians, and other approved creators who publish audio through CHC. The app gives artists a dedicated place to manage their presence on the platform, submit releases, monitor their content, and eventually manage analytics and monetization.

The concept is similar to platforms such as **Spotify for Artists** and **Apple Music for Artists**, but built specifically for the CHC ecosystem and the needs of Coptic Orthodox audio content.

---

## About the App

CHC Artists is separate from the main CHC listener experience.

The main **CHC app** is where users discover and listen to hymns, songs, liturgical recordings, albums, playlists, synchronized lyrics, and learning content.

**CHC Artists** is the creator-management side of that ecosystem. It currently gives approved creators a place to:

- manage an artist workspace and profile
- create music releases, learning albums, and lesson sets
- upload artwork and multiple audio files
- reorder tracks before submission
- enter localized release and track titles
- assign per-track credits and contributor roles
- choose ASAP or scheduled release timing
- monitor automatic media processing
- submit work for CHC review
- manage released music separately from active submissions
- edit published release metadata, artwork, tracks, credits, and timing
- permanently remove releases or tracks when permitted
- create and publish synchronized multilingual lyrics
- use the creator portal across desktop, mobile, tablet, and installed web-app layouts

The goal is to provide a professional creator workflow while keeping all published content integrated with the wider CHC platform.

---

## Who It Is For

CHC Artists is intended for creators who contribute audio to Coptic Hymns Centre, including:

- Cantors
- Choirs
- Coptic hymn groups
- Liturgical recording groups
- Christian singers
- Musicians
- Churches and ministries
- Other approved audio publishers

Not every CHC user needs a CHC Artists account. The app is specifically for people or organizations that publish and manage content.

---

## Core Features

### Artist Accounts and Workspaces

Authentication is powered by Supabase and supports email/password plus Google sign-in.

A creator can work inside the artist workspace or workspaces connected to their account. Workspace switching is available when an account manages more than one creator identity.

### Artist Profiles

Each artist has an editable CHC profile that can include:

- artist name
- profile image
- biography
- artist type
- social and external links
- published releases
- pinned or featured profile content

Profile changes are designed to flow through to the artist page shown in the main CHC app.

### Release and Learning Submissions

Creators can prepare:

- **Music releases**
- **Learning albums**
- **Lesson sets**

Music submissions support multiple audio files, real drag-and-drop on web, real track reordering, artwork uploads, localized release titles, localized per-track titles, recording/music classifications, and detailed credits.

CHC automatically determines whether a music release is a Single, EP, or Album from its track count.

Large masters use multipart upload support, and media processing begins automatically after files are uploaded rather than waiting for admin approval. Long uploads obtain a fresh Supabase token for each chunk and retry an individual request if its JWT expires; a token refresh does not restart an entire video.

**Every lesson video is automatically standardized after upload.** The CHC media processor converts it to a fast-start H.264 MP4 (quality-based CRF 20, maximum 1080p without upscaling, 192 kbps AAC audio). It also generates a separate audio-only M4A for video lessons. There is no user-facing compression toggle; the published file is the standardized delivery version.

**Upload-speed limitation:** This FFmpeg normalization currently runs after the original reaches R2. It reduces delivery size and improves playback compatibility but cannot shorten the transfer of the original file. Reliable pre-upload hardware encoding across iOS Files, Android, and Safari web requires platform-specific work; it is not implemented here, and a two-minute upload cannot be guaranteed independently of file size and upstream speed.

### Release Timing

Music releases support two timing modes:

- **Release as soon as possible** — the approved release can go live immediately.
- **Scheduled release** — the creator chooses a date and time at least 48 hours in the future, and the approved release is published automatically when that time arrives.

The native apps use platform date/time pickers, while web uses the corresponding web controls.

### Submission Review

Submissions move through the CHC review workflow after their required media is ready.

Creators can see upload and processing state, review status, requested changes, and relevant processing failures. Normal media processing happens before review; admin processing controls are intended mainly for exceptions and recovery.

### Released Content Management

Published music is separated from in-progress submissions in the **Releases** section.

Creators can manage supported release details including:

- release metadata
- artwork replacement
- track metadata
- localized track titles
- named credits and roles
- release timing
- track deletion
- release deletion

Artwork replacement is versioned so the newest approved artwork becomes the current image across CHC.

### Lyrics Studio

Lyrics Studio uses one shared synchronized timeline for:

1. English
2. French
3. Coptic
4. Arabic

Each row shares the same timestamp while allowing any language cell to be blank. This supports mixed-language tracks without forcing every line to exist in every language.

The studio supports:

- audio playback while timing
- timestamp editing
- row reordering
- multilingual text on a shared timeline
- LRC import/export
- draft saving
- draft restoration with all languages, timestamps, directions, and optional text preserved
- publishing one or more lyric languages

Coptic lyric fields use the CHC Coptic font while Arabic retains right-to-left handling.

### Responsive Creator UI

Desktop uses a sidebar layout. Phones, tablets, and touch-first installed web apps use a bottom navigation bar with safe-area handling for Safari/PWA layouts.

### Notifications

CHC Artists includes the shared CHC notification registration infrastructure so creator-facing notifications can be delivered through the same notification platform as the main CHC app.

---

## App Sections and URLs

CHC Artists uses Expo Router and currently has four top-level creator sections:

| URL | What it is |
| --- | --- |
| / | **Submissions** dashboard: drafts, review state, and requested changes |
| /submission/new | Create a new music release, learning album, or lesson set |
| /submission/<id> | Submission detail, files, processing state, and review feedback |
| /releases | Released and release-ready music managed separately from submissions |
| /release/<id> | Edit one released music item |
| /lyrics | Lyrics Studio for synchronized multilingual lyrics |
| /profile | Artist profile image, biography, links, and profile settings |

Top-level navigation uses client-side routing so installed web apps remain inside the same PWA instead of appearing to open external pages. On native platforms the same routes are available through the chcartists:// scheme.

---

## Development

```sh
npm install
npm run web        # Expo dev server
npm run typecheck
npm run deploy     # expo export -p web, then wrangler deploy
```

The app talks to Supabase only through public RPCs; the `creator`, `media`, `music`, and `learning` schemas are not exposed through the Data API. The creator RPCs (`get_creator_workspaces`, `get_creator_dashboard`, `create_creator_artist`, `create_creator_submission`, and friends) live in the main CHC repository under `supabase/migrations/20260917160000_add_chc_artists_creator_rpcs.sql`.

### Google sign-in setup

"Continue with Google" uses Supabase OAuth with PKCE. It needs, once per Supabase project:

1. **Google Cloud Console** — create an OAuth client of type *Web application*. Add `https://wtuujmeinzqfikvuofmh.supabase.co/auth/v1/callback` as an authorized redirect URI.
2. **Supabase Dashboard → Authentication → Sign In / Providers → Google** — enable it and paste the client ID and secret.
3. **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** — allow every place the app runs:
   - `https://chc-artists.hrmpdd8d6c.workers.dev/**` (and any custom domain)
   - `http://localhost:8081/**` for local web development
   - `chcartists://**` for the iOS and Android apps

Until the provider is enabled, the button explains that Google sign-in is not switched on instead of sending the creator to an error page.

## Relationship to CHC

CHC Artists is part of the larger **Coptic Hymns Centre** application ecosystem.

The apps should feel related without being identical.

The main CHC app is focused on **discovering, reading, listening, and worship resources**.

CHC Artists is focused on **publishing, managing, and understanding audio content**.

The visual language, navigation patterns, typography, spacing, and general design philosophy should make CHC Artists recognizable as part of the same family while still giving it the structure expected from a professional creator dashboard.

---

## Platform Architecture

CHC Artists is built around the same broader infrastructure used by the CHC ecosystem.

### Frontend

The application is built with **React Native / Expo**, allowing the project to support multiple platforms from a shared codebase.

The interface is designed to work across:

- iOS
- iPadOS
- Android
- Web

Platform-specific improvements can be introduced where necessary while keeping the core experience consistent.

### Supabase

**Supabase** provides backend services used by the application, including areas such as:

- Authentication
- User accounts
- Artist records
- Release metadata
- Submission data
- Database access
- Permissions and authorization

### Cloudflare

**Cloudflare** is used as part of the media and infrastructure layer for CHC.

Its role can include services related to:

- Audio delivery
- Media storage
- Upload infrastructure
- CDN delivery
- Streaming
- Processing
- Edge services

This keeps large media files separate from the application's primary relational database while allowing CHC to deliver content efficiently.

---

## Typical Artist Workflow

A typical music-release workflow is:

1. **Sign in to CHC Artists**
2. **Choose the creator workspace**
3. **Start a new music release**
4. **Enter localized release metadata and release timing**
5. **Add artwork and one or more audio files**
6. **Reorder tracks and enter each track's localized titles and credits**
7. **Wait for automatic upload processing to complete**
8. **Submit the release for CHC review**
9. **Respond to requested changes if necessary**
10. **After approval, publish immediately for ASAP releases or automatically at the scheduled date/time**
11. **Manage the released item from the Releases section**
12. **Add and publish synchronized lyrics from Lyrics Studio when needed**

Learning albums and lesson sets use the same creator foundation with learning-specific metadata and contributors.

---

## Design Goals

CHC Artists is being developed around several core principles.

### Simple

Publishing a track should not require understanding CHC's internal database structure.

The artist should only need to provide the information necessary for the release.

### Professional

The app should feel like a real artist platform rather than an administrative form.

Upload progress, release status, artwork, metadata, and analytics should all be presented clearly.

### Integrated

Artists should not have to manage separate disconnected systems for CHC.

Their account, profile, releases, media, analytics, and future monetization tools should all be accessible through the same application.

### Consistent With CHC

CHC Artists should visually belong to the CHC family while still having its own identity and workflow.

### Built for Growth

The platform should be able to grow from basic release submissions into a more complete artist platform with analytics, monetization, collaboration, rights management, and other creator tools.

---

## Current Implementation Highlights

The current creator platform includes:

- Supabase authentication and creator workspaces
- Google sign-in
- artist profile editing
- multi-file and multipart uploads
- drag-and-drop and manual track ordering
- automatic media processing after upload
- detailed per-track metadata and credits
- localized release and track titles
- ASAP and scheduled release timing
- review and requested-changes workflows
- separate submission and release management
- release editing and deletion controls
- artwork replacement and versioning
- multilingual synchronized Lyrics Studio
- complete lyric draft preservation
- responsive desktop/mobile/tablet/PWA navigation
- CHC Artists branding and installable web-app assets
- shared CHC notification infrastructure

The app remains under active development, but the core creator publishing workflow is implemented end to end.

---

## Future Possibilities

Potential future additions include:

- advanced artist analytics
- listener and audience insights
- revenue dashboards
- audio advertising
- artist monetization
- payout management
- team and manager access
- expanded collaboration workflows
- copyright and rights-management tools
- artist verification
- takedown/request workflows
- promotional tools
- featured-release campaign tools

These are longer-term platform directions rather than descriptions of the currently shipped creator workflow.

---

## CHC Ecosystem

CHC Artists is one part of the broader Coptic Hymns Centre project.

The long-term goal of CHC is to provide a unified digital platform for Coptic Orthodox resources while giving the people who create, preserve, record, and publish those resources the tools they need to manage their work properly.

**CHC Artists provides the creator side of that platform.**

---

## Status

CHC Artists is under active development, with the core creator workflow already implemented across web and Expo-based native targets.

The current app supports creator workspaces, profile management, multi-track submissions, automatic processing, review workflows, ASAP and scheduled releases, released-content editing, synchronized multilingual lyrics, responsive mobile/tablet navigation, and shared CHC notification infrastructure.

Additional analytics, monetization, rights-management, and creator-growth tools can be layered onto this foundation as the CHC audio platform expands.
