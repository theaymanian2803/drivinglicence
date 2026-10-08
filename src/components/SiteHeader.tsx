import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, Car, History, LogOut, Shield, Signpost, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface SiteHeaderProps {
  title: string;
  subtitle: string;
  revisionCount?: number | null;
}

export default function SiteHeader({ title, subtitle, revisionCount = null }: SiteHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const isAdmin = user?.role === 'admin';

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 text-sm font-medium transition-colors px-3 py-2 rounded-lg ${
      isActive
        ? 'text-primary-700 bg-primary-50'
        : 'text-slate-600 hover:text-primary-600 hover:bg-primary-50'
    }`;

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-md shrink-0">
            <Car className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
            <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink to="/revision" className={navClass} relative="path">
            <BookOpen className="w-4 h-4" />
            <span>Révision</span>
            {revisionCount !== null && revisionCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-error-500 text-white text-xs font-bold flex items-center justify-center">
                {revisionCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/signs" className={navClass} relative="path">
            <Signpost className="w-4 h-4" />
            <span>Panneaux</span>
          </NavLink>
          <NavLink to="/history" className={navClass} relative="path">
            <History className="w-4 h-4" />
            <span>Mes résultats</span>
          </NavLink>
          {isAdmin && (
            <Link
              to="/admin/dashboard"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary-600 transition-colors px-3 py-2 rounded-lg hover:bg-primary-50"
            >
              <Shield className="w-4 h-4" />
              <span>Admin</span>
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {!user && (
            <Link
              to="/login"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary-600 transition-colors px-3 py-2 rounded-lg hover:bg-primary-50"
            >
              <User className="w-4 h-4" />
              <span>Connexion</span>
            </Link>
          )}
          <div className="hidden lg:flex items-center gap-2 pl-2 pr-1 py-1 rounded-full bg-slate-100 border border-slate-200">
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              {isAdmin ? (
                <Shield className="w-4 h-4 text-white" />
              ) : (
                <User className="w-4 h-4 text-white" />
              )}
            </span>
            <span className="text-sm font-medium text-slate-700 pr-1 max-w-[10rem] truncate">
              {isAdmin ? 'Admin' : user?.name ?? user?.email}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-error-600 transition-colors px-3 py-2 rounded-lg hover:bg-error-50"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </div>

      <nav className="md:hidden flex items-center gap-1 px-4 sm:px-6 pb-2 border-t border-slate-100 pt-2">
        <NavLink to="/revision" className={navClass} relative="path">
          <BookOpen className="w-4 h-4" />
          <span>Révision</span>
          {revisionCount !== null && revisionCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-error-500 text-white text-xs font-bold flex items-center justify-center">
              {revisionCount}
            </span>
          )}
        </NavLink>
        <NavLink to="/signs" className={navClass} relative="path">
          <Signpost className="w-4 h-4" />
          <span>Panneaux</span>
        </NavLink>
        <NavLink to="/history" className={navClass} relative="path">
          <History className="w-4 h-4" />
          <span>Mes résultats</span>
        </NavLink>
        {isAdmin && (
          <Link
            to="/admin/dashboard"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary-600 transition-colors px-3 py-2 rounded-lg hover:bg-primary-50"
          >
            <Shield className="w-4 h-4" />
            <span>Admin</span>
          </Link>
        )}
      </nav>
    </header>
  );
}