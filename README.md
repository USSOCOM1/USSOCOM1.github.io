# USSOCOM website

Public site for the USSOCOM Arma Reforger milsim, plus a members-only area.

- `site/` is a static site served by GitHub Pages (no build step). It renders
  `site/data/public.json`, which **SEC WAR** (the Discord bot,
  `gunny-basilone/src/website-bot.js`) commits here whenever the roster, ops
  or server events change.
- `worker/` is a Cloudflare Worker. Members sign in with Discord; it checks
  their Discord ID against the rostered list SEC WAR uploads and serves the
  members data (full roster, ops and attendance, courses, awards, service
  records). That data never goes into this repository.

Public data shows **rank + name + seat only**: no Discord IDs or handles, no
notes, no LOA/Reserve status, no reserve block.

## One-time setup

1. **GitHub org and repo.** Create the org. Push this repo to it, then in
   Settings → Pages set Source = GitHub Actions. `.github/workflows/pages.yml`
   deploys `site/` on every push.
2. **Cloudflare Worker** (free plan), from `worker/`:
   ```
   npm install
   npx wrangler login
   npx wrangler kv namespace create MEMBERS        # put the id in wrangler.toml
   npx wrangler secret put SESSION_SECRET          # long random string
   npx wrangler secret put INGEST_SECRET           # long random string, also in the bot's .env
   npx wrangler secret put DISCORD_CLIENT_SECRET   # Discord Developer Portal -> SEC WAR app -> OAuth2
   npx wrangler deploy
   ```
   In `wrangler.toml` set `DISCORD_CLIENT_ID` (SEC WAR's application ID) and
   `ALLOWED_ORIGINS` (the Pages origin, e.g. `https://<org>.github.io`).
3. **Discord Developer Portal** → SEC WAR application → OAuth2 → Redirects:
   add `https://ussocom-members.<subdomain>.workers.dev/callback`.
4. **`site/config.js`**: set `workerUrl` to the Worker URL.
5. **SEC WAR `.env`** (then restart the bot):
   ```
   WEBSITE_GITHUB_REPO=<org>/<repo>
   WEBSITE_GITHUB_TOKEN=<fine-grained token: this repo, Contents read+write>
   WEBSITE_WORKER_URL=https://ussocom-members.<subdomain>.workers.dev
   WEBSITE_INGEST_SECRET=<same as INGEST_SECRET>
   WEBSITE_DISCORD_INVITE=https://discord.gg/<permanent invite>
   ```

## Local test

```
cd worker && cp .dev.vars.example .dev.vars && npm run dev     # Worker on :8787 (DEV_LOGIN=1)
cd site && python -m http.server 8080                         # site on :8080
node ../gunny-basilone/scripts/website-export.mjs --out <dir>  # read-only data export
curl -X PUT -H "authorization: Bearer <INGEST_SECRET>" --data-binary @<dir>/members.json localhost:8787/api/ingest
# sign in without Discord: http://localhost:8787/dev-login?id=<discord id>&return=http://localhost:8080/
```
`/dev-login` only exists when `DEV_LOGIN=1` and the request is to localhost;
it is never set in production.
