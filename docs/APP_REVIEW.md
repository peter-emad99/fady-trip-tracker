# Trippy app review: fixes, UX improvements and feature ideas

Review date: 2026-10-08. `[x]` = done, `[ ]` = not done yet.

## 🔴 Fix first: security and data loss

- [x] **1. Uploaded SVGs could run code (stored XSS).**
  - Uploads now accept only JPEG, PNG, WebP, HEIC and GIF.
  - Every receipt response sends `X-Content-Type-Options: nosniff`.
  - Any non-image file uploaded before this change is now downloaded instead of shown in the browser.
  - Files: `api/receipts.js`.
- [x] **2. Any Google account could use the owner's Drive.**
  - New uploads are tagged with the person who uploaded them. Only that person, or an admin, can delete them; anyone else gets "Forbidden".
  - Optional `ALLOWED_EMAILS` environment variable in Vercel (comma-separated). When it's set, only those accounts can upload, delete or organize receipts. When it's empty, nothing changes.
  - Files: `api/_lib/google.js`, `api/receipts.js`.
  - **Still open:**
    - Receipts uploaded before today have no tag, so any signed-in user who knows a file's id can still delete them, as before.
    - Anyone can still sign in to the app itself. To lock that down, set `ALLOWED_EMAILS` or turn off new sign-ups in Supabase.
- [x] **3. Deleting an expense had no confirmation, and its receipts were deleted first.**
  - There's now a confirmation dialog showing the amount, category and date.
  - The database row is deleted first. The receipts are deleted only after that succeeds.
  - You get an error message if it fails.
  - It also fixes a bug where the old single-receipt field was never cleaned up.
  - File: `src/pages/TripDetails.jsx`.
- [x] **4. Saving an expense failed silently.** It now shows a "Couldn't save the expense" message and the form stays open. File: `ExpenseForm.jsx`.
- [x] **5. Receipts were deleted immediately while editing, and uploads were left behind on Cancel.**
  - Removing a receipt that's already saved now deletes the file only after you tap **Save**.
  - Closing with unsaved changes, by tapping X or the dark background, asks "Discard changes?" with **Keep editing** and **Discard**.
  - Discarding deletes any receipts uploaded during that visit, including ones still uploading.
  - Files: `ExpenseForm.jsx`, `TripDetails.jsx`, `src/components/ConfirmDialog.jsx` (new).

## 🟠 Bugs you could see

- [x] **Over budget never turned red.** The percentage is no longer capped at 100%, so it can show e.g. "150% used" with a red bar. The trip card now says "EGP 500 over" instead of "-EGP 500 remaining". Files: `TripCard.jsx`, `TripDetails.jsx`.
- [x] **The Dashboard flashed "No trips found" while loading.**
  - It now shows the loading skeleton until both trips and expenses have loaded.
  - It shows a "Couldn't load your trips / Try again" message on error.
  - It says "No matching trips" when a search finds nothing.
  - File: `Dashboard.jsx`.
- [x] **Category messages never appeared.** They used the `sonner` toast library, which the app doesn't display; they now use the app's toast. Rename and delete also show an error if they fail. File: `CategoryManager.jsx`.
- [x] **Wrong default date after midnight.** It used the UTC date; it now uses your local date. File: `ExpenseForm.jsx`.
- [x] **Renaming a category disconnected old expenses.** Renaming now also updates your expenses that used the old name.
- [x] **Deleting a trip left its receipts and folders in Drive.**
  - Its receipts are now deleted after the trip is deleted.
  - Empty expense folders and then empty trip folders are removed from Drive.
  - It goes back to the trip list without a full page reload.
- [x] **Small fix found along the way:** after you save an expense, the Dashboard totals now refresh. Before, only that trip's expense list refreshed.

## 🟡 UI/UX improvements (waiting for your go-ahead)

- [ ] Bigger tap targets: the expense "…" menu, budget edit/delete icons, category icons and the receipt link are 24–32px. Aim for 44px.
- [ ] Notch and home-bar spacing: add `viewport-fit=cover` to `index.html` and safe-area padding to the add button and the form's bottom bar.
- [ ] Expense form ergonomics:
  - Don't pop up the keyboard immediately.
  - Use `inputMode="decimal"` on the amount so the number pad shows.
  - Let the budget picker be cleared once set.
  - Link each label to its field (`htmlFor`), and make Escape close the form.
- [ ] Replace the remaining browser `confirm()`/`alert()` popups with the in-app dialog: budget delete/add and category delete. Trip and expense delete are done.
- [ ] Navigation:
  - Add labels to the nav icons.
  - Confirm before signing out.
  - Make the Budget card on the trip page look tappable, since it's the only way to sub-budgets.
  - Fix the button nested inside a link.
- [ ] One shared `formatMoney()` helper for consistent amounts (the list, cards, chart and PDF each format differently).
- [ ] Make sure the three stat cards fit on small phones with large amounts.
- [ ] PDF export with Arabic text: the default font has no Arabic letters, so embed one.
- [ ] Dark mode: the colour tokens exist, but components use fixed colours. Switch them to the tokens and add a toggle.
- [ ] Consistent wording: Left / Remaining / Available / Used / Spent.
- [ ] Performance:
  - Lazy-load pages so the chart and PDF libraries load only when needed.
  - Stop the Dashboard downloading every expense just to add up totals.
  - Use optimistic updates.
- [ ] Cleanup:
  - Remove unused files: `Home.jsx`, `TripExport.jsx`, `UserNotRegisteredError.jsx`, unused ui components.
  - Remove unused packages: stripe, three, react-leaflet, react-quill, moment, @hello-pangea/dnd, html2canvas.
  - Remove the leftover setup scripts in the project root.
- [ ] Filters: remember them, and show the total for the filtered expenses.
- [ ] Smaller items:
  - An edited sub-budget can exceed the trip budget (only new ones are checked).
  - Budget views don't refresh after you save an expense.
  - Editing a trip rewrites its owner (`user_id`).

## 💡 Feature ideas (waiting for your go-ahead)

- [ ] **Split and settle-up (who owes whom):** a list of travelers per trip, "paid by" and "split between" on each expense, and a settle-up summary. It builds on the existing `assigned_to` field.
- [ ] **Daily allowance:** "X EGP/day left" plus a spend-per-day chart, using the trip's start and end dates.
- [ ] **Read the amount and date from receipts (OCR)** after scanning, and pre-fill the expense form.
- [ ] **Budget alerts:** automatically link categories to sub-budgets, and warn at 80% and 100%.
- [ ] **CSV/Excel export for everyone,** reusing the CSV code from the admin backup.
- [ ] **Undo on delete:** an "Expense deleted · Undo" message.
- [ ] **Multi-currency:** a currency and exchange rate per expense, with a converted total.
- [ ] **Trip sharing** with other travelers. This goes well with split and settle-up.
- [ ] **Add expenses offline** and sync them later. The app already has a service worker.
- [ ] **Search across all trips,** not just trip names.
