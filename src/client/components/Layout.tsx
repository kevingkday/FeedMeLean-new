import React, { useEffect, useState } from 'react';
import type { GoalMetrics, User } from '../../shared/types';

export type NavTab = 'today' | 'log' | 'progress' | 'settings' | 'admin';

interface LayoutProps {
  user: User;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  goalMetrics: GoalMetrics;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  user,
  activeTab,
  onSelectTab,
  goalMetrics,
  children,
}) => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const navItems: Array<{ id: NavTab; label: string; prominent?: boolean }> = [
    { id: 'today', label: 'Today' },
    { id: 'log', label: 'Log Meal', prominent: true },
    { id: 'progress', label: 'Progress' },
    { id: 'settings', label: 'Settings' },
  ];

  if (user.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin' });
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-20 md:pb-8">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onSelectTab('log')}
            className="flex items-center gap-2 text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              FL
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900">
                FeedMe<span className="text-blue-600">Lean</span>
              </span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              if (item.prominent) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    + {item.label}
                  </button>
                );
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                    active
                      ? 'bg-slate-100 text-blue-600 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Goal Pill */}
          <button
            type="button"
            onClick={() => onSelectTab('progress')}
            className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
            title="View Body-Fat Goal Progress"
          >
            {goalMetrics.currentBodyFat}% → {goalMetrics.targetBodyFat}% BF
          </button>
        </div>

        {isOffline && (
          <div className="bg-amber-50 border-t border-amber-200 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
            Offline mode — Quick Access meals are visible, but logging requires a network connection.
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-4 pb-6">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-lg"
      >
        <div
          className={`grid ${
            user.role === 'admin' ? 'grid-cols-5' : 'grid-cols-4'
          } items-center h-16 px-1 max-w-lg mx-auto`}
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            if (item.prominent) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className="flex flex-col items-center justify-center h-12 mx-1 rounded-xl bg-blue-600 text-white font-semibold shadow-sm active:scale-95 transition cursor-pointer"
                >
                  <span className="text-base leading-none">+</span>
                  <span className="text-[11px] leading-tight mt-0.5">{item.label}</span>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center h-full text-xs font-medium transition cursor-pointer ${
                  active ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span className="text-xs leading-tight">{item.label}</span>
                {active && <span className="w-4 h-0.5 bg-blue-600 rounded-full mt-1" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

