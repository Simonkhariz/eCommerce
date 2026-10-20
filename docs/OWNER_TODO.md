# Owner to-do: speed and setup (for later)

Things left for the store owner after the speed, scale and bug-fix work (commits 4724f0e to
1c1b511). Tick each one off as you go.

## Checklist

- [ ] **Turn on OPcache in XAMPP.** PHP currently recompiles every file on every request;
      OPcache typically makes the API 2-3x faster. Steps in [section 1](#1-turn-on-opcache-about-5-minutes).
- [x] **Install sharp.** Done: Next.js 16 installs sharp itself, so there is nothing to do.
      See [section 2](#2-sharp-done-with-nextjs-16).
- [ ] **Production web server.** Host the API on Apache or nginx with PHP-FPM; `php -S` handles
      one request at a time. Steps in [section 3](#3-a-proper-web-server-for-the-api).
- [ ] **Broken pictures.** Three home banners and all six categories point to picture files that
      don't exist (`/images/categories/*.jpg`). Upload new ones in admin.
- [x] **Merge.** Done: `main` already contains `mobile-responsive` and the earlier `shop-todos`
      branch (main is at 1c1b511). Restart the :3000 dev server once if it has been running since
      before the merge, so it picks up the self-hosted fonts.

Also still open from earlier work:

- [ ] Live Kora / Monnify keys and webhooks
- [ ] SMTP settings for real email
- [ ] Schedule `expire_pending_orders`, `process_outbox` and `cleanup_database` (see `backend/README.md`)
- [ ] Site-content TODOs (about, contact, policies)

---

## 1. Turn on OPcache (about 5 minutes)

XAMPP's PHP 8.2 already ships the OPcache file (`php_opcache.dll`); it is only switched off in `php.ini`.

1. Open `C:\xampp\php\php.ini`. The quick way: XAMPP Control Panel → Apache row → **Config** →
   **PHP (php.ini)**.
2. Search (Ctrl+F) for `;zend_extension=opcache` (around line 964) and delete the `;` at the front:
   ```ini
   zend_extension=opcache
   ```
3. Search for `[opcache]` (around line 1800). Remove the `;` from these lines and set these values:
   ```ini
   opcache.enable=1
   opcache.memory_consumption=128
   opcache.interned_strings_buffer=16
   opcache.max_accelerated_files=10000
   opcache.validate_timestamps=1
   opcache.revalidate_freq=2
   ```
   - Leave `opcache.enable_cli=0`, so command-line scripts and tests behave as before.
   - `validate_timestamps=1` means code you edit is picked up within 2 seconds, which is right
     for development.
4. Save, then restart PHP: press Ctrl+C in the terminal running the API on :8000 and start it again:
   ```
   php -S 127.0.0.1:8000 -t backend/public
   ```
   If you also use XAMPP's Apache, click Stop and then Start on it too.
5. Check it worked:
   ```
   C:\xampp\php\php.exe -m | findstr /i opcache
   ```
   It should print `Zend OPcache`. If PHP prints an error about the extension instead, the
   `zend_extension` line has a typo.

## 2. sharp (done with Next.js 16)

Since the move to Next.js 16, `npm install` brings sharp along with Next, so photos are already
resized with it. `npm ls sharp` shows it under `next`.

When you deploy, run `npm ci` **on the server** so it downloads the sharp build for that
computer. Don't copy `node_modules` from Windows to a Linux server. Vercel does this for you.

## 3. A proper web server for the API

`php -S` handles one request at a time, so it is only for development. Which setup you use
depends on where the shop will run.

### A. Try it on this PC, with XAMPP's Apache

Apache handles many requests at once, and the API already has its `.htaccess` file. On Windows,
Apache runs PHP inside itself (mod_php), which does the same job as PHP-FPM.

1. Open `C:\xampp\apache\conf\extra\httpd-vhosts.conf` and add this at the end:
   ```apache
   Listen 127.0.0.1:8080
   <VirtualHost 127.0.0.1:8080>
       DocumentRoot "C:/Users/smnkh/Desktop/E-templates/E-commerce/backend/public"
       <Directory "C:/Users/smnkh/Desktop/E-templates/E-commerce/backend/public">
           AllowOverride All
           Require all granted
       </Directory>
   </VirtualHost>
   ```
2. XAMPP Control Panel → **Start** Apache.
3. Test it in the browser: `http://127.0.0.1:8080/api/v1/catalog/categories` should show JSON.
4. In `.env.local`, change `BACKEND_ORIGIN` to `http://127.0.0.1:8080`. Restart `npm run dev`,
   then stop the old `php -S` on :8000.

### B. Real production on a Linux server (recommended for going live)

1. Install nginx, PHP 8.2-FPM (`php8.2-fpm php8.2-mysql php8.2-mbstring php8.2-curl`) and
   MySQL or MariaDB.
2. Add an nginx block for the API. It stays internal, so only Next.js can reach it:
   ```nginx
   server {
       listen 127.0.0.1:8080;
       root /var/www/shopco/backend/public;
       index index.php;
       client_max_body_size 10m;
       location / { try_files $uri $uri/ /index.php?$query_string; }
       location ~ \.php$ {
           include snippets/fastcgi-php.conf;
           fastcgi_pass unix:/run/php/php8.2-fpm.sock;
       }
       location ~ /\. { deny all; }
   }
   ```
3. Run the site with `npm ci && npm run build && npm start` under pm2 or systemd. The domain's
   nginx block forwards to `http://127.0.0.1:3000`, with HTTPS from certbot. Set
   `BACKEND_ORIGIN=http://127.0.0.1:8080`.
4. Production settings:
   - `backend/.env`: `APP_ENV=production`, `APP_DEBUG=false` and an `https://` `FRONTEND_URL`.
     Secure login cookies need HTTPS.
   - In the server's `php.ini`, set `opcache.validate_timestamps=0`, then run
     `systemctl restart php8.2-fpm` after every deploy.
5. Schedule `expire_pending_orders`, `process_outbox` and `cleanup_database` with cron.

### C. Shared hosting (cPanel)

Apache with PHP-FPM is usually built in. Point a subdomain's document root at `backend/public`;
the `.htaccess` there handles the rest. Host the Next.js site with cPanel's "Node.js App" or on
Vercel, and set `BACKEND_ORIGIN` to the API's `https://` address.
