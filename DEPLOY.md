# Deploying a free live demo (Render)

This is a checklist for putting the demo online on Render's free tier. [`render.yaml`](render.yaml) describes both services; nothing is deployed until you connect the repository.

What you get: a Rails API with Action Cable (`live-canvas-api`) and a static React site (`live-canvas-web`).

Free-tier behaviour to expect:

- The API sleeps after about 15 minutes without traffic, so the first request after a pause takes up to a minute.
- The disk is ephemeral. SQLite is re-created and re-seeded on every restart, so edits made by visitors do not last. That suits a demo, and the seed resets it.
- One process only. That is what the in-process Action Cable adapter needs.

## Steps

1. Create a Render account at render.com (sign in with GitHub) and grant it access to this repository.
2. Push the repository to GitHub.
3. In Render choose **New > Blueprint**, pick this repository, and apply. Render reads `render.yaml` and creates both services.
4. Generate a secret locally and paste it as `SECRET_KEY_BASE` on `live-canvas-api` when Render asks (at least 64 characters):

   ```bash
   ruby -rsecurerandom -e 'puts SecureRandom.hex(64)'
   ```

5. Leave `CORS_ALLOWED_ORIGINS` empty for the first deploy, then copy the static site's URL (for example `https://live-canvas-web.onrender.com`, no trailing slash) into it on `live-canvas-api` and save. The service restarts.
6. If Render renamed the API (the name was taken), the real host differs from the one in `render.yaml`. Set `VITE_API_URL` (`https://<api-host>/graphql`) and `VITE_CABLE_URL` (`wss://<api-host>/cable`) on `live-canvas-web`, then **Manual Deploy > Clear build cache & deploy**. These are build-time values.
7. Open the site, click **Try the demo**, pick Ada in one window and Ben in a private window, and check that a move in one appears in the other.
8. Put the site URL in the "Live demo" line of the README.

## Environment variables

| Service | Variable | Value |
|---|---|---|
| API | `RAILS_ENV` | `production` (set in the blueprint) |
| API | `SECRET_KEY_BASE` | your generated secret, 64+ characters |
| API | `CORS_ALLOWED_ORIGINS` | the static site's origin; also the only origin allowed to open the socket |
| API | `SIGN_IN_LIMIT_PER_MINUTE` | optional, default 20 |
| Site | `VITE_API_URL` | `https://<api-host>/graphql` |
| Site | `VITE_CABLE_URL` | `wss://<api-host>/cable` |

## Not covered

- The static site gets two security headers from the blueprint. The stricter Content-Security-Policy that `npm run preview` sends (see `client/src/security/headers.ts`) is not applied on Render; add it under `headers` in `render.yaml` if you want it.
- Several API instances would need a shared Action Cable adapter, which this setup does not provide.
