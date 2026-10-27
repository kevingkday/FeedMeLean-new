import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { ToastMessage } from '../components/UndoToast';

interface AdminStats {
  total_users: number;
  daily_active_users: number;
  monthly_active_users: number;
  total_meals_logged: number;
  ai_requests_today: number;
  ai_summary: {
    total_requests: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost: number;
    error_count: number;
  };
  ai_requests_by_day: Array<{ day: string; requests: number; cost: number }>;
}

interface AdminUserRow {
  id: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  created_at: string;
  last_login_at: string | null;
  meals_logged: number;
  last_activity_at: string | null;
}

interface AiByUserRow {
  user_id: string;
  email: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  error_count: number;
  last_request_at: string;
}

interface AiErrorRow {
  id: string;
  email: string | null;
  request_type: string;
  model: string;
  error_message: string;
  created_at: string;
}

export const AdminPage: React.FC<{
  onShowToast: (toast: ToastMessage) => void;
}> = ({ onShowToast }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiByUser, setAiByUser] = useState<AiByUserRow[]>([]);
  const [aiErrors, setAiErrors] = useState<AiErrorRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async (q: string = searchQuery) => {
    setLoading(true);
    try {
      const [statsRes, usersRes, aiRes] = await Promise.all([
        apiFetch<AdminStats>('/api/admin/stats'),
        apiFetch<{ users: AdminUserRow[] }>(
          `/api/admin/users?q=${encodeURIComponent(q)}`
        ),
        apiFetch<{ by_user: AiByUserRow[]; recent_errors: AiErrorRow[] }>(
          '/api/admin/ai-usage'
        ),
      ]);
      setStats(statsRes);
      setUsers(usersRes.users);
      setAiByUser(aiRes.by_user);
      setAiErrors(aiRes.recent_errors);
    } catch (err) {
      onShowToast({
        id: 'admin-err',
        text: err instanceof Error ? err.message : 'Failed to load admin data.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll('');
  }, []);

  const handleToggleUserStatus = async (u: AdminUserRow) => {
    const nextStatus = u.status === 'active' ? 'disabled' : 'active';
    try {
      await apiFetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setUsers((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, status: nextStatus } : row))
      );
      onShowToast({
        id: 'usr-status',
        text: `${u.email} is now ${nextStatus}.`,
      });
    } catch (err) {
      onShowToast({
        id: 'usr-err',
        text: err instanceof Error ? err.message : 'Could not update user status.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Administration</h1>
          <p className="text-xs text-slate-500">
            Application metrics, user management, and AI usage telemetry
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadAll(searchQuery)}
          className="px-3.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {/* Application Statistics */}
      {stats && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            Application Statistics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Registered Users</div>
              <div className="text-xl font-bold text-slate-900">
                {stats.total_users}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Daily Active (DAU)</div>
              <div className="text-xl font-bold text-blue-600">
                {stats.daily_active_users}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Monthly Active (MAU)</div>
              <div className="text-xl font-bold text-slate-900">
                {stats.monthly_active_users}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Total Meals Logged</div>
              <div className="text-xl font-bold text-slate-900">
                {stats.total_meals_logged}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">AI Requests (24h)</div>
              <div className="text-xl font-bold text-blue-600">
                {stats.ai_requests_today}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* User Management */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            User Management ({users.length})
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadAll(searchQuery);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="search"
              placeholder="Search email or user ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs w-56"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-semibold">Email / ID</th>
                <th className="py-2 px-3 font-semibold">Registered</th>
                <th className="py-2 px-3 font-semibold">Last Login</th>
                <th className="py-2 px-3 font-semibold">Meals</th>
                <th className="py-2 px-3 font-semibold">Last Activity</th>
                <th className="py-2 px-3 font-semibold">Status</th>
                <th className="py-2 pl-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-slate-900">
                      {u.email}{' '}
                      {u.role === 'admin' && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {u.id}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    {u.created_at.slice(0, 10)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    {u.last_login_at ? u.last_login_at.slice(0, 10) : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                    {u.meals_logged}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    {u.last_activity_at ? u.last_activity_at.slice(0, 10) : '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        u.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleUserStatus(u)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        u.status === 'active'
                          ? 'bg-red-50 text-red-700 hover:bg-red-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {u.status === 'active' ? 'Disable' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* AI Usage & Cost Telemetry */}
      {stats && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900">AI Usage & Cost</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Total AI Requests</div>
              <div className="text-lg font-bold text-slate-900">
                {stats.ai_summary.total_requests}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Total Tokens (In / Out)</div>
              <div className="text-sm font-bold text-slate-900">
                {stats.ai_summary.total_input_tokens.toLocaleString()} /{' '}
                {stats.ai_summary.total_output_tokens.toLocaleString()}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Estimated API Cost</div>
              <div className="text-lg font-bold text-blue-600">
                ${stats.ai_summary.total_cost.toFixed(4)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs text-slate-500">Errors</div>
              <div className="text-lg font-bold text-slate-900">
                {stats.ai_summary.error_count}
              </div>
            </div>
          </div>

          {aiByUser.length > 0 && (
            <div className="overflow-x-auto">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Requests by User
              </h3>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-semibold">User</th>
                    <th className="py-2 px-3 font-semibold">Requests</th>
                    <th className="py-2 px-3 font-semibold">Tokens</th>
                    <th className="py-2 px-3 font-semibold">Est. Cost</th>
                    <th className="py-2 pl-3 font-semibold">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {aiByUser.map((row) => (
                    <tr key={row.user_id || row.email}>
                      <td className="py-2 pr-3 font-medium text-slate-900">
                        {row.email}
                      </td>
                      <td className="py-2 px-3">{row.request_count}</td>
                      <td className="py-2 px-3">
                        {(row.input_tokens + row.output_tokens).toLocaleString()}
                      </td>
                      <td className="py-2 px-3">
                        ${Number(row.estimated_cost).toFixed(4)}
                      </td>
                      <td className="py-2 pl-3">{row.error_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {aiErrors.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-600 mb-2">
                Recent AI Errors
              </h3>
              <div className="space-y-1.5">
                {aiErrors.map((err) => (
                  <div
                    key={err.id}
                    className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
                  >
                    <span className="font-semibold">
                      [{err.created_at.slice(0, 19)}] {err.model} ({err.request_type}):
                    </span>{' '}
                    {err.error_message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {loading && (
        <div className="text-center text-xs text-slate-500 py-4">
          Loading administrative data...
        </div>
      )}
    </div>
  );
};

export default AdminPage;

