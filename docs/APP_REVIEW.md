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

## 🟡 UI/UX improvements

- [x] **Bigger tap targets.**
  - Buttons are now 40px by default (36px small).
  - The expense "…" menu, sub-budget edit/delete, category buttons, receipt remove (✕) and the "Receipt" link all have larger touch areas.
- [x] **Notch and home-bar spacing.**
  - `viewport-fit=cover` is on.
  - The nav, page, add button (+), expense form header and Save bar all leave room for the notch and home bar.
  - Pages use `dvh` height units.
- [x] **Expense form.**
  - The amount field opens the decimal keypad and accepts "1,250" and Arabic digits (١٢٣).
  - The keyboard no longer pops up on phones when the form opens.
  - Clear error messages: "Enter an amount", "Enter a number…", "The amount must be more than 0".
  - The sub-budget can be set back to "None".
  - Every label is linked to its field.
  - Escape closes the form, asking first if there are unsaved changes.
  - Screen readers announce it as a dialog.
- [x] **No more browser popups.** Every `confirm()`/`alert()` is replaced with the in-app dialog or an inline message: trip, expense, sub-budget, category and sign-out.
- [x] **Navigation.**
  - Nav items have labels (visible from tablet width up, spoken by screen readers everywhere).
  - A new **Account** menu has your email, the theme setting and **Sign out**, which asks for confirmation.
  - The Budget card shows a › arrow and "Sub-budgets".
  - The button nested inside a link is fixed.
- [x] **One money format** (`src/lib/format.js`): "EGP 1,250" or "EGP 1,250.50" everywhere, including cards, the list, chart, PDF and sub-budgets. Dates are read as local dates, not UTC.
- [x] **Stat cards fit small phones.** Smaller text and padding on phones. "Remaining" changes to "Over budget" when you've overspent.
- [x] **PDF with Arabic.** When a trip has Arabic text, IBM Plex Sans Arabic (in `public/fonts`) is embedded, so Arabic prints correctly. Checked visually.
- [x] **Dark mode.**
  - Light / Dark / System setting in the Account menu, remembered on the device.
  - The app's colours flip automatically in dark mode (`src/index.css` and `tailwind.config.js`).
  - The status-bar colour follows the theme.
  - The receipt scanner keeps its own dark look.
- [x] **Consistent wording.**
  - "Spent" and "Remaining" everywhere.
  - "Unallocated" or "Over-allocated" on the sub-budget page.
  - Trip status badges: "On track", "Nearly spent", "Over budget".
- [x] **Performance.**
  - Pages, the chart and the PDF library load only when needed.
  - The Dashboard fetches just `trip_id` and `cost` for its totals.
  - Deleting an expense removes it from the list instantly.
  - Receipt images load lazily.
- [x] **Cleanup.**
  - Removed unused pages and components: `Home.jsx`, `TripExport.jsx`, `UserNotRegisteredError.jsx`, the no-op stubs, and 33 unused ui components.
  - Removed 37 unused packages.
  - Removed the leftover setup scripts.
- [x] **Filters.**
  - Remembered per trip on this device.
  - There's a "3 of 10 expenses · Filtered total EGP …" line, or "N expenses · Total" when nothing is filtered.
- [x] **Smaller fixes.**
  - Editing a sub-budget can't exceed the trip budget; the dialog shows the maximum.
  - Sub-budget pages refresh after you save or delete an expense.
  - Editing a trip no longer rewrites its owner.
  - Clearer loading and error screens for trips.

## 📱 Phone-first pass

Every screen was checked at 375px and 320px wide (no sideways scrolling), in light and dark mode.

- [x] **Dialogs become bottom sheets on phones.**
  - They slide up from the bottom with a grab handle and respect the home bar.
  - They no longer pop the keyboard open by themselves.
  - Big ✕ button, and full-width Cancel / confirm buttons.
  - Confirmations (delete, sign out) use the same sheet.
- [x] **Touch sizes and feel.**
  - Text fields, dropdowns and buttons are 44px tall on phones; menu items are taller too.
  - No grey flash on tap, no double-tap delay, and no rubber-band scrolling of the whole page.
- [x] **Dashboard.** "My Trips" and **+ New** share one row. Categories and Export all move into a ⋯ menu on phones. New trips start today by default.
- [x] **Trip page.**
  - Edit, Export and Delete move into a ⋯ menu beside the title on phones.
  - Search and Filters share one row, with a count badge on Filters.
  - The list starts much higher on the screen.
- [x] **Expense list.**
  - Grouped by day, with each day's total in a header that stays pinned while scrolling.
  - Tap anywhere on an expense to open it.
  - Each category has its own colour.
  - The amount sits on the top line, so notes get the full width (Arabic notes align right).
  - Two-column filter panel.
- [x] **Expense form.**
  - Compact three-column category chips with colour dots.
  - Receipts moved up, right after the category.
  - **Today / Yesterday** shortcuts for the date.
  - One-tap name chips for "Assigned to" (names already used on the trip).
  - A **Delete** button next to Save, with Undo afterwards.
  - The page behind no longer scrolls while the form is open.
- [x] **Small fixes.**
  - Shorter back links ("← Trips", "← Trip").
  - The Usage page header fits a phone.
  - Admin usage stats aren't saved for offline use.

## 🎨 Category colours and local testing

- [x] **Choose each category's colour** in Categories: tap the colour dot, then pick from 12 colours (all of them work in dark mode), or choose "Use automatic colour".
  - The colour is stored in the existing `categories.color` column.
  - It's used in the expense list, the form's category chips and the Analytics pie chart.
  - New categories get a colour no other category is using yet.
  - Shared (system) categories can be coloured by admins only.
- [x] **Mock mode** (`npm run dev:mock`): the whole app runs locally on fake data with no accounts.
  - A badge switches the app offline/online and resets the data.
  - See the README.

## 💡 Feature ideas (waiting for your go-ahead)

- [ ] **Split and settle-up (who owes whom):** a list of travelers per trip, "paid by" and "split between" on each expense, and a settle-up summary. It builds on the existing `assigned_to` field.
- [ ] **Daily allowance:** "X EGP/day left" plus a spend-per-day chart, using the trip's start and end dates.
- [ ] **Read the amount and date from receipts (OCR)** after scanning, and pre-fill the expense form.
- [ ] **Budget alerts:** automatically link categories to sub-budgets, and warn at 80% and 100%.
- [x] **CSV/Excel export for everyone.**
  - The trip page's **Export** menu offers "PDF report" or "Excel (CSV)".
  - The Dashboard has **Export all**, one spreadsheet of every trip.
  - Columns: date, day, category, amount, assigned to, sub-budget, notes and receipt links.
  - The file opens in Excel with Arabic intact.
  - Shared code is in `src/lib/csv.js`, also used by the admin backup.
- [x] **Undo on delete.**
  - Deleting shows "Expense deleted · Undo" for 6 seconds, then the delete is sent.
  - The delete is kept in the offline queue, so closing the app during those 6 seconds doesn't lose it.
  - This replaces the confirmation dialog for expenses. Trips still ask first.
  - Also fixed: toasts now close by themselves after a few seconds, and their ✕ button is visible on phones.
- [ ] **Multi-currency:** a currency and exchange rate per expense, with a converted total.
- [ ] **Trip sharing** with other travelers. This goes well with split and settle-up.
- [x] **Offline support.**
  - The last loaded trips and expenses are saved on the device for 7 days, so the app opens and shows them with no connection.
  - Adding, editing and deleting expenses works offline, receipt photos included (kept in IndexedDB). Changes show "Waiting to sync" and sync automatically when you're back online.
  - A banner shows offline status, or failed syncs with **Retry** and **Discard** buttons.
  - Every page's code is downloaded in the background, so pages open offline.
  - A page that can't load shows a Reload screen instead of a blank one.
  - Trip, sub-budget and category changes still need a connection, and those buttons are disabled offline.
  - Signing out clears the saved data, and warns you first if changes haven't synced.
- [ ] **Search across all trips,** not just trip names.
