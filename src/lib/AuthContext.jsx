import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { clearSavedData } from '@/lib/query-client';
import { clearOutbox } from '@/lib/outbox';
import { isNetworkError } from '@/lib/network';

// Offline with an expired access token, Supabase can't refresh it and reports no session, though the
// stored session is still valid. Keep using its user so the app works offline; Supabase refreshes
// the token by itself once the connection is back.
function storedUser() {
  try {
    return JSON.parse(localStorage.getItem(supabase.auth.storageKey))?.user ?? null;
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        setUser(session?.user ?? (isNetworkError(error) ? storedUser() : null));
      })
      .catch((error) => setUser(isNetworkError(error) ? storedUser() : null))
      .finally(() => setIsLoadingAuth(false));

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // A failed refresh while offline isn't a sign-out; only trust an explicit one
      setUser((current) => session?.user ?? (event === 'SIGNED_OUT' || navigator.onLine ? null : current));
      setIsLoadingAuth(false);
    });

    return () => subscription.unsubscribe();
  }, []);
  
  const isAuthenticated = !!user;

  // Admin flag lives in public.profiles and is edited by hand in Supabase.
  // null = still checking.
  const [isAdmin, setIsAdmin] = useState(null);
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    setIsAdmin(null);
    supabase.rpc('is_admin').then(({ data, error }) => setIsAdmin(!error && data === true));
  }, [user?.id]);
  
  const login = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) console.error("Login error:", error);
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Logout error:", error);
    clearSavedData();
    clearOutbox();
  };

  const value = {
    user,
    isAuthenticated,
    isAdmin,
    isLoadingAuth,
    isLoadingPublicSettings: false, // Keeping interface consistent
    authError: null,
    login,
    logout,
    navigateToLogin: () => window.location.href = '/login'
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};