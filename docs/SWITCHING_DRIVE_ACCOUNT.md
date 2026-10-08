# Switching the Google Drive account (plan, not built)

**Status:** not needed now. Keep the current Drive account. This is what to build if we ever
have to move receipts to a different Google account.

## Why a simple swap doesn't work

Receipts are stored on expenses as links like `/api/receipts?id=<driveFileId>`, and the server reads
them with the refresh token in `GOOGLE_REFRESH_TOKEN`. If that token is replaced with another account's:

- **Old receipts stop loading.** The app uses the `drive.file` scope, so a token can only open files that
  the app created *with that account's grant*. The new account's token can't see the old files.
- **Moving files by hand doesn't help.**
  - Copying files to the new account gives them **new IDs**, so every saved link breaks.
  - Transferring ownership keeps the IDs, but the new token still has no `drive.file` access to them.
- **New uploads** would go to the new account and work fine. Only the old ones break.

So switching needs a copy step that updates every expense's links, like the Supabase → Drive
"Copy to Google Drive" button.

## Plan

### 1. Keep both accounts connected for a while

- Keep the current token, renamed to `GOOGLE_OLD_REFRESH_TOKEN`.
- Connect the new account with `/api/google/connect` and put its token in `GOOGLE_REFRESH_TOKEN`.
- In `api/_lib/google.js`, keep a second cached access token for the old account. `driveFetch` takes an
  `account: 'old' | 'current'` option.

### 2. Keep old links working during the move

- `GET /api/receipts?id=…` tries the current account first. On a 404, it falls back to the old account
  when `GOOGLE_OLD_REFRESH_TOKEN` is set.
- This way nothing is broken while the copy runs, and the copy can be stopped and resumed.

### 3. "Copy from old Drive" button (Usage page, admin only)

This works like `LegacyReceiptMigration` and `migrateLegacyReceipt` in `src/api/receiptStorage.js`.

For each Drive receipt link on every expense:

1. Check whether the file belongs to the old account (a server endpoint looks it up with each token).
2. Download it from the old account and upload it to the new one. This needs a server endpoint such as
   `POST /api/receipts/copy-from-old?id=…`. Drive-to-Drive happens server-side, so the 4.5 MB browser
   upload limit doesn't apply.
3. Verify the new copy: same size, and downloadable.
4. Replace the link on the expense. Use the existing `replace_receipt_url` SQL function; it already
   works for Drive → Drive links.
5. File the copy into its trip/expense folder (`organizeReceipts`).
6. **Don't delete anything from the old account.**

It's safe to run again: it only picks up links that still resolve to the old account. Show progress, and
list failures at the end.

Finding the remaining links needs a small admin-only SQL function, like `list_legacy_receipts`, that
returns every `(expense_id, url)` where the url starts with `/api/receipts?id=`. The endpoint then checks
which of those are still in the old account.

### 4. Before and after

- **Before:** download a backup from the Usage page (**Receipts backup → Download**).
- **After:** check the Usage page:
  - the **Account** row shows the new account;
  - the old account's Trippy folder count stops dropping;
  - receipts open in the app and the PDF export works.
- Remove `GOOGLE_OLD_REFRESH_TOKEN` (and the fallback in step 2) only after everything is verified.
  Keep the old account's files until you're sure.

## Rough effort

About half a day: two tokens in `google.js`, the fallback in `GET /api/receipts`, a copy endpoint,
one SQL function, and a Usage-page component modelled on `LegacyReceiptMigration.jsx`.
