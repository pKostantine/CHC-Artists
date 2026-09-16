# CHC Artists

Creator and management companion application for the Coptic Hymns Centre ecosystem.

## Phase 7: Lyrics Studio

The initial application surface is the synchronized-lyrics editor required by Phase 7 of `CHC_Media_Platform_Implementation_Phases.md` in the main CHC repository.

Implemented:

- creator/admin Supabase sign-in
- editable music-track discovery
- Coptic, Arabic, English, and French lyric sets
- original / translation / transliteration kinds
- paste lyrics and split into editable lines
- line reorder, delete, and text editing
- audio playback from the CHC media resolver
- one-tap timestamp marking from live playback position
- direct timestamp editing
- real-time active-line preview
- atomic draft saves through `save_track_lyric_draft`
- LRC import/export (LRC is interchange only, not canonical storage)

## Environment

Copy `.env.example` to `.env.local` and provide:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_CHC_MEDIA_BASE_URL`

The project intentionally shares the existing CHC Supabase and Cloudflare media infrastructure.

## Run

```bash
npm install
npm run web
```

Use an authenticated CHC account with creator or admin access.
