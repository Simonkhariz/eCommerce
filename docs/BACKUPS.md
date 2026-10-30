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
| `database.sql.gz` | A consistent snapshot taken without locking the shop (one transaction) |
| `uploads.tar.gz` | Every file in the uploads folder |
| `manifest.json` | Time, database name, how the dump was written, sizes and SHA-256 checksums, and (PHP dumps) the rows in every table |

The dump is made by `mysqldump` (found on `PATH`, in XAMPP's folder on Windows, or at
`MYSQLDUMP_PATH`; its password goes in the environment, never on the command line). **Shared and
cPanel hosts often do not let PHP run programs**, or have no `mysqldump`: then PHP writes the same
consistent dump itself (`App\Support\SqlDump`), and the script says "written by PHP". Force it
with `--php-dump`. The script never deletes old backups.

### Schedule it (daily)

```cron
30 2 * * *  php /var/www/shopco/backend/scripts/backup.php >> /var/log/shopco-jobs.log 2>&1
```

(cPanel: "Cron Jobs", e.g. `30 2 * * * /usr/local/bin/php /home/<user>/shopco/backend/scripts/backup.php`;
use the PHP path cPanel shows. Windows: `schtasks /Create /SC DAILY /ST 02:30 /TN "ShopCo Backup" /TR "C:\xampp\php\php-win.exe C:\path\to\E-commerce\backend\scripts\backup.php"`.)

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

1. **Database**, into a new, empty database. No shell tools are needed:
   ```bash
   php backend/scripts/restore_database.php --backup=<backup folder> --database=shopco_restore
   ```
   It checks the checksum in `manifest.json` before loading, refuses a database that already
   has tables (it never replaces data), and for dumps written by PHP compares every table's row
   count afterwards. If loading stops halfway (a damaged file), it empties the new database again.
   Create the database first (cPanel → MySQL Databases, give the shop's user all privileges), or
   add `--create` where your MySQL user may create databases. Without SSH, run the command once
   as a cron job and read the output cPanel emails you. With shell access, the mysql client also
   works: `gunzip < database.sql.gz | mysql -u <user> -p shopco_restore`.
   Then point `DB_DATABASE` at it. The step-by-step recovery is in `docs/RUNBOOKS.md`.
2. **Pictures**:
   ```bash
   tar -xzf uploads.tar.gz -C /var/www/shopco/backend/public/uploads
   ```
3. **Check**: admin → System status (database connected, migrations applied), a few product
   pages show their pictures, and the latest orders are there.

This was tested on the development data: a restore into a spare database had the same number of
orders, products, users and emails, and the restored pictures were byte-for-byte identical. The
test suite repeats it on every run (`UploadsTest`): mysqldump and PHP backups both restore with
identical rows (text, money, dates and JSON compared field by field), and damaged, cut-off or
non-matching backups are refused without leaving anything behind.
