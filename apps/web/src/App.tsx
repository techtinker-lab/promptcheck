import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/layout/Header.js';
import { AuthPage } from './features/auth/AuthPage.js';
import { BillingPage } from './features/billing/BillingPage.js';
import { ContractsPage } from './features/contracts/ContractsPage.js';
import { ProjectOnboarding } from './features/projects/ProjectOnboarding.js';
import { ProjectsListPage } from './features/projects/ProjectsListPage.js';
import { CompareRunsPage } from './features/runs/CompareRunsPage.js';
import { RunDetailPage } from './features/runs/RunDetailPage.js';
import { RunsListPage } from './features/runs/RunsListPage.js';
import { api } from './lib/api-client.js';
import type { User } from './types.js';

export function App() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<{ user: User }>({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: User }>('/api/v1/auth/me'),
    retry: false,
  });

  const user = data?.user || null;

  // Extract current project slug from URL if inside /projects/:slug/...
  const match = location.pathname.match(/^\/projects\/([^/]+)/);
  const currentProjectSlug = match && match[1] !== 'projects' ? match[1] : undefined;

  const handleAuthSuccess = (authenticatedUser: User) => {
    queryClient.setQueryData(['me'], { user: authenticatedUser });
    navigate('/projects');
  };

  const handleLogout = () => {
    queryClient.setQueryData(['me'], null);
    queryClient.clear();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center font-mono text-xs text-zinc-500">
        Carregando PromptCheck...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {user && (
        <Header user={user} onLogout={handleLogout} currentProjectSlug={currentProjectSlug} />
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/projects" replace />
              ) : (
                <AuthPage onSuccess={handleAuthSuccess} />
              )
            }
          />

          <Route
            path="/projects"
            element={user ? <ProjectsListPage /> : <Navigate to="/login" replace />}
          />

          <Route
            path="/projects/:slug/onboarding"
            element={user ? <ProjectOnboarding /> : <Navigate to="/login" replace />}
          />

          <Route
            path="/projects/:slug/contracts"
            element={user ? <ContractsPage /> : <Navigate to="/login" replace />}
          />

          <Route
            path="/projects/:slug/runs"
            element={user ? <RunsListPage /> : <Navigate to="/login" replace />}
          />

          <Route
            path="/projects/:slug/runs/:runId"
            element={user ? <RunDetailPage /> : <Navigate to="/login" replace />}
          />

          <Route
            path="/projects/:slug/compare"
            element={user ? <CompareRunsPage /> : <Navigate to="/login" replace />}
          />

          <Route
            path="/billing"
            element={user ? <BillingPage /> : <Navigate to="/login" replace />}
          />

          <Route path="/" element={<Navigate to={user ? '/projects' : '/login'} replace />} />

          <Route path="*" element={<Navigate to={user ? '/projects' : '/login'} replace />} />
        </Routes>
      </main>
    </div>
  );
}
