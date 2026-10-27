import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from './lib/api';
import { calculateGoalMetrics, getLocalDateString } from '../shared/nutritionMath';
import type { MealLog, User, UserProfile } from '../shared/types';
import { Layout, type NavTab } from './components/Layout';
import { UndoToast, type ToastMessage } from './components/UndoToast';
import { AuthPage } from './pages/AuthPage';
import { LandingPage } from './pages/LandingPage';
import { LogMealPage } from './pages/LogMealPage';
import { TodayPage } from './pages/TodayPage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';

const AdminPage = React.lazy(() => import('./pages/AdminPage'));

export const App: React.FC = () => {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [latestWeightKg, setLatestWeightKg] = useState<number | null>(null);
  const [initialWeightKg, setInitialWeightKg] = useState<number | null>(null);
  const [unauthView, setUnauthView] = useState<'landing' | 'login' | 'register'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('reset_token') ? 'login' : 'landing';
  });

  const [activeTab, setActiveTab] = useState<NavTab>('log');
  const [todayTotals, setTodayTotals] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  const [recentMeals, setRecentMeals] = useState<MealLog[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((msg: ToastMessage) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  const timezone =
    profile?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'America/New_York';

  const todayDateStr = useMemo(
    () => getLocalDateString(new Date(), timezone),
    [timezone]
  );

  const refreshTodaySummary = useCallback(async () => {
    try {
      const res = await apiFetch<{
        date: string;
        totals: { calories: number; protein: number; carbs: number; fat: number };
        meals: MealLog[];
        recent_meals: MealLog[];
      }>(`/api/meals?date=${encodeURIComponent(todayDateStr)}&include_recent=1`);
      setTodayTotals(res.totals);
      setRecentMeals(res.recent_meals || []);
    } catch {
      // Ignore offline error
    }
  }, [todayDateStr]);

  useEffect(() => {
    let mounted = true;
    apiFetch<{
      user: User;
      profile: UserProfile | null;
      latestWeightKg: number | null;
      initialWeightKg: number | null;
    }>('/api/auth/me')
      .then((res) => {
        if (!mounted) return;
        setUser(res.user);
        setProfile(res.profile);
        setLatestWeightKg(res.latestWeightKg);
        setInitialWeightKg(res.initialWeightKg);
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
      })
      .finally(() => {
        if (mounted) setBootstrapping(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (user) {
      refreshTodaySummary();
    }
  }, [user, refreshTodaySummary]);

  const goalMetrics = useMemo(
    () => calculateGoalMetrics(profile || {}, latestWeightKg, initialWeightKg),
    [profile, latestWeightKg, initialWeightKg]
  );

  const handleMealLogged = (meal: MealLog) => {
    if (meal.local_date === todayDateStr) {
      setTodayTotals((prev) => ({
        calories: prev.calories + meal.calories,
        protein: Math.round((prev.protein + meal.protein) * 10) / 10,
        carbs: Math.round((prev.carbs + meal.carbs) * 10) / 10,
        fat: Math.round((prev.fat + meal.fat) * 10) / 10,
      }));
    }
    setRecentMeals((prev) => {
      const filtered = prev.filter(
        (m) => m.description.toLowerCase() !== meal.description.toLowerCase()
      );
      return [meal, ...filtered].slice(0, 8);
    });
  };

  const handleMealDeleted = (_mealId: string, meal: MealLog) => {
    if (meal.local_date === todayDateStr) {
      setTodayTotals((prev) => ({
        calories: Math.max(0, prev.calories - meal.calories),
        protein: Math.max(0, Math.round((prev.protein - meal.protein) * 10) / 10),
        carbs: Math.max(0, Math.round((prev.carbs - meal.carbs) * 10) / 10),
        fat: Math.max(0, Math.round((prev.fat - meal.fat) * 10) / 10),
      }));
    }
    refreshTodaySummary();
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm font-semibold text-slate-500">
          Loading FeedMeLean...
        </div>
      </div>
    );
  }

  if (!user) {
    if (unauthView === 'landing') {
      return (
        <LandingPage
          onLogin={() => setUnauthView('login')}
          onRegister={() => setUnauthView('register')}
        />
      );
    }

    return (
      <AuthPage
        initialMode={unauthView}
        onBackToLanding={() => setUnauthView('landing')}
        onAuthenticated={(payload) => {
          setUser(payload.user);
          setProfile(payload.profile);
          setLatestWeightKg(payload.latestWeightKg);
          setInitialWeightKg(payload.initialWeightKg);
          setActiveTab('log');
        }}
      />
    );
  }

  return (
    <>
      <Layout
        user={user}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        goalMetrics={goalMetrics}
      >
        {activeTab === 'log' && (
          <LogMealPage
            user={user}
            goalMetrics={goalMetrics}
            todayTotals={todayTotals}
            recentMeals={recentMeals}
            onMealLogged={handleMealLogged}
            onMealDeleted={handleMealDeleted}
            onShowToast={showToast}
            onNavigateToday={() => setActiveTab('today')}
          />
        )}

        {activeTab === 'today' && (
          <TodayPage
            user={user}
            timezone={timezone}
            todayDateStr={todayDateStr}
            goalMetrics={goalMetrics}
            onTodayMealsChanged={refreshTodaySummary}
            onNavigateLogMeal={() => setActiveTab('log')}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressPage
            unitSystem={profile?.unit_system || 'imperial'}
            goalMetrics={goalMetrics}
            onWeightUpdated={(latest, initial) => {
              setLatestWeightKg(latest);
              if (initial !== undefined) setInitialWeightKg(initial);
            }}
            onNavigateLogMeal={() => setActiveTab('log')}
            onNavigateSettings={() => setActiveTab('settings')}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            user={user}
            profile={profile}
            onProfileUpdated={(updated) => {
              setProfile(updated);
              if (updated.weight_kg) setLatestWeightKg(updated.weight_kg);
            }}
            onUserUpdated={setUser}
            onLoggedOut={() => {
              setUser(null);
              setProfile(null);
            }}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'admin' && user.role === 'admin' && (
          <Suspense
            fallback={
              <div className="py-8 text-center text-xs text-slate-500">
                Loading Admin Portal...
              </div>
            }
          >
            <AdminPage onShowToast={showToast} />
          </Suspense>
        )}
      </Layout>

      <UndoToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
};

