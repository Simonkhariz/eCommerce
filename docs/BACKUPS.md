# Backups and restore

The shop's data lives in two places: the **MySQL database** (orders, customers, products,
settings) and the **uploaded pictures** (`backend/public/uploads`, or the folder in `UPLOAD_DIR`).
Pictures are not in git, so the server is their only copy until you back them up.

## Taking a backup

```bash
php backend/scripts/backup.php
```

Each run writes one dated folder (default `backend/storage/backups`, or `BACKUP_DIR`):

| File | What it is |
| :--- | :--- |
| `database.sql.gz` | A consistent `mysqldump` snapshot taken without locking the shop (`--single-transaction`) |
| `uploads.tar.gz` | Every file in the uploads folder |
| `manifest.json` | Time, database name, sizes and SHA-256 checksums of both files |

`mysqldump` is found on `PATH`, in XAMPP's folder on Windows, or at `MYSQLDUMP_PATH`. The database
password is passed in the environment, never on the command line. The script never deletes old
backups.

### Schedule it (daily)

```cron
30 2 * * *  php /var/www/shopco/backend/scripts/backup.php >> /var/log/shopco-jobs.log 2>&1
```

(cPanel: "Cron Jobs". Windows: `schtasks /Create /SC DAILY /ST 02:30 /TN "ShopCo Backup" /TR "C:\xampp\php\php-win.exe C:\path\to\E-commerce\backend\scripts\backup.php"`.)

### Keep a copy off the server

A backup on the same disk does not survive the disk. Copy each new folder somewhere else, for
example a separate MinIO/S3 bucket (`mc mirror`, `aws s3 sync`, `rclone`), another machine, or
your hosting provider's backup storage. Delete old copies there on whatever schedule you choose
(for example: daily for two weeks, then weekly). Once pictures are stored in MinIO, also turn on
**bucket versioning** there so a deleted or overwritten picture can be recovered.

## Checking a backup

`manifest.json` holds checksums: `sha256sum database.sql.gz uploads.tar.gz` must print the same
values. The safest check is a test restore into a spare database (below), then counting rows.

## Restoring

1. **Database** (into an empty database; restoring over a live one replaces its data):
   ```bash
   mysql -u root -p -e "CREATE DATABASE shopco_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
   gunzip < database.sql.gz | mysql -u root -p shopco_restore
   ```
   Then point `DB_DATABASE` at it, or rename databases during a maintenance window.
2. **Pictures**:
   ```bash
   tar -xzf uploads.tar.gz -C /var/www/shopco/backend/public/uploads
   ```
3. **Check**: admin → System status (database connected, migrations applied), a few product
   pages show their pictures, and the latest orders are there.

This was tested on the development data: a restore into a spare database had the same number of
orders, products, users and emails, and the restored pictures were byte-for-byte identical.
