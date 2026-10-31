import { CreditCard, Globe, LogOut, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../lib/api-client.js';
import { changeLanguage } from '../../lib/i18n.js';
import type { User } from '../../types.js';

export interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  currentProjectSlug?: string;
}

export function Header({ user, onLogout, currentProjectSlug }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('pt') ? 'en' : 'pt';
    changeLanguage(nextLang);
  };

  const handleLogout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Ignora erro de rede no logout
    }
    onLogout();
  };

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link to="/projects" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-zinc-100 flex items-center gap-1.5">
                PromptCheck
                <span className="text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  TechTinker
                </span>
              </span>
            </div>
          </Link>

          {/* Navigation within selected project */}
          {currentProjectSlug && (
            <nav className="hidden md:flex items-center gap-1 border-l border-zinc-800 pl-6 text-sm">
              <Link
                to={`/projects/${currentProjectSlug}/runs`}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  location.pathname.includes('/runs')
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('nav.runs')}
              </Link>
              <Link
                to={`/projects/${currentProjectSlug}/contracts`}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  location.pathname.includes('/contracts')
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('nav.contracts')}
              </Link>
            </nav>
          )}
        </div>

        {/* Right Actions: Lang Switcher, User, Logout */}
        <div className="flex items-center gap-3">
          <Link
            to="/billing"
            className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-md border transition-colors ${
              location.pathname === '/billing'
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-medium'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700'
            }`}
            title={t('nav.billing')}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('nav.billing')}</span>
          </Link>

          <button
            type="button"
            onClick={toggleLanguage}
            className="flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded border border-zinc-800 hover:border-zinc-700 transition-colors"
            title="Alternar idioma / Switch language"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{i18n.language.startsWith('pt') ? 'PT' : 'EN'}</span>
          </button>

          {user && (
            <div className="flex items-center gap-3 border-l border-zinc-800 pl-3">
              <span className="text-xs text-zinc-400 hidden sm:inline-block max-w-[150px] truncate">
                {user.name}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-zinc-400 hover:text-rose-400 p-1.5 rounded transition-colors"
                title={t('nav.logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
