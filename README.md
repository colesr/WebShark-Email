# WebShark Email

This repo contains the WebShark Email frontend and a Cloudflare Worker backend.

## What’s included

- `index.html` — static UI for composing email, managing inboxes, and viewing messages
- `worker/worker.js` — Cloudflare Worker API that forwards email to MailerSend
- `worker/wrangler.toml` — worker deployment configuration
- `server.js` — local development server for `http://localhost:8000`
- `package.json` — script to start the local server

## Local development

1. Run the local server:

```bash
cd /Users/samuelcole/Documents/CodingProjects/WebShark-Email
npm start
```

2. Open:

```text
http://localhost:8000
```

> Do not use `file:///` in the browser. The app requires a proper HTTP origin.

## Deploy the worker

From the `worker` directory:

```bash
cd /Users/samuelcole/Documents/CodingProjects/WebShark-Email/worker
wrangler secret put MAILERSEND_API_KEY
wrangler deploy
```

If you want to use a different worker URL, update `WORKER_URL` in `index.html`.

### Optional persistent inbox storage

The worker now supports an optional Cloudflare KV namespace for persistent inbox storage.

1. Create a KV namespace in your Cloudflare account.
2. Add it to `worker/wrangler.toml` by replacing `REPLACE_WITH_KV_NAMESPACE_ID` with your namespace ID.
3. Deploy the worker again.

When bound, local `@infin.io` inboxes will persist messages across worker restarts.

## Host as a real web app

This frontend can be hosted as a real static app with Cloudflare Pages, Vercel, Netlify, GitHub Pages, or any static file host.

### Cloudflare Pages (recommended)

1. Push the `WebShark-Email` folder to a Git branch.
2. Create a Cloudflare Pages site and connect it to that repo.
3. Set the build command to `npm install` and the build output directory to `.`.
4. Deploy the Pages site.
5. Update `WORKER_URL` in `index.html` to your deployed worker URL.

Current deployed public frontend:

- `https://webshark-email.pages.dev`
- `https://webshark-email-send.cole-colesr-sam.workers.dev`

### Automatic deploy with GitHub Actions

This repo includes a workflow at `.github/workflows/deploy-pages.yml` that deploys both the Cloudflare Worker and the static frontend on pushes to `main`.

Add these repository secrets in GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME`

Then push to `main` and the deployment workflow will run.

### Deploy worker + frontend together

This repo now supports a single GitHub Actions workflow that deploys the worker from `worker/` and the frontend from the repository root.

1. Create a Cloudflare Pages project for the repo.
2. Add the GitHub secrets listed above.
3. Optionally create a KV namespace and set its ID in `worker/wrangler.toml`.
4. Push to `main`.

After deployment, update `WORKER_URL` in `index.html` if your deployed worker URL differs from the current value.

If you need the worker and Pages to live under the same account, the workflow will publish both automatically.

### Inbound email support

The worker now supports a webhook-style inbound endpoint at `POST /inbound`.

Use this endpoint with your inbound email provider or a custom webhook to store incoming messages into `@infin.io` inboxes.

Example payload:

```json
{
  "to": "example@infin.io",
  "from": "friend@example.com",
  "subject": "Hello from inbound email",
  "body": "This message arrived through the inbound webhook."
}
```

You can also test inbound flow directly from the app with the **Simulate inbound email** button in the inbox header.

### Alternative hosts

- Vercel: deploy the folder with zero config; update `WORKER_URL` after deployment.
- Netlify: drop the folder into a new site; update `WORKER_URL` after deployment.
- GitHub Pages: use the repo root and open `index.html` from the branch.

## Production notes

- Use a real MailerSend verified sender domain in `worker/worker.js`.
- Do not hardcode secrets in code; use Cloudflare secret store instead.
- Confirm the worker secret name is `MAILERSEND_API_KEY`.

## Improvements included

- send button disables while email is being sent
- compose message status text with live send feedback
- toast notifications for success/error/info
- recent sent-mail history stored in `localStorage`
- email inbox simulator and message viewer
- local HTTP server for `http://localhost:8000`
