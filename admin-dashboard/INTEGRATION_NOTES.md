# CYC Admin Dashboard integration notes

## What is included

- Existing Next.js/React/TypeScript admin application and its 13 navigation sections are preserved.
- Existing authentication, shared shell, styling tokens, API proxy and backend-connected screens are preserved.
- Courses and quizzes now include a dedicated **Quiz results** tab, pass/fail visibility, certificate eligibility, an **Issue certificate** dialog, and send-action states for UI review.

## Important current limitation

The course/quiz/result/certificate interactions in this branch are explicitly **preview-only**. They update local React state and do not persist or deliver a real certificate. The supplied ZIP has no learning/certificate backend routes, and the user-facing app is not included in this archive.

## Backend work needed for production

Agree on API contracts with the FastAPI backend before wiring the UI. A possible contract is:

- `GET /admin/courses` and `POST /admin/courses`
- `PATCH /admin/courses/{course_id}`
- `GET /admin/quizzes` and `POST /admin/quizzes`
- `GET /admin/quiz-attempts` (filters for user, course, result, and date range)
- `GET /admin/certificates`
- `POST /admin/certificates/issue` (validate passing threshold server-side and create a certificate)
- A delivery endpoint or job for email/in-app notification, with delivery status returned to the admin UI
- User-app endpoints such as `GET /me/certificates` and a protected certificate-download URL/endpoint

The Next.js allow-list proxy in `app/api/backend/[...path]/route.ts` must be updated to allow only the agreed endpoints and methods. The FastAPI backend must enforce authorization and eligibility; do not rely on client-side pass/fail checks.

## Validation

- TypeScript/TSX syntax-transpilation check passed for 31 source files.
- A full Next.js production build could not be run in this environment because npm dependency installation could not reach the npm registry (`EAI_AGAIN`). Run `npm ci` and `npm run build` locally after extracting the archive.


## Branding update (2026-10-25)

- Added `public/cyc-logo.png` from the supplied CYC logo asset.
- Replaced the sign-in screen and session-check branding mark with the supplied logo.

## Backend/database integration status

This archive contains the `admin-dashboard` frontend only. It does not include the FastAPI `backend/` source, database models, migrations, or database configuration. Several screens currently use sample/preview state (including posts/comments, notifications, and courses/quizzes), so their persistence cannot safely be implemented or verified from this archive alone. Upload the complete project archive including `backend/`, database migrations, and environment example files (with secrets removed) to finish the API contracts, persistence, and migration work.
