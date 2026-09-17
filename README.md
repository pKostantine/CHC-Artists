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

```bash
cp .env.example .env.local
```

`.env.example` already points at the live CHC services; only
`EXPO_PUBLIC_SUPABASE_ANON_KEY` needs filling in, from Supabase under Project
Settings → API. `.env.local` is gitignored, so every fresh clone needs this
step before the app will start -- without it the bundle throws as it loads and
nothing renders.

## Run

Install dependencies once:

```bash
npm install
```

For Expo Go on iOS or Android:

```bash
npx expo start
```

If Metro has stale state after dependency or config changes:

```bash
npx expo start -c
```

For the web app:

```bash
npm run web
```

Use an authenticated CHC account with creator or admin access.

### If Expo says `package.json` does not exist

`package.json`, `package-lock.json`, and `app.json` are tracked at the repository
root. If Expo reports that one is missing, the local checkout is incomplete or
out of sync with GitHub. From the `CHC-Artists` directory, restore the current
`main` manifest without touching application source files:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git restore --source=origin/main -- package.json package-lock.json app.json tsconfig.json
npm install
npx expo start -c
```

## Deploy

The site is a static Expo web export served by the `chc-artists` Worker
(`wrangler.jsonc`), alongside `chc-upload-authorizer` and `chc-media-resolver`.
The asset config uses the single-page fallback, so a path with no file behind
it serves the app rather than 404ing.

```bash
npm run build     # expo export -p web  ->  dist/
npm run deploy    # builds, then wrangler deploy
```

The deployed address is `https://chc-artists.<account>.workers.dev`. A Worker
never answers on `pages.dev`, whatever it is named -- that is Cloudflare's
separate Pages product, and nothing is published there.

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