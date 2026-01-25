import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Mock auth for development
  const [user, setUser] = useState({ 
    id: 'user_123', 
    email: 'demo@trippy.com',
    name: 'Demo User'
  });
  
  const isAuthenticated = !!user;
  
  const value = {
    user,
    isAuthenticated,
    isLoadingAuth: false,
    isLoadingPublicSettings: false,
    authError: null,
    navigateToLogin: () => console.log('Navigate to login'),
    logout: () => setUser(null)
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