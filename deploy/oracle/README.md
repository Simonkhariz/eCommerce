# Shop.co on Oracle Cloud's free server (always on, ₦0)

The shop runs 24/7 on one free Oracle Cloud server, even when your PC is off, at a fixed free
address `https://<server-ip>.sslip.io` (no domain needed; add one later). Pictures stay in your
Cloudflare R2 bucket. About an hour the first time, most of it waiting.

| On the server | What it does |
|---|---|
| nginx + Let's Encrypt | The https address; the certificate renews itself |
| Next.js storefront (`shopco-web` service) | The shop and admin pages; restarts itself, starts at boot |
| PHP API (PHP-FPM, OPcache) | Orders, payments, admin; reachable only from the server itself |
| MariaDB | The database |
| Scheduled jobs (`/etc/cron.d/shopco`) | Emails every minute, unpaid orders every 10 minutes, daily database check, nightly backup copied to R2 |

## Before you start: what "free" means here

- **Oracle may take back idle free servers**: if CPU, network **and** memory all stay under 20%
  for 7 days. A quiet shop uses little CPU and network, so memory decides. The whole shop should
  use roughly 700–1000 MB with nobody visiting (an estimate until measured on the server). That
  is why this server has **3 GB**, not the free maximum: about 23–33% instead of about 6–8% on
  12 GB. Step 8 measures the real figure.
- **Oracle can change its free offer.** In August 2026 it cut the free allowance and switched off
  servers above the new limit. So: the database is copied to R2 every night (step 7), and
  rebuilding on a new server takes about an hour ("If the server is lost", below).
- Sign-up needs a card for verification, and some cards are refused. Always Free resources are
  not charged; keep to shapes marked "Always Free-eligible".
- Read Oracle's free-tier terms at sign-up (commercial use).

## 1. Oracle account

1. Go to **cloud.oracle.com** → **Sign up** (Free Tier).
2. **Home region**: pick **Germany Central (Frankfurt)**, or **UK South (London)**. It cannot be
   changed later. If you use Upstash Redis, its database must be in the same city (AWS Frankfurt,
   AWS London): `docs/REDIS.md`. Both have several availability domains to try if one is out of
   capacity; Johannesburg has one.
3. Finish the card check and wait for the "account ready" email.

## 2. An SSH key (on your PC, once)

In PowerShell:

```powershell
New-Item -ItemType Directory -Force $HOME\.ssh | Out-Null
ssh-keygen -t ed25519 -f $HOME\.ssh\oracle_shopco
```

Press Enter twice (no passphrase), or set one if you prefer. This makes two files: `oracle_shopco`
(private: never share it) and `oracle_shopco.pub` (public: Oracle gets this one).

## 3. Create the server

Oracle console → **Compute** → **Instances** → **Create instance**:

1. **Name**: `shopco`.
2. **Image**: **Change image** → **Canonical Ubuntu** → **24.04** (the build for **aarch64**).
3. **Shape**: **Change shape** → **Ampere** → **VM.Standard.A1.Flex** → **1 OCPU**, **3 GB**
   memory (more makes the server look idle; see above). It must show "Always Free-eligible".
4. **Networking**: keep the new virtual cloud network; **Assign a public IPv4 address**: yes.
5. **Add SSH keys**: **Upload public key files** → `oracle_shopco.pub` from step 2.
6. **Boot volume**: **Specify a custom size** → **50 GB**.
7. **Create**. When it shows **Running**, copy its **Public IP address** (for example
   `129.151.10.20`).

"Out of capacity"? Try another **Availability domain** in step 3, or again a few hours later.

**Open the web ports:** on the instance page → the **Subnet** link → **Security** (or "Security
Lists") → **Default Security List** → **Add Ingress Rules**, twice:

| Source CIDR | IP protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(The server's own firewall is opened by the setup script.)

## 4. New R2 keys (the old ones appeared in a chat)

Cloudflare → **R2** → **Manage API tokens** → **Create Account API token**, twice:

| Token name | Permission | Bucket | Goes in |
|---|---|---|---|
| `shopco-server` | Object Read & Write | `shopco-media` only | the setup script asks for it (step 6) |
| `shopco-pc` | Object Read & Write | `shopco-media` only | `backend/.env` on your PC (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) |

Copy each Access Key ID and Secret straight into its place (the secret is shown once). Then
**delete the old token `shopco-media-shop`**, restart the API on your PC, and check that the
pictures still show there.

**One bucket, two shops:** your PC and the server use the same pictures. In admin → Data &
storage, **don't remove "unused" pictures on either copy**: a picture unused on one copy can be in
use on the other.

## 5. Upload the shop (on your PC)

Commit your work first (only committed code is uploaded). In PowerShell, in the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\oracle\upload.ps1 -Ip 129.151.10.20 -WithDatabase
```

(Use your IP.) This packages the code and a fresh backup of your PC's shop database (products,
settings, admin accounts, test orders), uploads both, and prints the next command. XAMPP's MySQL
must be running.

## 6. Set up the server (one command, about 15 minutes)

Run the "First time" command that step 5 printed. It looks like:

```powershell
ssh -t -i "$HOME\.ssh\oracle_shopco" ubuntu@129.151.10.20 "sudo bash ~/shopco-setup/deploy/oracle/setup.sh 129.151.10.20 ~/shopco.tar.gz ~/shopco-backup/2026-11-02_093000"
```

Type `yes` if SSH asks to trust the server. Partway through it asks for:

- the R2 endpoint (`https://<account id>.r2.cloudflarestorage.com`, as on your PC);
- the bucket name (Enter for `shopco-media`);
- the `shopco-server` Access Key ID and Secret (the secret is hidden as you type);
- the shop's WhatsApp number for payments (for example `2348012345678`);
- optionally, the Upstash **TCP** address (`rediss://default:...`, hidden as you type). Enter skips
  it; the shop then uses its file cache, which is fine on one server.

At the end it prints the shop's address, for example **https://129-151-10-20.sslip.io**, and the
memory in use. Open it on your phone using mobile data.

The script is safe to run again: it never overwrites the database or changes the passwords it
made.

**What clients will see in this demo:**
- Payment is by WhatsApp transfer only ("Pay now" appears once Monnify/Kora keys are added).
- Emails are written to a log, not sent (until Resend is set up, `docs/EMAIL_SETUP.md`).
- Admin passwords are those of your PC's shop. The admin page is public, so use strong ones.

## 7. Uptime alerts (free, 5 minutes)

**uptimerobot.com** → free account → **New monitor** → **HTTPS** → URL
`https://<your address>/api/v1/health` → every **5 minutes** → your email. You get an email if
the shop goes down.

The nightly backup (02:30 server time, which is UTC: 03:30 in Lagos) is copied to R2 under
**`backups/<date>/`**. Check after the first night: Cloudflare → R2 → `shopco-media` →
`backups/`. Old backups are never deleted automatically; remove old ones there yourself when you
choose.

## 8. Check it stays out of "idle" (after a few days)

```powershell
ssh -i "$HOME\.ssh\oracle_shopco" ubuntu@129.151.10.20 "free -m"
```

"used" should be above about 615 MB (20% of 3 GB). Oracle's view: instance page → **Metrics** →
memory utilization. If it is under 20%, lower the memory: instance page → **Edit** → **Shape** →
2 GB (the server restarts and the shop comes back by itself). The 2 GB of swap covers builds.

Optional: upgrading the account to **Pay As You Go** (Oracle console → Billing → Upgrade) is
commonly reported to stop idle reclaiming. You still pay nothing within the free allowance, but a
mistake outside it would be charged. Check Oracle's current terms before doing it.

## Updating the shop later

Commit on your PC, then:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\oracle\upload.ps1 -Ip 129.151.10.20
```

and run the "Update" command it prints. The server's database and settings are kept; database
changes are applied. Pages can fail while the storefront rebuilds (a few minutes), so don't update
during a client demo. Settings live in `/var/www/shopco/backend/.env`
(`sudo nano` it, then `sudo systemctl restart php8.3-fpm`).

## No backup? Starting with an empty shop

Leave out `-WithDatabase` in step 5 and the backup folder in step 6: the server starts with the
sample catalogue and no administrator. For safety, the public address never offers the setup page,
so create the first administrator through a private tunnel from your PC:

```powershell
ssh -i "$HOME\.ssh\oracle_shopco" -L 3000:127.0.0.1:3000 ubuntu@129.151.10.20
```

Keep that window open, open **http://localhost:3000/admin/setup** on your PC, fill it in, then
close the window and sign in at `https://<your address>/admin`.

## If the server is lost

1. Create a new server (steps 3 and the ingress rules).
2. Cloudflare → R2 → `shopco-media` → `backups/` → the newest folder → download its
   `database.sql.gz` and `manifest.json` into a folder named like the date, for example
   `C:\shopco-restore\2026-11-20_023000\`.
3. Upload it: `ssh -i "$HOME\.ssh\oracle_shopco" ubuntu@<new ip> "mkdir -p ~/shopco-backup"`, then
   `scp -i "$HOME\.ssh\oracle_shopco" -r C:\shopco-restore\2026-11-20_023000 ubuntu@<new ip>:~/shopco-backup/`
4. Steps 5 (without `-WithDatabase`) and 6, adding `~/shopco-backup/2026-11-20_023000` at the end
   of the setup command. Orders since that night's backup are lost.

## Troubleshooting

| Problem | Look at |
|---|---|
| Address doesn't load | Ingress rules (step 3); `sudo systemctl status nginx shopco-web` |
| "502 Bad Gateway" | The storefront stopped: `sudo journalctl -u shopco-web -n 50` |
| Errors inside the shop | `/var/www/shopco/backend/storage/logs/` and admin → System status |
| No pictures | R2 keys in `backend/.env`; admin → System status → storage should say `s3 · writable` |
| Scheduled jobs | `/var/www/shopco/backend/storage/logs/jobs.log` |
