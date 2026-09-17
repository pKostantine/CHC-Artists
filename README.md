# CHC Artists

Creator and management companion application for the Coptic Hymns Centre ecosystem. This is the separate CHC Artists application and shares the existing CHC Supabase, Cloudflare/R2 media pipeline, and backend contracts.

## Phase 15 Creator Application

Implemented creator-facing workflows:

- Supabase authentication and persisted web sessions
- creator-account dashboard and account switching
- Music and Learn & Study submission status tracking
- requested-changes notes, processing, review, and publication states
- artist and cantor creation/management entry points
- Music release creation for Single / EP / Album
- Learning Album and Lesson Set creation
- cantor, season, and hymn selection
- English, Arabic, Coptic, and French metadata editing
- artwork and large media selection
- secure upload through the CHC upload-authorizer Worker into private `chc-submissions` R2 storage
- live upload progress
- track/lesson ordering controls
- submission preview and submission to the existing 48-hour moderation workflow
- existing synchronized Lyrics Studio retained as a first-class creator tool

The app never requires creators to manually edit Supabase records or handle R2 credentials.

## Environment

Copy `.env.example` to `.env.local` and provide:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_CHC_MEDIA_BASE_URL`
- `EXPO_PUBLIC_CHC_UPLOAD_URL` (defaults to the deployed CHC upload authorizer)

## Run

```bash
npm install
npm run web
```

Use an authenticated CHC account with creator or admin access.
