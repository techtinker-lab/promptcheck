import { ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { api } from '../../lib/api-client.js';
import type { User } from '../../types.js';

export interface AuthPageProps {
  onSuccess: (user: User) => void;
}

export function AuthPage({ onSuccess }: AuthPageProps) {
  const { t } = useTranslation();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        const data = await api.post<{ user: User }>('/api/v1/auth/register', {
          email,
          password,
          name,
        });
        onSuccess(data.user);
      } else {
        const data = await api.post<{ user: User }>('/api/v1/auth/login', {
          email,
          password,
        });
        onSuccess(data.user);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-zinc-950">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center text-emerald-400 mb-2">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {isRegister ? t('auth.titleRegister') : t('auth.titleLogin')}
          </h1>
          <p className="text-xs text-zinc-400">{t('auth.subtitle')}</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-xs rounded border border-rose-800 bg-rose-950/40 text-rose-300">
                {error}
              </div>
            )}

            {isRegister && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-medium text-zinc-300 mb-1">
                  {t('auth.name')}
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  placeholder="Seu Nome"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-300 mb-1">
                {t('auth.email')}
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                placeholder="dev@techtinker.com.br"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                {t('auth.password')}
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" isLoading={loading} className="w-full mt-2">
              {isRegister ? t('auth.registerBtn') : t('auth.loginBtn')}
            </Button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError(null);
                }}
                className="text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
              >
                {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
