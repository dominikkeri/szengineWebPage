# SZEngine – Testbench Control V5

**V5 update: [V5_FRISSITES.md](V5_FRISSITES.md).** Apply `003_skip_and_fault_issue.sql` after migrations 001 and 002. V4 history is retained.

**React + TypeScript + Vite | Supabase Auth + PostgreSQL + Realtime | GitHub Pages**

Prototype for documenting and monitoring the SZEngine engine testbench. UI language: Hungarian. The application follows the attached flowchart: Login → main page (bench status) → error reporting / checklists, with an administrator-only member-management view.

## What is included?

- Login required to access the dashboard; no anonymous database reads.
- Admin (`admin`): create users, assign roles, disable accounts and use all operator functions.
- Operator (`operator`): set non-running idle/maintenance/fault state when no workflow is open, open/update issues, complete the run workflow.
- Viewer (`viewer`): read-only dashboard, issues and checklists.
- Bench state: stopped / running / maintenance / fault, optional note, change history, actual recorded time of last shutdown.
- Live refresh through Supabase Realtime + a secure fetch. Counts and elapsed time update in the UI.
- Issue tracker: title, description, priority, open/in-progress/done, optional estimated fix date.
- Paired pre-start and shutdown checklists: one open engine run, validated stage transitions, check-by-user/time, immutable per-run snapshots, admin-editable templates and searchable run history.
- Responsive desktop/mobile interface.
- Local demo without Supabase; sample data resets on page reload.
- GitHub Actions workflow for GitHub Pages.

**Important:** React/GitHub Pages alone cannot execute SQL or securely manage users. Real data and authentication run on Supabase. GitHub hosts only the static React build. No service-role key, secret token or password must ever appear in the React source, `.env`, or GitHub Pages configuration. The `VITE_SUPABASE_ANON_KEY` is a public client key; PostgreSQL RLS enforces authorization.

## 1. Preview locally without a backend

Install Node.js 20.19+ or 22.12+ and open a terminal in this directory:

```bash
npm install
npm run dev
```

Open the local address displayed by Vite, typically `http://localhost:5173`.

Demo logins:

| Username | Password | Role |
|---|---|---|
| `dominik` | `Demo12345!` | Admin |
| `operator` | `Demo12345!` | Operator |
| `megfigyelo` | `Demo12345!` | Viewer |

**The demo is not real authentication or persistence**, and cannot securely serve the team. The local demo only exists so you can examine the UI immediately. Do **not** deploy an unconfigured demo to production as if it were a secure system.

## 2. Configure a real SQL database

1. Create a Supabase project at <https://supabase.com> (Free plan where available).
2. In **SQL Editor**, for a new project run `supabase/migrations/001_initial.sql` once, then `supabase/migrations/002_journey_workflow.sql` once. Then run `supabase/migrations/003_skip_and_fault_issue.sql` once. For V3 run 002 then 003, with the old bench stopped. For V4 run only 003. See V5_FRISSITES.md.
3. In **Authentication → Users**, add the very first user with a real email and strong password. If creating by email invitation, complete confirmation before logging in. This automatically creates a row in `public.profiles`.
4. In **SQL Editor**, promote that user's profile to admin (replace email with the **actual email** you just registered):

```sql
update public.profiles
set username = 'dominik', role = 'admin'
where lower(email) = lower('YOUR_REAL_ADMIN_EMAIL@example.com');
```

5. **Disable public self-registration** in Supabase Authentication settings (`Allow new users to sign up` / `Enable signups` = disabled). After that, only existing admins can create team users through the Edge Function. Keep email/password authentication enabled.
6. In **Project Settings → API** get the Project URL and the client-side publishable/anon key. Create `.env.local` at the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

The `service_role`/secret key must **never** be added to any `VITE_` variable. It is read only in Supabase Edge Functions via the platform's server-side environment.

### 3. Deploy the two Edge Functions (required)

Install or run the Supabase CLI and authenticate (commands follow the official Supabase CLI flow):

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_ID
npx supabase functions deploy username-login --no-verify-jwt
npx supabase functions deploy admin-create-user --no-verify-jwt
```

Both endpoints are deployed with `verify_jwt=false` because the login endpoint must be publicly reachable, and the admin endpoint checks the caller's Supabase access token **inside the function** before doing any privileged operation. The admin function requires a real active admin in `public.profiles`. Do not remove the manual permission check.

> Some Supabase CLI versions require running `npx supabase ...` from the directory containing `supabase/config.toml` (this project root). On newer Supabase projects, confirm the platform still provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. If not, provision the corresponding values as **Supabase Edge Function secrets**, never in React.

Now restart:

```bash
npm run dev
```

Sign in as `dominik` using the **password selected in Supabase Authentication**, not the demonstration password. All later users are created via the administrator's **Jogosultságok → Új felhasználó** tab. To support username-based login, the admin supplies a unique username, a real email address as the Supabase Auth identity, and a strong initial password (10+ characters). The application login form accepts **username + password**; no public email lookup is exposed.

### Why not a four-digit PIN?

A short PIN is unsafe for a public website. Use a longer password or access code (10+ characters), even if the team internally calls it a PIN. Supabase Auth handles salted password hashes and rate limits. The team administrator cannot view existing passwords; they can create accounts with initial passwords. Add a password reset workflow before a full production rollout.

## 4. Publish for free with GitHub Pages

1. Create a GitHub repository and upload the **project contents**, including `.github/workflows/deploy.yml`. Do not upload `.env.local`.
2. Under GitHub **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`: the Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY`: the public anon/publishable key (not the secret key).
3. Go to **Settings → Pages**, choose **GitHub Actions** as the build/deploy source.
4. Push to the **main** branch. The existing workflow installs Node dependencies, builds the React app and publishes `dist/`.
5. The URL will typically be `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`. Vite detects the repository base path automatically. For a custom domain, set the GitHub Actions variable `VITE_BASE_PATH` to `/`.

The source repository can be public as long as it contains **no passwords, service keys or secret URLs**. The app and its private database are separate; an unauthenticated user cannot read Postgres data due to RLS.

## Database overview

```text
auth.users (Supabase-managed, email + hashed password)
   └─ profiles (username, role, enabled)
bench_state (single current-state row)
   ├─ bench_runs (actual start/end of engine operation)
   └─ status_events (audit log of changes)
issues (status / priority / description / estimated date)
workflow_templates (two editable JSONB templates, revisions)
workflow_runs (paired pre-start and shutdown snapshots, setup, stage, timestamps)
legacy checklist_items / checklist_runs / checklist_run_items (retained; old writes disabled)
```

**Production changes to consider:** periodic SQL backups; additional account lockout or rate limits for username endpoint; forced password change and reset; a formal incident audit trail; approval of actual checklist text; per-test-run structured measurements; automatic machine status via a secured NI/MaxxECU gateway (not implemented yet). This prototype's state is **manually changed by an operator**; it does not connect to sensors, LabVIEW, NI or a CAN bus, and therefore does not report real hardware telemetry yet.

## Note on Supabase Free

As of November 2026, an inactive Supabase Free project can be paused after roughly one week with insufficient activity. For safety-critical or continuous operations, use a paid/managed backend with monitoring and backup planning; do not rely on free-tier availability. **This web app is for documentation and situational awareness, never for safety interlocks or remote actuation.**

## Project files

- `src/App.tsx` – complete React interface and navigation.
- `src/styles.css` – light SZEngine design / responsive styling.
- `src/Workflow.tsx` – paired run workflow, run history, admin checklist editor.
- `supabase/migrations/002_journey_workflow.sql` – V4 migration.
- `src/lib/backend.ts` – live Supabase data layer and local demo mode.
- `src/lib/types.ts` – TypeScript domain types.
- `supabase/migrations/001_initial.sql` – PostgreSQL schema, roles, RLS and RPC functions.
- `supabase/functions/username-login/index.ts` – secure username-to-Supabase-Auth login.
- `supabase/functions/admin-create-user/index.ts` – server-authorized account creation.
- `.github/workflows/deploy.yml` – GitHub Pages deploy workflow.

## Verify / local build

```bash
npm run typecheck
npm run build
npm run preview
```
