# CYC mobile app

Expo (SDK 57) app for CYC members: home, events, chapter, community feed,
departments, sermons with a player, courses with lessons and quizzes,
search, notifications and profile. It talks to the FastAPI backend in
`../backend` (see `../backend/docs/mobile-api.md`).

## Run it

1. Start the backend (from `../backend`): `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
   `--host 0.0.0.0` lets your phone reach it over Wi-Fi.
2. Tell the app where the API is. Copy `.env.example` to `.env` and set
   `EXPO_PUBLIC_API_URL` to your computer's local IP, for example
   `http://192.168.1.20:8000`. (On Windows, `ipconfig` shows it as "IPv4 Address".)
3. Install and start:

   ```bash
   npm install
   npx expo start
   ```

   Scan the QR code with Expo Go on your phone, or press `w` for the web preview.

## Checks

```bash
npx tsc --noEmit   # types
npx expo lint      # lint
```

## Where things are

| Path | What |
|---|---|
| `src/app/(auth)` | Welcome, sign in, create account, forgot password |
| `src/app/onboarding` | Location, chapter, department, interests |
| `src/app/verify.tsx` | Public certificate check (no sign-in) |
| `src/app/(app)/(tabs)` | Home, Learn (sermons, courses), Community, Events, Profile |
| `src/app/(app)` | Detail screens: chapter, find chapter, departments, interest groups, event, meeting, sermon player, course, lesson, quiz, course complete, certificate, my activity, account, settings, downloads, About CYC |
| `src/components` | Shared UI (`ui.tsx`), cards, mini player |
| `src/lib` | API client and sign-in (`api.ts`, `auth.tsx`), theme, audio player, downloads, push |

## Notes

- **Light and dark mode** follow the phone's setting.
- **Push notifications** need an EAS project: run `npx eas-cli init` once, then
  build with EAS. Push doesn't work in Expo Go on Android. On the server set
  `PUSH_PROVIDER=expo` and run the notifications worker.
- **Live meetings** need a video provider on the server (`VIDEO_PROVIDER`).
  Until one is set, Join meeting checks you in and explains that video isn't on yet.
- **Sermons** play from the uploaded file or the external link. Downloads are
  stored on the phone (Profile → Downloads).
- **Design:** follows the Figma "CYC Mobile App" file (Material 3 colours,
  Bricolage Grotesque + Plus Jakarta Sans, Phosphor icons). Theme tokens are in
  `src/lib/theme.ts`, shared parts in `src/components/ui.tsx`.
- **Continue as guest** lets people browse chapters, events, sermons and
  courses without an account. Anything that needs an account (registering,
  joining, saving, posting) asks them to create one.
- **Interest groups** (Music, Drama, Technology…) are a preview stored on the
  phone only (`src/lib/groups.ts`). They need a backend before launch.
- **About CYC and the anthem** use placeholder text in `src/lib/content.ts`.
  Replace the [bracketed] text with CYC's real content.
- **Privacy → who can see my profile** is shown as "coming soon"; it needs
  backend support.
- **Language** is English only for now.
- **Certificates** have a number and QR code; anyone can check one at
  `/verify` or `GET /api/v1/certificates/verify/{number}`.
