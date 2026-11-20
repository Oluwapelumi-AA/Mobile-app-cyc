# Amazon S3 + CloudFront for media

Sermons, resources (audio, video, documents), course lesson videos, lesson
notes, avatars and meeting replays are stored in a **private S3 bucket**.
Admins upload straight from the dashboard to S3 (files never pass through
the API). Members play and download them through **CloudFront** with signed
links that expire (4 hours by default), so files can't be shared publicly.

## 1. Bucket

1. S3 → **Create bucket**, e.g. `cyc-media-prod`, region close to members
   (e.g. `eu-west-2` London, or `af-south-1` Cape Town).
2. Keep **Block all public access** on. Default encryption: SSE-S3.
3. **Permissions → CORS** (lets the dashboard and app upload directly):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "http://localhost:8081", "https://admin.cyc.org"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "x-amz-server-side-encryption"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## 2. IAM user for the API

IAM → Users → create `cyc-api` (no console access) → attach this inline
policy, then create an **access key** for it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::cyc-media-prod/*"
    },
    { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::cyc-media-prod" }
  ]
}
```

## 3. CloudFront

1. **Key pair for signed URLs** (on your computer):

   ```
   openssl genrsa -out cloudfront_private.pem 2048
   openssl rsa -pubout -in cloudfront_private.pem -out cloudfront_public.pem
   ```

2. CloudFront → **Public keys** → add `cloudfront_public.pem` → note its **ID**.
   Then **Key groups** → create `cyc-media` with that key.
3. CloudFront → **Create distribution**:
   - Origin: the bucket. **Origin access: Origin access control (OAC)** →
     create one, then copy the bucket policy it offers into the bucket's
     *Permissions → Bucket policy*.
   - Viewer protocol: Redirect HTTP to HTTPS.
   - **Restrict viewer access: Yes → Trusted key groups → `cyc-media`**.
   - Cache policy: CachingOptimized.
   - Add a second **behavior** for `avatars/*` *without* restricted viewer
     access, so profile photos are public.
4. Optionally add your own domain (e.g. `media.cyc.org`) with an ACM
   certificate.

## 4. Backend `.env`

```
STORAGE_BACKEND=s3
STORAGE_BUCKET=cyc-media-prod
STORAGE_REGION=eu-west-2
STORAGE_ACCESS_KEY_ID=AKIA...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_PUBLIC_BASE_URL=https://d1234abcd.cloudfront.net

CDN_PROVIDER=cloudfront
CLOUDFRONT_DOMAIN=d1234abcd.cloudfront.net
CLOUDFRONT_KEY_ID=K2ABCDEF123456
CLOUDFRONT_PRIVATE_KEY_PATH=/etc/cyc/cloudfront_private.pem
CLOUDFRONT_URL_TTL_SECONDS=14400
```

Keep `cloudfront_private.pem` out of git (store it on the server or in a
secrets manager). Instead of a path you can paste it into
`CLOUDFRONT_PRIVATE_KEY` with `\n` for line breaks.

Without CloudFront (`CDN_PROVIDER=none`) everything still works with S3
presigned links; CloudFront just makes playback faster and data cheaper.

## Limits and files

| What | Types | Largest (setting) |
|---|---|---|
| Resource / sermon file | audio, video, PDF… | 500 MB (`RESOURCE_MAX_UPLOAD_BYTES`) |
| Lesson video | MP4, MOV, WebM | 2 GB (`COURSE_VIDEO_MAX_UPLOAD_BYTES`) |
| Lesson notes | PDF | 50 MB (`COURSE_NOTES_MAX_UPLOAD_BYTES`) |
| Avatar | JPEG, PNG, WebP | 5 MB (`AVATAR_MAX_UPLOAD_BYTES`) |

Files are stored under `resources/<id>/…`, `courses/<course>/lessons/<lesson>/video|notes/…`
and `avatars/…`. Replacing or deleting a file deletes the old one from S3.
Lesson videos are only signed for members enrolled in the course and for
course managers.
