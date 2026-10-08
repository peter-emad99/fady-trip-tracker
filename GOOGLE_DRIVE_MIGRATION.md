# Google Drive Receipt Storage & Usage Monitoring

Receipts are stored in **one Google Drive account** (the "Drive owner") instead of Supabase Storage.
That account doesn't have to be yours, and it doesn't have to own the Google Cloud project; it's
whichever account approves access in step 3 below. App users never sign in to Drive themselves.
The browser never talks to Google directly — small Vercel functions in `/api` do:

| Endpoint | What it does |
| --- | --- |
| `POST /api/receipts?name=…` | Uploads an image to the `Trippy Receipts` folder (requires Supabase login) |
| `GET /api/receipts?id=…` | Streams a receipt image (used as `<img src>` and by the PDF export) |
| `DELETE /api/receipts?id=…` | Moves a receipt to the Drive trash (requires Supabase login) |
| `GET /api/usage` | Drive quota + receipts folder size, for the Usage page (admins only) |
| `GET /api/google/connect` | One-time link the Drive owner opens to approve access |
| `GET /api/google/callback` | Google sends the owner back here; shows the refresh token to copy |

Expenses store receipt URLs like `/api/receipts?id=<driveFileId>`. Old Supabase URLs keep
working and can still be deleted. Files stay **private** in Drive; the app only uses the
`drive.file` scope, so it can only see files it created.

Images are resized in the browser (max 2000px, JPEG) before upload, keeping them under
Vercel's 4.5 MB request limit.

---

## One-time setup

**Who does what:** you do steps 1, 2, 4, 5, 6 and 7. The Drive owner only does step 3, using
[docs/CONNECT_GOOGLE_DRIVE.md](docs/CONNECT_GOOGLE_DRIVE.md). Send them that file and the link.

### 1. Google Cloud OAuth client (you)

Use any Google account for this. You can reuse the Google Cloud project you already use for
Supabase Google sign-in.

1. https://console.cloud.google.com → **APIs & Services → Library** → enable **Google Drive API**.
2. **APIs & Services → OAuth consent screen** (now called *Google Auth Platform*):
   - App name: **Trippy** (the Drive owner sees this name on Google's screen)
   - **Data access → Add scopes** → `.../auth/drive.file`
   - **Audience → Publishing status → Publish app** (set to **In production**)
   > ⚠️ If it stays in "Testing", the connection expires after 7 days and uploads stop, and the Drive owner
   > would also have to be added as a test user. `drive.file` is a non-sensitive scope, so publishing
   > needs no Google review.
3. **Credentials → Create credentials → OAuth client ID** (or edit the existing web client)
   - Type: **Web application**
   - Authorized redirect URI: `https://fady-trip-tracker.vercel.app/api/google/callback`
4. Copy the **Client ID** and **Client secret**.

### 2. Add the client to Vercel and deploy (you)

Vercel → Project → Settings → Environment Variables (Production):

```bash
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
```

Do **not** prefix these with `VITE_`, because that would send the secret to the browser.
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (already set) are reused to check logins.
Then deploy (push to `main`, or Redeploy in Vercel).

### 3. Drive owner approves access (the other person)

Send them [docs/CONNECT_GOOGLE_DRIVE.md](docs/CONNECT_GOOGLE_DRIVE.md) and this link:

```
https://fady-trip-tracker.vercel.app/api/google/connect
```

They sign in with the big-storage account, click Allow, and send you the code the page shows.
The page also shows the account email and its storage, so you can both confirm it's the right account.

### 4. Add the refresh token and redeploy (you)

```bash
GOOGLE_REFRESH_TOKEN=<the code they sent>
# optional; otherwise a "Trippy Receipts" folder is found or created automatically
GOOGLE_DRIVE_FOLDER_ID=
```

Redeploy so the function picks it up.

> **Pick the account carefully.** The app can only see files it uploaded with this account's token.
> Switching to another account later means existing Drive receipts stop loading unless they're moved.

### 5. Run the database migrations (you)

In the Supabase **SQL Editor**, run these two files **in order**:

1. [`supabase/migrations/20261008000000_usage_stats.sql`](supabase/migrations/20261008000000_usage_stats.sql)
2. [`supabase/migrations/20261009000000_admin_profiles.sql`](supabase/migrations/20261009000000_admin_profiles.sql)

The second creates a `profiles` table (one row per user, filled automatically) with an `is_admin`
column, and limits the usage stats to admins.

### 6. Make yourself admin (you)

Supabase → **Table Editor → profiles** → tick **is_admin** on your row (and anyone else who should
see the Usage page). Nobody can change this from inside the app. Reload the app to see the gauge icon.

### 7. Test

- Add an expense with a receipt photo, then check the **Trippy Receipts** folder in the Drive owner's account.
- Open the receipt in the app, export the trip PDF, then delete the receipt.
- Open the **Usage** page (gauge icon). A non-admin account should not see the icon, and gets
  "Only admins can see this page" if they open `/Usage` directly.

<details>
<summary>Alternative to step 3: OAuth Playground</summary>

If you're doing it on the Drive owner's computer yourself: add `https://developers.google.com/oauthplayground`
as a redirect URI, open the playground, ⚙️ → **Use your own OAuth credentials**, authorize the scope
`https://www.googleapis.com/auth/drive.file` while signed in as the Drive owner, then
**Exchange authorization code for tokens** and copy the refresh token.
</details>

---

## Local development

`npm run dev` (plain Vite) doesn't run the `/api` functions. Either:

```bash
npx vercel dev
```

(with the env vars in `.env` / pulled via `vercel env pull`), or proxy `/api` to a deployment:

```bash
API_PROXY_TARGET=https://your-app.vercel.app npm run dev
```

---

## Usage page

The gauge icon in the top bar opens `/Usage`. It's only shown to users with `profiles.is_admin = true`,
and the database function and `/api/usage` both check the flag too. The page shows:

- **Database** — size vs the 500 MB free-plan limit, plus rows and size per table
- **Google Drive** — used vs your account quota (shared with Gmail & Photos), receipts folder size, trash size
- **Supabase Storage** — older receipts still in Supabase vs the 1 GB limit

Bars turn amber at 75% and red at 90%. Bandwidth (egress) and monthly active users aren't
available from inside the app — check those in the Supabase dashboard.

---

## Notes

- Deleted receipts go to the Drive trash (recoverable for 30 days) and still count toward the quota until the trash is emptied.
- Receipt image URLs don't need a login (they're used directly in `<img>` tags), the same as the old public Supabase bucket — but Drive file ids are long and unguessable.
- Existing receipts are **not** moved from Supabase; new uploads go to Drive. The Supabase Storage card stays on the Usage page until they are.
- The connect link can be opened by anyone, but it only shows the token for the account *they* sign in with. The app only uses `GOOGLE_REFRESH_TOKEN` from Vercel, so it's harmless.
