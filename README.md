# CHC Artists

**CHC Artists** is the artist and creator portal for the **Coptic Hymns Centre (CHC)** platform.

It is designed for cantors, choirs, hymn groups, musicians, and other approved creators who publish audio through CHC. The app gives artists a dedicated place to manage their presence on the platform, submit releases, monitor their content, and eventually manage analytics and monetization.

The concept is similar to platforms such as **Spotify for Artists** and **Apple Music for Artists**, but built specifically for the CHC ecosystem and the needs of Coptic Orthodox audio content.

---

## About the App

CHC Artists is separate from the main CHC listener experience.

The main **CHC app** is where users discover and listen to hymns, songs, liturgical recordings, albums, playlists, and other audio.

**CHC Artists** is the management side of that ecosystem.

Artists can use it to:

- Create and manage an artist account
- Sign in using supported authentication methods, including Google
- Manage their artist profile
- Submit tracks, albums, and other releases
- Upload audio and artwork
- Track the status of submitted releases
- Manage published content
- View performance and audience information
- Access future artist monetization tools

The goal is to give creators a professional publishing experience while keeping all content integrated with the wider CHC platform.

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

### Artist Accounts

Artists can create an account and access their own creator dashboard.

Authentication is powered through the CHC backend and supports standard account creation as well as supported third-party sign-in methods such as Google.

---

### Artist Profiles

Each artist can have a dedicated profile containing information such as:

- Artist name
- Profile image
- Biography
- Artist type
- Social or external links
- Published releases
- Associated tracks and albums

Artist profiles are designed to connect directly with the artist pages shown inside the main CHC app.

---

### Release Submissions

Artists can prepare and submit content for publication on CHC.

A submission may include:

- Track title
- Artist information
- Album or release information
- Audio file
- Cover artwork
- Hymn or song metadata
- Language
- Release date
- Credits
- Additional publishing information

Uploaded files are processed before the submission is finalized.

The submission system is designed so that artists can clearly see the upload and processing state of every file before submitting a release.

---

### Submission Review

Content submitted through CHC Artists can go through a review process before becoming publicly available.

Possible submission states may include:

- Draft
- Uploading
- Processing
- Submitted
- Under Review
- Approved
- Rejected
- Published

This allows CHC to maintain consistent metadata, audio quality, artwork quality, and content standards across the platform.

---

### Content Management

After publication, artists can manage the releases connected to their account.

Depending on the release and account permissions, this may include:

- Viewing published tracks
- Viewing albums and releases
- Updating selected metadata
- Managing artwork
- Reviewing release status
- Requesting changes
- Managing future releases

---

### Artist Analytics

CHC Artists is intended to provide artists with information about how their content performs across the CHC platform.

Analytics can include information such as:

- Total plays
- Unique listeners
- Popular tracks
- Popular releases
- Listening trends
- Audience growth
- Geographic or platform-level statistics where appropriate

The objective is to help artists understand how their recordings are being discovered and used without requiring access to CHC's internal administrative systems.

---

### Monetization

CHC Artists is being designed with future monetization support in mind.

This may eventually allow eligible artists to:

- Enable monetization for approved content
- View monetized plays
- Review estimated earnings
- View revenue history
- Manage payout information
- Access statements and reporting

Any monetization system will require its own eligibility, legal, advertising, payment, and rights-management processes before being made generally available.

---

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

A typical release workflow looks like this:

1. **Create or sign in to a CHC Artists account**
2. **Create or claim an artist profile**
3. **Start a new submission**
4. **Enter the release metadata**
5. **Upload audio and artwork**
6. **Wait for all files to finish uploading and processing**
7. **Submit the release for review**
8. **CHC reviews the submission**
9. **Approved content is published to the CHC platform**
10. **The artist can monitor and manage the release from CHC Artists**

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

## Current Development Areas

Development is currently focused on building the core artist platform, including:

- Authentication and account creation
- Google sign-in
- Artist onboarding
- Artist profiles
- Release creation
- Audio uploads
- Artwork uploads
- Upload progress and processing
- Submission validation
- Submission review workflows
- CHC backend integration
- Cloudflare media integration
- Cross-platform Expo support

Additional creator tools will continue to be added as the CHC audio platform expands.

---

## Future Possibilities

Potential future additions include:

- Advanced artist analytics
- Revenue dashboards
- Audio advertising
- Artist monetization
- Payout management
- Release scheduling
- Team and manager access
- Multiple artists under one account
- Collaboration credits
- Lyrics and hymn text management
- Copyright and rights information
- Content ownership tools
- Notifications
- Artist verification
- Release editing and takedown requests
- Promotional tools
- Featured release management

These features are part of the broader direction of CHC Artists and may be implemented gradually.

---

## CHC Ecosystem

CHC Artists is one part of the broader Coptic Hymns Centre project.

The long-term goal of CHC is to provide a unified digital platform for Coptic Orthodox resources while giving the people who create, preserve, record, and publish those resources the tools they need to manage their work properly.

**CHC Artists provides the creator side of that platform.**

---

## Status

CHC Artists is currently under active development.

Features, architecture, workflows, and interfaces may change as the platform continues to evolve.
