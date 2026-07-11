# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in the WebShark Email repository.

## Project Overview

WebShark Email is a full-stack temporary email service consisting of:
- **Frontend**: Static HTML/Tailwind CSS app (`index.html`) for composing emails, managing inboxes, and viewing messages
- **Backend**: Cloudflare Worker (`worker/worker.js`) that forwards emails via MailerSend API and supports optional Cloudflare KV persistence
- **Local Development**: Node.js HTTP server (`server.js`) for local testing
- **Deployment**: GitHub Actions workflow for automated deployment to Cloudflare Pages (frontend) and Cloudflare Workers (backend)

## Development Commands

### Local Development
```bash
# Start local development server
npm start

# Server runs on http://localhost:8000
# Open this URL in browser to use the application
```

### Worker Development & Deployment
```bash
# Navigate to worker directory
cd worker

# Set up MailerSend API key (required for sending emails)
wrangler secret put MAILERSEND_API_KEY

# Optional: Configure KV namespace for persistent inbox storage
# 1. Create KV namespace in Cloudflare dashboard
# 2. Add namespace ID to wrangler.toml: id = "YOUR_NAMESPACE_ID"
# 3. Deploy worker

# Deploy worker
wrangler deploy
```

### Deployment
The repository includes GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) that automatically:
- Deploys the Cloudflare Worker from `worker/` directory
- Deploys the static frontend to Cloudflare Pages
- Triggered on pushes to `main` branch

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` 
- `CLOUDFLARE_PROJECT_NAME`

Optional: Add KV namespace ID to `worker/wrangler.toml` for persistent inbox storage.

## Code Structure

### Frontend (`index.html`)
- Single-page application using Tailwind CSS and Font Awesome
- Vanilla JavaScript for state management and API interactions
- Key components:
  - Sidebar: Inbox management (create/random inboxes, view inboxes)
  - Middle column: Message list for selected inbox
  - Main column: Message viewer/compose form
- State managed in memory (`inboxes`, `activeInboxId`, `activeMessageId` arrays/variables)
- Persists sent-mail history in `localStorage`

### Backend (`worker/worker.js`)
- Cloudflare Worker using Node.js compatibility (`nodejs_compat` flag)
- Endpoints:
  - `POST /send`: Send emails via MailerSend API (or store locally for @infin.io addresses)
  - `GET /messages?address=<email>`: Retrieve messages for an email address
  - `POST /inbound`: Webhook endpoint for inbound email simulation/storage
- Features:
  - Local preview storage for @infin.io addresses (last 50 messages)
  - Optional Cloudflare KV persistence (`INBOXES` binding)
  - MailerSend API integration for external email sending
  - Error handling with detailed JSON responses

### Local Server (`server.js`)
- Simple Node.js HTTP server serving static files
- Runs on port 8000 (configurable via PORT env var)
- Serves `index.html` as root and static assets
- Basic MIME type handling for common web assets

## Key Features

1. **Temporary Email Generation**: Create random or custom @infin.io email addresses
2. **Email Composition & Sending**: Send emails via MailerSend API (external) or store locally (for @infin.io)
3. **Inbox Management**: View, refresh, and manage multiple inboxes simultaneously
4. **Inbound Email Simulation**: Test inbound email flow with predefined templates
5. **Persistent Storage**: Optional Cloudflare KV namespace for persistent inbox storage across worker restarts
6. **Local Development**: Zero-config local server for testing and development
7. **Automated Deployment**: GitHub Actions workflow for seamless deployment to Cloudflare

## Development Guidelines

### Frontend Development
- Modify `index.html` for UI changes
- Tailwind CSS v4 via CDN - use utility classes for styling
- Font Awesome 6 for icons
- State is managed in vanilla JavaScript objects/arrays
- Local storage used for sent-mail history persistence
- All API calls go to `WORKER_URL` (configured at top of index.html)

### Worker Development
- Modify `worker/worker.js` for backend logic
- Uses Cloudflare Workers API with Node.js compatibility
- KV namespace binding available as `INBOXES` (when configured)
- Secrets must be configured via `wrangler secret put` or Cloudflare dashboard
- MailerSend API key required for external email sending (`MAILERSEND_API_KEY`)
- Follow Cloudflare Workers best practices for async handling

### Local Testing
1. Start local server: `npm start`
2. Visit `http://localhost:8000`
3. Worker requests go to deployed worker URL by default (`WORKER_URL` in index.html)
4. To test against local worker, either:
   - Modify `WORKER_URL` in index.html to point to localhost:8787 (wrangler dev)
   - Or run `wrangler dev` in worker directory and update index.html accordingly

### Deployment Process
1. Push changes to `main` branch
2. GitHub Actions automatically:
   - Deploys worker from `worker/` directory to Cloudflare Workers
   - Deploys static frontend to Cloudflare Pages
3. Manually update `WORKER_URL` in index.html if worker URL changes
4. For manual deployment:
   - Update `WORKER_URL` in index.html if needed
   - Deploy worker: `cd worker && wrangler deploy`
   - Frontend can be deployed to any static host (Cloudflare Pages, Vercel, Netlify, GitHub Pages)

## Environment Variables & Secrets

### Worker Secrets (configure via wrangler or dashboard)
- `MAILERSEND_API_KEY`: Required for sending external emails via MailerSend
- `INBOXES`: KV namespace binding ID (optional, for persistent storage)

### Local Development
- `PORT`: Optional port for local server (defaults to 8000)
- No secrets required for local development (uses deployed worker by default)

## Troubleshooting

### Common Issues
1. **Email sending fails**: Verify `MAILERSEND_API_KEY` is set in worker secrets
2. **Messages not appearing**: Check that you're connected to the correct worker URL
3. **Local development issues**: Ensure you're using `http://localhost:8000` (not file://)
4. **Worker deployment fails**: Check wrangler.toml configuration and account permissions

### Debugging
- Check browser console for frontend errors
- Worker logs available in Cloudflare dashboard
- Network tab shows API request/responses
- Local server logs show in terminal where `npm start` was run

## Architecture Notes

### Frontend-Backend Communication
- Fetch API calls to worker endpoints

### Data Flow
- **Outbound**: Frontend → Worker `/send` → MailerSend API (or local storage for @infin.io)
- **Inbound**: External service → Worker `/inbound` → Local/KV storage → Frontend polling

### State Management
- Frontend state is memory-based with localStorage persistence for sent mail

### Persistence Options
- **None (default)**: Messages lost on worker restart
- **Local storage**: Browser-level sent mail history
- **KV namespace**: Worker-level persistent inbox storage (across restarts)