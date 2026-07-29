Deploy & WordPress install instructions

1) Create a ZIP of the theme (for WP Admin upload)

On your machine, from the repo root run:

```bash
chmod +x create_theme_zip.sh
./create_theme_zip.sh
```

This creates `pepx-research-chemicals-theme.zip`. Upload that in WP Admin > Appearance > Themes > Upload Theme.

2) Manual install into an existing WordPress site (via SSH)

Copy the theme folder into `wp-content/themes/` on your WordPress install and activate it:

```bash
# from the machine that can access the WP host
scp -r wordpress-theme/pepx-research-chemicals user@host:/path/to/wordpress/wp-content/themes/
# then SSH in and activate with WP-CLI
ssh user@host
wp theme activate pepx-research-chemicals
```

3) Push this repository to GitHub (if you want a hosted repo)

If this workspace is already a git repo with a remote, run:

```bash
# create a branch and push
chmod +x deploy.sh
./deploy.sh deploy-site
```

If you need to create a new GitHub repo and push:

```bash
# create repo with gh (GitHub CLI)
gh repo create <owner>/<repo-name> --public --source=. --remote=origin
# or create on github.com and then push
git remote add origin git@github.com:<owner>/<repo>.git
chmod +x deploy.sh
./deploy.sh deploy-site origin
```

Notes & limitations
- I can't push from this environment because outbound network/Git operations are restricted here. Use the above commands on your machine or a server with git/gh access.
- For production, copy `styles.css` and `script.js` directly into the theme `assets/` folder and update `functions.php` to use `get_stylesheet_directory_uri()` for stable asset hosting.
- If you are deploying the Express app with EasyPost shipping enabled, set `EASYPOST_API_KEY`, `EASYPOST_WEBHOOK_SECRET`, and the `SHIP_FROM_*` variables before running migrations.
- Register the production webhook URL at `/api/webhooks/easypost` in EasyPost before switching the app to production mode.
- Run `npm run migrate` against the production database before exposing the admin shipping actions.

If you want, tell me the Git remote URL and I can prepare a PR patch (local changes are already in the workspace). If you give me permission to run commands from your machine or provide CI credentials, I can help script automated deployment instead.
