import { useEffect } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';

const THEME_COLORS = { light: '#ffffff', dark: '#0f172a' };

// Keeps the browser/PWA status bar colour in step with the app's theme
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && resolvedTheme) meta.setAttribute('content', THEME_COLORS[resolvedTheme] || THEME_COLORS.light);
  }, [resolvedTheme]);
  return null;
}

// Light / Dark / System (default), remembered per device
export function ThemeProvider({ children }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem storageKey="trippy.theme" disableTransitionOnChange>
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}

export { useTheme };
