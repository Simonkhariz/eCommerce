# Picture storage: server disk or Cloudflare R2

Uploaded pictures (product photos, banners, category images) are kept by one storage layer
(`backend/src/Storage`). The shop always links to `/uploads/<key>`, whichever storage holds the
file, so moving storage changes settings, not data.

**Current state:** `STORAGE_DRIVER=local` (the server's disk, `backend/public/uploads`). Cloudflare R2
is the chosen bucket (free tier: 10 GB-month storage, 1 million writes and 10 million reads a
month, free downloads; see Cloudflare's R2 pricing page). The R2 driver is built and tested; it
waits for the Cloudflare account.

## How it works with a bucket

- The bucket stays **private**. Browsers never talk to R2: they ask the shop for
  `/uploads/<key>`, the storefront forwards that to the API, and the API reads the picture from
  the bucket (`App\Storage\MediaServer`) with the same caching as on disk (admin uploads a year,
  others a day) and "not changed" (304) answers. The storefront's image optimiser keeps resized
  copies, so R2 is read rarely.
- Pictures live under the prefix `uploads/` in the bucket. Anything else in the bucket (for
  example backups) is never listed or served as a picture.
- Only picture keys (`.jpg`, `.jpeg`, `.png`, `.webp`, letters/digits/`._-` and `/`) are served.
- Requests are signed with AWS Signature V4 (checked against AWS's published test suite). The
  keys stay in `backend/.env` and never appear in errors, logs or System status.

## Setting up Cloudflare R2 (when you are ready)

1. **Create a Cloudflare account** and open **R2 Object Storage**. (Cloudflare may ask for a payment
   method when you enable R2; usage within the free tier is not charged.)
2. **Create a bucket**, e.g. `shopco-media`. Leave public access **off**.
3. **Create an API token** (R2 → Manage API tokens): permission **Object Read & Write**, applied to
   **this bucket only**. Copy the **Access Key ID** and **Secret Access Key** (shown once) and note your
   **Account ID**.
4. **Configure the API** in `backend/.env` on the server (never in the storefront's `.env.local`):
   ```ini
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=shopco-media
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   ```
5. **Check** admin → System status: "Image storage" should say **s3 · writable**.
6. **Move the existing pictures** with the migration step (roadmap Prompt 24): a small test batch
   first, checked, with the originals kept on the server until everything is confirmed.

Do step 4 only when step 6 is ready: once `STORAGE_DRIVER=s3` is set, the shop looks for pictures in
the bucket, and pictures still only on disk would not show.

## Other S3-compatible providers

The same settings work for Backblaze B2, AWS S3, MinIO AIStor or Garage: set `S3_ENDPOINT`,
`S3_REGION` and the keys; `S3_PATH_STYLE=false` for providers that need bucket-name hostnames.

## Development notes

- With `STORAGE_DRIVER=s3`, start PHP's built-in server with the router so `/uploads/…` reaches
  the API: `php -S 127.0.0.1:8000 -t backend/public backend/dev-router.php`. Apache (`.htaccess`) and
  nginx (`try_files … /index.php`) already do this.
- Tests use a local stand-in S3 API (`backend/tests/support/fake_s3.php`) that verifies every
  signature; nothing is sent to Cloudflare.

## Backups

On disk, `backend/scripts/backup.php` archives the pictures. In a bucket it backs up the database
only and says so; back up the pictures with the provider's tools (for example a scheduled copy to
a second bucket). See `docs/BACKUPS.md`.
