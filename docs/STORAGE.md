# Picture storage: server disk or Cloudflare R2

Uploaded pictures (product photos, banners, category images) are kept by one storage layer
(`backend/src/Storage`). The shop always links to `/uploads/<key>`, whichever storage holds the
file, so moving storage changes settings, not data.

**Current state (1 Nov 2026):** the development shop runs on Cloudflare R2: `STORAGE_DRIVER=s3`,
bucket `shopco-media` (private), with test keys to be replaced before going live. All 67 pictures
were copied after a fresh backup (`backend/storage/backups/2026-11-01_014310`) and every copy was
read back and matched. The disk copies were then moved out of the web folder to
`backend/storage/backups/uploads-disk-copy-2026-11-01` (never served), so every picture is now read
from R2 and every upload is saved there; all 67 were checked through the shop's links
(`X-Upload-Source: s3`, identical bytes). To switch back: move that folder's contents back into
`backend/public/uploads` (or run `migrate_uploads.php --apply --all --backup=<folder> --to=local`)
and set `STORAGE_DRIVER=local`. With `php -S`, start the API with `backend/dev-router.php` so pictures that
exist only in the bucket (new uploads) are served (free tier: 10 GB-month storage, 1 million writes
and 10 million reads a month, free downloads).

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
4. **Add the bucket settings** to `backend/.env` on the server (never in the storefront's
   `.env.local`), and **leave `STORAGE_DRIVER=local` for now**:
   ```ini
   S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=shopco-media
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   ```
5. **Copy the pictures** (next section): a test batch first, then everything.
6. **Switch**: set `STORAGE_DRIVER=s3`, then check admin → System status ("Image storage" should
   say **s3 · writable**) and a few product pages.

Switch only after every picture has been copied: once `STORAGE_DRIVER=s3` is set, the shop looks
for pictures in the bucket, and pictures that are still only on the disk would not show.

## Copying the pictures (`backend/scripts/migrate_uploads.php`)

The script only copies. It never deletes or moves anything; a file that already exists in the
bucket with different content is left alone and reported. Each copy is checked: same bytes
(SHA-256), same size, picture content type and caching in the bucket. Every run that copies
writes a report to `backend/storage/migrations/`. Running it again is safe.

```sh
# 1. See what would be copied (nothing is written)
php backend/scripts/migrate_uploads.php

# 2. Test batch: 5 pictures, the ones the shop uses first
php backend/scripts/migrate_uploads.php --apply

# 3. Check the copies through the shop's own links: start a second API on port 8001 with
#    STORAGE_DRIVER=s3 (an env file copy), then
php backend/scripts/migrate_uploads.php --apply --keys=<a key from step 2> --verify-url=http://127.0.0.1:8001
#    While the originals are still on the disk, the web server may hand out the disk copy before
#    the shop's code runs: the report then says "link (answered by the disk copy, not the bucket)".
#    The bucket copy itself is still proven by reading it back (content, size, type, caching).
#    The shop marks its own answers with the header X-Upload-Source: s3 or local.

# 4. Everything, once the batch looks right; needs a fresh backup that still checks out
php backend/scripts/backup.php
php backend/scripts/migrate_uploads.php --apply --all --backup=backend/storage/backups/<folder>
```

Then switch (step 6 above). Run step 4 once more straight after switching, to copy any picture
uploaded in the meantime (already-copied files are only checked again).

**Rollback.** Before the switch, nothing has changed for the shop: leave `STORAGE_DRIVER=local`.
After the switch, set `STORAGE_DRIVER=local` again; the originals are still on the disk. To bring
back pictures uploaded while the bucket was in use, first run
`php backend/scripts/migrate_uploads.php --apply --all --backup=<folder> --to=local`.
Delete the bucket copies (in the Cloudflare dashboard) only when you are sure you will not go back.

## Other S3-compatible providers

The same settings work for Backblaze B2, AWS S3, MinIO AIStor or Garage: set `S3_ENDPOINT`,
`S3_REGION` and the keys; `S3_PATH_STYLE=false` for providers that need bucket-name hostnames.

## Development notes

- With `STORAGE_DRIVER=s3`, start PHP's built-in server with the router so `/uploads/…` reaches
  the API: `php -S 127.0.0.1:8000 -t backend/public backend/dev-router.php`. Apache (`.htaccess`) and
  nginx (`try_files … /index.php`) already do this.
- Tests (`S3StorageTest`, `MediaMigrationTest`) use a local stand-in S3 API (`backend/tests/support/fake_s3.php`) that verifies every
  signature; nothing is sent to Cloudflare.

## Backups

On disk, `backend/scripts/backup.php` archives the pictures. In a bucket it copies new and changed
pictures to a growing folder on the server, `<BACKUP_DIR>/pictures`, and never removes any from it.
`backend/scripts/backup_to_bucket.php` copies each database backup into the same
bucket under `backups/` (outside `uploads/`, so never listed or served as a picture). See
`docs/BACKUPS.md`.
