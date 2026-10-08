import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plane, LayoutGrid, LogOut, Gauge, Sun, Moon, Monitor, CircleUserRound, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/theme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useOnline } from '@/lib/network';
import { useOutbox, retryFailed, discardFailed } from '@/lib/outbox';

const navItemClass = (active) =>
  `flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
    active ? 'bg-gray-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100 hover:text-slate-900'
  }`;

export default function Layout({ children }) {
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const isUsage = location.pathname === '/Usage';
  const isTrips = !isUsage;
  const online = useOnline();
  const outbox = useOutbox();
  const unsynced = outbox.filter((op) => !(op.kind === 'delete' && op.runAfter > Date.now()));
  const failed = outbox.filter((op) => op.error);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  return (
    <div className="min-h-dvh bg-gray-50 font-sans text-slate-900">
      <nav className="sticky top-0 z-40 border-b border-gray-100 bg-card/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          <Link to="/" className="group flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
            <div className="rounded-xl bg-indigo-600 p-2 transition-colors group-hover:bg-indigo-700">
              <Plane className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Trippy</span>
          </Link>

          <div className="flex items-center gap-1">
            <Link to="/" aria-label="Trips" aria-current={isTrips ? 'page' : undefined} className={navItemClass(isTrips)}>
              <LayoutGrid className="h-5 w-5" />
              <span className="hidden sm:inline">Trips</span>
            </Link>
            {isAdmin && (
              <Link to="/Usage" aria-label="Usage" aria-current={isUsage ? 'page' : undefined} className={navItemClass(isUsage)}>
                <Gauge className="h-5 w-5" />
                <span className="hidden sm:inline">Usage</span>
              </Link>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Account and theme" className={navItemClass(false)}>
                <CircleUserRound className="h-5 w-5" />
                <span className="hidden sm:inline">Account</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {user?.email && (
                  <>
                    <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuLabel className="text-xs">Theme</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light" className="gap-2 py-2">
                    <Sun className="h-4 w-4" /> Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark" className="gap-2 py-2">
                    <Moon className="h-4 w-4" /> Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system" className="gap-2 py-2">
                    <Monitor className="h-4 w-4" /> System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 py-2 text-red-600 focus:text-red-600"
                  onSelect={() => setConfirmSignOut(true)}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      {/* Offline / sync status, just under the nav */}
      {(!online || failed.length > 0) && (
        <div
          role="status"
          className={`border-b px-4 py-2 text-sm ${failed.length ? 'border-red-100 bg-red-50 text-red-800' : 'border-amber-100 bg-amber-50 text-amber-900'}`}
        >
          <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1">
            {failed.length ? (
              <>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  {failed.length} {failed.length === 1 ? "change couldn't" : "changes couldn't"} sync: {failed[0].error}
                </span>
                <button type="button" onClick={() => retryFailed()} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 font-medium hover:bg-red-100">
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
                <button type="button" onClick={() => setConfirmDiscard(true)} className="inline-flex h-9 items-center rounded-lg px-2 font-medium hover:bg-red-100">
                  Discard
                </button>
              </>
            ) : (
              <>
                <CloudOff className="h-4 w-4 shrink-0" />
                <span className="flex-1">
                  You're offline. Showing saved data
                  {unsynced.length
                    ? ` · ${unsynced.length} ${unsynced.length === 1 ? 'change' : 'changes'} will sync when you're back online`
                    : '. New expenses will sync when you\'re back online'}
                  .
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-2xl px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        {children}
      </main>

      <ConfirmDialog
        confirm={confirmSignOut && {
          title: 'Sign out?',
          description: unsynced.length
            ? `${unsynced.length} offline ${unsynced.length === 1 ? 'change hasn\'t' : 'changes haven\'t'} synced yet and will be lost if you sign out now.`
            : "You'll need to sign in with Google again to see your trips.",
          confirmLabel: 'Sign out',
          onConfirm: logout,
        }}
        onClose={() => setConfirmSignOut(false)}
      />
      <ConfirmDialog
        confirm={confirmDiscard && {
          title: 'Discard changes that failed to sync?',
          description: 'Those expenses (and any photos only on this device) will be removed.',
          confirmLabel: 'Discard',
          onConfirm: () => discardFailed(),
        }}
        onClose={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
