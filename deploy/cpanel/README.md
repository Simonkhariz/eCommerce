# Shop.co on shared hosting (cPanel)

The whole shop on one cPanel account: the storefront as a Node.js app, the PHP API on a second
address, MySQL from the account, and pictures in your Cloudflare R2 bucket. You build on your PC and
upload two zip files, because builds on shared hosting usually run out of memory.

**How far this is tested:** the zip was unpacked in a new folder and passed the shop's 30-step smoke
test, on Windows. It has **not yet run on a real cPanel host or on Linux**, so expect small fixes the
first time. Please tell me what the first run shows.

## 1. Choose a host

Before paying or spending time on a host, check it can run the shop.

Upload `check-host.php` (made by step 4, or in `deploy/cpanel/`) to the account's web folder, open it
in a browser, read the answers, then **delete it**. Also confirm in cPanel:

| Needed | Why |
|---|---|
| **Setup Node.js App**, offering Node.js 20.9 or newer | Runs the storefront |
| PHP 8.2+ | Runs the API (**Select PHP Version** or **MultiPHP Manager**) |
| MySQL or MariaDB | The database |
| **Two addresses** you can point at different folders (a domain and a subdomain) | One for the shop, one for the API |
| **Cron Jobs** | Emails, unpaid orders, backups. Every 5-15 minutes is enough |
| No browser check in front of the site | It would block the storefront's calls and payment notices (InfinityFree has one) |

| Kind of host | Honest expectation |
|---|---|
| **Paid cPanel with Node.js** (about ₦1,000-4,500/month in Nigeria; confirm on the order page) | The dependable choice. Check the renewal price, not only the first year |
| **Free with Node.js listed** (HelioHost, WebHostMost) | May work, may struggle. Their limits aren't published, and HelioHost reportedly suspends accounts not logged into monthly |

## 2. Create the addresses and the database

1. In **Domains** (or **Subdomains**), create two addresses, for example `shop.example.com` and
   `api.example.com`. Point the API's **document root** to `shopco-api/public`, and let the shop's
   address have its own folder.
2. Turn on free https for both (**SSL/TLS Status → Run AutoSSL**). Sign-in needs https.
3. In **MySQL Databases**, create a database and user (cPanel adds your account name in front, such
   as `myacc_shopco`), and give the user **All privileges** on the database.

## 3. Put the API online

1. Upload `shopco-api.zip` (step 4 makes it; run step 4 once now with the API's address) to a new
   folder `shopco-api` in your home folder, **not** inside `public_html`, then **Extract** it.
2. In **Select PHP Version**, choose 8.2 or newer and tick: mysqli, curl, mbstring, openssl, fileinfo,
   simplexml, ctype, zlib, opcache. Set `upload_max_filesize` to 8M, `post_max_size` to 10M.
3. Rename `env.cpanel.example` to `.env`, and fill in every `<...>` value. Make a random
   `REVALIDATE_SECRET` on your PC: `php -r "echo bin2hex(random_bytes(24));"`.
4. **Your shop's data.** On your PC, run `php backend/scripts/backup.php`, then in **phpMyAdmin**, open
   the new database and **Import** `database.sql.gz` from the new folder in `backend/storage/backups/`.
   This brings your products, settings and admin accounts, and **closes the setup page**.
   - Starting with an empty database instead? The setup page is open to whoever reaches it first, so
     create your administrator straight away at `https://<shop address>/admin/setup`.
5. Apply any newer database changes: in **Cron Jobs**, add a job for the next minute, wait, then delete it:
   ```
   /usr/local/bin/php /home/<account>/shopco-api/migrations/migrate.php
   ```
   (cPanel shows the right PHP path; on some hosts it is different, such as `/opt/cpanel/ea-php82/root/usr/bin/php`.)
6. Open `https://<api address>/api/v1/health`. It should answer `"status":"ok"` or similar, not an
   error page or a browser check.

## 4. Build on your PC

Commit your work first (only committed code is built). In a terminal, in the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/cpanel/build.ps1 -ApiUrl https://api.example.com
```

About 5 minutes. It makes `shopco-web.zip` and `shopco-api.zip` in a `shopco-cpanel` folder on your
Desktop. The API address is written into the build, so a new address needs a new build.

## 5. Put the storefront online

1. Upload `shopco-web.zip` to a new folder `shopco-web` in your home folder, and **Extract** it. You
   should see `server.js`, `package.json`, `node_modules`, `public`, and a hidden `.next` folder (turn on
   **Show Hidden Files** in File Manager).
2. Open **Setup Node.js App → Create Application**:

   | Setting | Value |
   |---|---|
   | Node.js version | 20.x or newer |
   | Application mode | Production |
   | Application root | `shopco-web` |
   | Application URL | the shop's address |
   | Application startup file | `server.js` |

3. Add these **environment variables**:

   | Name | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `BACKEND_ORIGIN` | `https://<api address>` |
   | `REVALIDATE_SECRET` | the same value as in the API's `.env` |
   | `UV_THREADPOOL_SIZE` | `2` (stays within shared hosting's process limits) |

4. **Don't click "Run NPM Install".** Everything is in the zip. Click **Start** or **Restart**.
5. Open the shop's address, then check pictures load and you can sign in at `/admin`.

## 6. Scheduled jobs

In **Cron Jobs**, using the PHP path cPanel shows (add `>/dev/null 2>&1` if the host emails you each run):

| How often | Command |
|---|---|
| Every 5 minutes (every minute if allowed) | `php /home/<account>/shopco-api/scripts/process_outbox.php --limit=500 --max-seconds=50 --rate=8` |
| Every 10 minutes | `php /home/<account>/shopco-api/scripts/expire_pending_orders.php` |
| Daily, 03:00 | `php /home/<account>/shopco-api/scripts/check_database.php` |
| Daily, 02:30 | `php /home/<account>/shopco-api/scripts/backup.php && php /home/<account>/shopco-api/scripts/backup_to_bucket.php` |

A host that limits how often cron runs is fine: the shop also sends due emails after ordinary visits.

## 7. Check it properly

Turn on dev mode (admin → **Store settings**), then open **System status**:

- **Visitor addresses must show your own public address** (compare with a "what is my IP" site). If it
  shows the host's address, every visitor is being counted as one person, so 10 orders in 10 minutes
  from the whole shop would be refused. Add the address it shows to `TRUSTED_PROXIES` in `.env`. Test
  from two different connections, such as Wi-Fi and mobile data, and if both show the same address,
  tell me; the host's proxy may need handling.
- No warnings; storage says `s3 · writable`; extensions complete; upload limit at least 5 MB.
- Turn dev mode off again before showing a client.

Then, on a phone with mobile data: browse, open a product, place an order, pay via WhatsApp, tap "I've
sent the transfer", confirm it in admin, and see the receipt.

Finally, on **uptimerobot.com** (free), monitor `https://<api address>/api/v1/health` and the shop's
address every 5 minutes. Some free hosts stop quiet sites, and this also tells you when it's down.

## Updating later

1. Commit, then run step 4 again.
2. **API:** upload and extract `shopco-api.zip` over `shopco-api`. `.env` and `storage` aren't in the zip,
   so they're kept. Run the migration cron from step 3 if the database changed.
3. **Storefront:** in File Manager, delete the old `.next` folder in `shopco-web`, upload and extract
   `shopco-web.zip` over it, then **Restart** in Setup Node.js App.

Pages can fail during those few minutes, so don't update during a client demo.

## Troubleshooting

| Problem | Look at |
|---|---|
| The app won't start, or shows a 503 | **Setup Node.js App** → the app's log file; the Node.js version is at least 20.9; `server.js` is the startup file |
| Pictures on product pages are broken, others fine | The picture library: look for `sharp` in the app log. Tell me the message and the host's processor type (`x64` or `arm64`; rebuild with `-Cpu arm64` if needed) |
| "Resource temporarily unavailable" or `EAGAIN` in the log | The host's process limit. Keep `UV_THREADPOOL_SIZE=2`; on a free host, this may be its limit |
| Pages load but the catalogue is empty | `BACKEND_ORIGIN`, then open `/api/v1/health` on the API address; a browser check would also cause this |
| API shows a 500 error | `shopco-api/storage/logs/` and cPanel's **Errors**; check the database name and user in `.env`, and that `storage` is writable |
| Admin sign-in doesn't stay | Both addresses must be https, and `FRONTEND_URL` must match the shop's address |
| Pictures upload but don't appear | R2 keys in `.env`, and System status → storage |
