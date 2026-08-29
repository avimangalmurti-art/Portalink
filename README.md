# portalinknetworks

portalinknetworks is a creator portfolio and discovery site. This repository can run in
two modes:

- A local development build can use the original in-memory design prototype by
  setting `VITE_RUNTIME_MODE=prototype`.
- A hosted build defaults to `VITE_RUNTIME_MODE=production`, requires valid
  Supabase environment variables, and uses durable accounts, profiles,
  projects, uploads, discovery, search, follows, comments, engagement, and
  notifications.

Production mode fails closed. It never falls back to fixture content when a
backend is missing, and unfinished domains return an explicit unavailable
capability instead of simulated data.

## Local development

```sh
npm install
copy .env.example .env.local
npm run dev
```

Use `cp .env.example .env.local` on macOS or Linux. A missing/placeholder
Supabase configuration intentionally keeps the app in prototype mode.

## Create the production backend

1. Create a Supabase project.
2. Apply every file in `supabase/migrations` in filename order with the Supabase
   CLI (`supabase db push`) or the dashboard SQL editor. The PDF pipeline is
   created by `202608250001_pdf_processing_pipeline.sql`.
3. Copy the project URL and **publishable** key into `.env.local` or the hosting
   provider's environment settings:

   ```env
   VITE_RUNTIME_MODE=production
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   VITE_ENABLE_ACCOUNT_DELETION=false
   ```

4. In Supabase Auth, set the Site URL and redirect URLs to the deployed domain,
   require email confirmation, configure a production SMTP provider, and enable
   CAPTCHA before a public launch.
5. Deploy account deletion, then enable its UI:

   ```sh
   supabase functions deploy delete-account
   ```

   Set `VITE_ENABLE_ACCOUNT_DELETION=true` only after that command succeeds.

6. Build and deploy the long-running PDF worker in `workers/pdf_processor`.
   Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in that worker's
   server-side secret manager. See its README for Docker and resource settings.

Never put a secret key or service-role key in a `VITE_*` variable. The browser
uses only the publishable key; the migration's Row Level Security policies
enforce access.

## Verify a release

```sh
npm run typecheck
npm run lint
npm run build
```

The Vercel and static-host fallback files in this repository route pasted URLs
back to the React application. Add the same `/* -> /index.html` rewrite when
using another static host.

## First-launch scope

The production path supports creator accounts, a default Work category,
portfolio management, private file storage with signed viewing URLs, public and
private profiles, publishing/editing/deleting projects, discovery, search,
follows, comments, likes/saves/reposts, and an inbox of activity notifications.

PDF page previews are produced asynchronously from the stored original. Direct
messaging, group chat, live audio, non-PDF media transcodes, AI generation, and
commerce are intentionally not part of this first release.
