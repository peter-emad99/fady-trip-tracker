import { Suspense, useEffect } from 'react'
import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClientInstance, persistOptions } from '@/lib/query-client'
import { syncOutbox } from '@/lib/outbox'
import { pagesConfig, preloadPages } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/theme';
import PageErrorBoundary from '@/components/PageErrorBoundary';
import Login from './pages/Login';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const PageLoading = () => (
  <div className="flex justify-center py-16" role="status" aria-label="Loading">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
  </div>
);

// Pages are lazy-loaded, so the layout stays on screen while the next page's code downloads
const LayoutWrapper = ({ children, currentPageName }) => {
  const page = (
    <PageErrorBoundary key={currentPageName}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </PageErrorBoundary>
  );
  return Layout ? <Layout currentPageName={currentPageName}>{page}</Layout> : page;
};

// Sends offline changes when the app opens, comes back online or returns to the foreground
function useOfflineSync(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const sync = () => syncOutbox();
    const onVisible = () => document.visibilityState === 'visible' && sync();
    sync();
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}

// Downloads the other pages' code in the background, so they open offline too
function usePreloadPages(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const preload = () => {
      preloadPages();
      import('./components/expenses/ReceiptReview').catch(() => {});
      import('./components/expenses/ExpenseChart').catch(() => {});
    };
    const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 2000));
    const handle = idle(preload);
    return () => (window.cancelIdleCallback ?? clearTimeout)(handle);
  }, [enabled]);
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();
  useOfflineSync(isAuthenticated);
  usePreloadPages(isAuthenticated);

  // Show loading spinner while checking auth
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
      
      <Route path="/" element={
        isAuthenticated ? (
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        ) : <Navigate to="/login" />
      } />
      
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            isAuthenticated ? (
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            ) : <Navigate to="/login" />
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <ThemeProvider>
      <AuthProvider>
        <PersistQueryClientProvider client={queryClientInstance} persistOptions={persistOptions}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </PersistQueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
