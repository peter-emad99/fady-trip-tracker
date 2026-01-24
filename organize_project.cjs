const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

// Ensure src directories exist
const dirs = [
    '',
    'components',
    'components/ui',
    'components/expenses',
    'components/trips',
    'pages',
    'hooks',
    'utils',
    'entities',
    'lib',
    'api'
];

dirs.forEach(d => {
    const p = path.join(SRC, d);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Helper to move file
function move(src, dest) {
    const srcPath = path.join(ROOT, src);
    const destPath = path.join(SRC, dest);
    if (fs.existsSync(srcPath)) {
        fs.renameSync(srcPath, destPath);
        console.log(`Moved ${src} -> src/${dest}`);
    } else {
        console.log(`Warning: Source ${src} not found`);
    }
}

// Helper to rename/move with extension check
function moveAndRename(srcDir, destDir, ext) {
    const sPath = path.join(ROOT, srcDir);
    const dPath = path.join(SRC, destDir);
    
    if (!fs.existsSync(sPath)) return;

    const files = fs.readdirSync(sPath);
    files.forEach(f => {
        const srcFile = path.join(sPath, f);
        const stat = fs.statSync(srcFile);
        if (stat.isDirectory()) return; // skip subdirs handled separately

        let newName = f;
        if (!path.extname(f)) {
            newName = f + ext;
        }
        
        // Special case: hooks usually are .jsx or .js. If it has ext, keep it.
        
        fs.renameSync(srcFile, path.join(dPath, newName));
        console.log(`Moved ${srcDir}/${f} -> src/${destDir}/${newName}`);
    });
}

// 1. Move root files
move('App.jsx', 'App.jsx');
move('App.css', 'App.css');
move('main.jsx', 'main.jsx');
move('index.css', 'index.css');
move('pages.config.js', 'pages.config.js');

// 2. Special single files
move('layout', 'Layout.jsx'); // was 'layout' without ext

// 3. Move folders with extension fix
moveAndRename('components/ui', 'components/ui', '.jsx');
moveAndRename('components/expenses', 'components/expenses', '.jsx');
moveAndRename('components/trips', 'components/trips', '.jsx');
moveAndRename('entities', 'entities', '.json');

// 4. Move other folders
// components (root level files like UserNotRegisteredError)
const compRoot = path.join(ROOT, 'components');
if (fs.existsSync(compRoot)) {
    fs.readdirSync(compRoot).forEach(f => {
        const srcFile = path.join(compRoot, f);
        if (fs.statSync(srcFile).isFile()) {
            let newName = f;
            if (!path.extname(f)) newName += '.jsx';
            fs.renameSync(srcFile, path.join(SRC, 'components', newName));
            console.log(`Moved components/${f} -> src/components/${newName}`);
        }
    });
}

// hooks
if (fs.existsSync(path.join(ROOT, 'hooks'))) {
    fs.readdirSync(path.join(ROOT, 'hooks')).forEach(f => {
        fs.renameSync(path.join(ROOT, 'hooks', f), path.join(SRC, 'hooks', f));
    });
    console.log('Moved hooks');
}

// pages
if (fs.existsSync(path.join(ROOT, 'pages'))) {
    fs.readdirSync(path.join(ROOT, 'pages')).forEach(f => {
        fs.renameSync(path.join(ROOT, 'pages', f), path.join(SRC, 'pages', f));
    });
    console.log('Moved pages');
}

// utils
// 'utils' folder had 'index.ts'.
if (fs.existsSync(path.join(ROOT, 'utils'))) {
    fs.readdirSync(path.join(ROOT, 'utils')).forEach(f => {
        fs.renameSync(path.join(ROOT, 'utils', f), path.join(SRC, 'utils', f));
    });
    console.log('Moved utils');
}

// 5. Create missing files in lib/ and api/
const libFiles = {
    'utils.js': `import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}`,
    'query-client.js': `import { QueryClient } from '@tanstack/react-query';
export const queryClientInstance = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});`,
    'AuthContext.jsx': `import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Mock auth for development
  const [user, setUser] = useState({ 
    id: 'user_123', 
    email: 'demo@base44.com',
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
};`,
    'VisualEditAgent.jsx': `const VisualEditAgent = () => null; export default VisualEditAgent;`,
    'NavigationTracker.jsx': `const NavigationTracker = () => null; export default NavigationTracker;`,
    'PageNotFound.jsx': `import React from 'react';
import { Link } from 'react-router-dom';

const PageNotFound = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
    <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
    <p className="text-gray-600 mb-8">Page not found</p>
    <Link to="/" className="text-indigo-600 hover:text-indigo-800 font-medium">
      Go back home
    </Link>
  </div>
);
export default PageNotFound;`
};

for (const [f, content] of Object.entries(libFiles)) {
    fs.writeFileSync(path.join(SRC, 'lib', f), content);
    console.log(`Created src/lib/${f}`);
}

// api/base44Client.js
const base44ClientContent = `import { createClient } from '@base44/sdk';

// Initialize the client. 
// In a real app, you might pass config, but for now we assume defaults or env vars are picked up if available.
// If the SDK requires parameters, they should be added here.
export const base44 = createClient();
`;
fs.writeFileSync(path.join(SRC, 'api', 'base44Client.js'), base44ClientContent);
console.log('Created src/api/base44Client.js');

// Clean up empty root folders
['components/ui', 'components/expenses', 'components/trips', 'components', 'entities', 'hooks', 'pages', 'utils'].forEach(d => {
    const p = path.join(ROOT, d);
    if (fs.existsSync(p)) {
        try {
            // Remove recursively if empty or contains only moved files (which means it should be empty now)
            // But 'fs.rmdirSync' only removes empty dirs.
            // Using recursive removal to be safe if nested empty dirs exist.
            fs.rmSync(p, { recursive: true, force: true });
        } catch (e) {
            console.log(`Could not remove ${d}: ${e.message}`);
        }
    }
});

console.log('Organization complete.');
