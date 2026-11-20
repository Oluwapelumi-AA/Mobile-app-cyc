# Google sign-in setup

Members can sign in or create an account with **Continue with Google** in the
mobile app, and staff can use **Continue with Google** on the dashboard. The
API checks every Google ID token itself (signature, expiry, that it was made
for one of your client IDs, and that Google verified the email).

## 1. Create the OAuth clients (Google Cloud Console)

1. Go to <https://console.cloud.google.com/> and create (or pick) a project, e.g. "CYC".
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the
   app name (Christ Youth Club), support email, logo and your privacy-policy
   link. Scopes: `openid`, `email`, `profile` only. Publish it when you're ready
   for everyone (while it's in *Testing*, only listed test users can sign in).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, three times:

| Client type | Used by | Settings |
|---|---|---|
| **Web application** | Dashboard, Expo web preview | Authorized JavaScript origins: `http://localhost:3000`, `http://localhost:8081`, your dashboard domain (e.g. `https://admin.cyc.org`). Authorized redirect URIs: `http://localhost:8081` and your web app URL. |
| **Android** | Android app | Package name from `mobile/app.json` (`android.package`), and the SHA-1 of your signing key (`eas credentials` shows it; also add the debug key's SHA-1 for development builds). |
| **iOS** | iPhone app | Bundle ID from `mobile/app.json` (`ios.bundleIdentifier`). |

## 2. Put the IDs in the settings

**Backend `.env`** – every client ID, so tokens from any of them are accepted:

```
GOOGLE_CLIENT_IDS=["123-web.apps.googleusercontent.com","123-android.apps.googleusercontent.com","123-ios.apps.googleusercontent.com"]
```

**Mobile `mobile/.env`:**

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=123-web.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=123-android.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=123-ios.apps.googleusercontent.com
```

**Dashboard `admin-dashboard/.env.local`:**

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=123-web.apps.googleusercontent.com
```

Restart all three. The Google buttons only appear once their IDs are set.

## 3. Testing on a phone

Google doesn't allow sign-in from inside **Expo Go**. Test it in the web
preview (`w` in Expo), or on a **development build**:

```
cd mobile
npx expo run:android      # or: npx expo run:ios   (or build with EAS)
```

## How accounts are matched

- A Google account whose email has no CYC account gets a **new account**
  (email already confirmed, no password). The app then asks for their
  chapter, department and interests as usual.
- If the email already has a CYC account, Google is **linked** to it and the
  member gets an email saying so.
- Google-only members can add a password later in **Profile → Account →
  Sign-in & security**.
- Admins still need their two-step code after Google sign-in.
