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
| `src/app/onboarding` | Name and language, chapter, department |
| `src/app/(app)/(tabs)` | Home, Learn (sermons, courses), Community, Events, Profile |
| `src/app/(app)` | Detail screens: chapter, event, meeting, sermon player, course, lesson, quiz, search, notifications, settings |
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
- **Continue as guest** creates an account without a chapter; guests can join
  one later from Home or Community.
