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

## Deploy

The site is a static Expo web export served by the `chc-artists` Worker
(`wrangler.jsonc`), with the single-page fallback so any path serves the app
rather than 404ing.

```bash
npm run build     # expo export -p web  ->  dist/
npm run deploy    # builds, then wrangler deploy
```

Deploying from Cloudflare's Git integration instead: build command
`npm run build`, output directory `dist`.

### The four build-time variables are not optional

`EXPO_PUBLIC_*` values are compiled into the bundle by `npm run build`, not
read at runtime, so whatever machine builds the site must have them. They
must therefore be set as **build** environment variables in Cloudflare, not
only as runtime secrets:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_CHC_MEDIA_BASE_URL`
- `EXPO_PUBLIC_CHC_UPLOAD_URL`

A build that runs without the two Supabase variables still succeeds and still
deploys, but `src/services/supabase.ts` throws as the bundle loads and the
page renders blank with `Missing EXPO_PUBLIC_SUPABASE_URL or
EXPO_PUBLIC_SUPABASE_ANON_KEY` in the browser console. A blank page is worth
checking there first.
