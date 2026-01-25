import { Link, useLocation } from 'react-router-dom';
import { Plane, LayoutGrid, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function Layout({ children }) {
  const location = useLocation();
  const { logout } = useAuth();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-900">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-indigo-600 p-2 rounded-xl group-hover:bg-indigo-700 transition-colors">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Trippy</span>
          </Link>
          
          <div className="flex items-center gap-1">
            <Link to="/">
              <button className={`p-2 rounded-lg transition-colors ${isHome ? 'bg-gray-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                <LayoutGrid className="w-5 h-5" />
              </button>
            </Link>
            <button onClick={logout} className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors" title="Sign Out">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {children}
      </main>
    </div>
  );
}