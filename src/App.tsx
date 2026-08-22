import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarClock,
  Calculator,
  Kanban,
  Landmark,
  LayoutDashboard,
  Settings as SettingsIcon,
  Sparkles,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { activeWorkspace, setActiveWorkspace, useAppState } from './lib/store';
import { isCloudMode, supabase } from './lib/supabaseClient';
import { cn } from './lib/utils';
import Dashboard from './pages/Dashboard';
import TodayProspects from './pages/TodayProspects';
import Companies from './pages/Companies';
import People from './pages/People';
import FollowUps from './pages/FollowUps';
import Pipeline from './pages/Pipeline';
import Opportunities from './pages/Opportunities';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import CostEstimator from './pages/CostEstimator';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/today', label: "Today's Prospects", icon: Sparkles },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/people', label: 'People', icon: Users },
  { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { to: '/pipeline', label: 'Pipeline', icon: Kanban },
  { to: '/opportunities', label: 'Opportunities', icon: Landmark },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/cost-estimator', label: 'Cost Estimator', icon: Calculator },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function SessionFooter() {
  const [email, setEmail] = useState('');
  useEffect(() => {
    void supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);
  return (
    <div className="flex items-center justify-between gap-2" data-testid="session-footer">
      <p className="truncate text-[11px] leading-snug text-slate-500" title={email}>
        {email || 'Signed in'}
      </p>
      <button
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700"
        onClick={() => void supabase?.auth.signOut()}
        data-testid="sign-out"
      >
        <LogOut className="h-3 w-3" /> Sign out
      </button>
    </div>
  );
}

export default function App() {
  const state = useAppState();
  const workspace = activeWorkspace(state);

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              PC
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight text-slate-900">
                Prospecting Copilot
              </p>
              <p className="text-[11px] leading-tight text-slate-400">Prototype — local only</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-3">
          <label
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400"
            htmlFor="workspace-switcher"
          >
            Workspace
          </label>
          <select
            id="workspace-switcher"
            data-testid="workspace-switcher"
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:border-brand-500 focus:outline-none"
            value={workspace.id}
            onChange={(e) => setActiveWorkspace(e.target.value)}
          >
            {state.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 px-5 py-3">
          {isCloudMode() ? (
            <SessionFooter />
          ) : (
            <p className="text-[11px] leading-snug text-slate-400">
              No external APIs connected. All data stays in this browser.
            </p>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        {NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium',
                isActive ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </div>

      <main className="min-w-0 flex-1 px-4 pb-16 pt-14 md:ml-60 md:px-8 md:pt-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/today" element={<TodayProspects />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/people" element={<People />} />
          <Route path="/follow-ups" element={<FollowUps />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/cost-estimator" element={<CostEstimator />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
