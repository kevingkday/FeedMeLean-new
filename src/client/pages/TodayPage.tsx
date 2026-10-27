import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { getCachedSavedMeals, setCachedSavedMeals } from '../lib/cache';
import type { GoalMetrics, MealLog, SavedMeal, User } from '../../shared/types';
import type { ToastMessage } from '../components/UndoToast';

interface TodayPageProps {
  user: User;
  timezone: string;
  todayDateStr: string;
  goalMetrics: GoalMetrics;
  onTodayMealsChanged: () => void;
  onNavigateLogMeal: () => void;
  onShowToast: (toast: ToastMessage) => void;
}

function shiftDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function formatReadableDate(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'Today';
  if (dateStr === shiftDateString(todayStr, -1)) return 'Yesterday';
  if (dateStr === shiftDateString(todayStr, 1)) return 'Tomorrow';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function getMealPeriod(isoTime: string, timezone: string): 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone || 'UTC',
    }).format(new Date(isoTime));
    const hour = parseInt(hourStr, 10);
    if (hour >= 5 && hour < 11) return 'Breakfast';
    if (hour >= 11 && hour < 16) return 'Lunch';
    if (hour >= 16 && hour < 21) return 'Dinner';
    return 'Snack';
  } catch {
    return 'Lunch';
  }
}

function formatTime(isoTime: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone || 'UTC',
    }).format(new Date(isoTime));
  } catch {
    return '';
  }
}

function toLocalDateTimeInput(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export const TodayPage: React.FC<TodayPageProps> = ({
  user,
  timezone,
  todayDateStr,
  goalMetrics,
  onTodayMealsChanged,
  onNavigateLogMeal,
  onShowToast,
}) => {
  const [selectedDate, setSelectedDate] = useState(todayDateStr);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [loading, setLoading] = useState(true);
  const [editingMeal, setEditingMeal] = useState<MealLog | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editCal, setEditCal] = useState('');
  const [editP, setEditP] = useState('');
  const [editC, setEditC] = useState('');
  const [editF, setEditF] = useState('');
  const [editTime, setEditTime] = useState('');

  const loadDayMeals = async (dateStr: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        date: string;
        totals: { calories: number; protein: number; carbs: number; fat: number };
        meals: MealLog[];
      }>(`/api/meals?date=${encodeURIComponent(dateStr)}`);
      setMeals(res.meals);
      setTotals(res.totals);
    } catch {
      // Keep current state on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDayMeals(selectedDate);
  }, [selectedDate]);

  const openEditMeal = (meal: MealLog) => {
    setEditingMeal(meal);
    setEditDesc(meal.description);
    setEditCal(String(meal.calories));
    setEditP(String(meal.protein));
    setEditC(String(meal.carbs));
    setEditF(String(meal.fat));
    setEditTime(toLocalDateTimeInput(meal.consumed_at));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMeal) return;

    try {
      const consumedAtIso = editTime
        ? new Date(editTime).toISOString()
        : editingMeal.consumed_at;

      await apiFetch(`/api/meals/${editingMeal.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          description: editDesc.trim(),
          calories: Number(editCal) || 0,
          protein: Number(editP) || 0,
          carbs: Number(editC) || 0,
          fat: Number(editF) || 0,
          consumed_at: consumedAtIso,
        }),
      });

      setEditingMeal(null);
      await loadDayMeals(selectedDate);
      onTodayMealsChanged();
    } catch (err) {
      onShowToast({
        id: 'err',
        text: err instanceof Error ? err.message : 'Failed to update meal.',
      });
    }
  };

  const handleDeleteMeal = async (meal: MealLog) => {
    try {
      await apiFetch(`/api/meals/${meal.id}`, { method: 'DELETE' });
      await loadDayMeals(selectedDate);
      onTodayMealsChanged();
      onShowToast({
        id: meal.id,
        text: `Deleted "${meal.description}"`,
      });
    } catch {
      onShowToast({ id: 'err', text: 'Failed to delete meal.' });
    }
  };

  const handleReuseMeal = async (meal: MealLog) => {
    try {
      const res = await apiFetch<{ meal: MealLog }>('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          description: meal.description,
          calories: meal.calories,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
          consumed_at: new Date().toISOString(),
        }),
      });
      if (selectedDate === todayDateStr) {
        await loadDayMeals(selectedDate);
      }
      onTodayMealsChanged();
      onShowToast({
        id: res.meal.id,
        text: `Logged "${meal.description}" to Today`,
        undoLabel: 'Undo',
        onUndo: async () => {
          await apiFetch(`/api/meals/${res.meal.id}`, { method: 'DELETE' }).catch(
            () => null
          );
          if (selectedDate === todayDateStr) {
            await loadDayMeals(selectedDate);
          }
          onTodayMealsChanged();
        },
      });
    } catch {
      onShowToast({ id: 'err', text: 'Could not reuse meal.' });
    }
  };

  const handleSaveToQuickAccess = async (meal: MealLog) => {
    try {
      const res = await apiFetch<{ saved_meal: SavedMeal }>('/api/saved-meals', {
        method: 'POST',
        body: JSON.stringify({
          name: meal.description.slice(0, 60),
          description: meal.description,
          calories: meal.calories,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
        }),
      });
      const existing = getCachedSavedMeals(user.id);
      setCachedSavedMeals(user.id, [res.saved_meal, ...existing]);
      onShowToast({
        id: res.saved_meal.id,
        text: `Saved "${res.saved_meal.name}" to Quick Access`,
      });
    } catch {
      onShowToast({ id: 'err', text: 'Could not save to Quick Access.' });
    }
  };

  const macroCards = [
    {
      label: 'Calories',
      current: Math.round(totals.calories),
      target: goalMetrics.dailyCalorieTarget,
      unit: '',
      suffix: 'calories',
      barColor: 'bg-blue-600',
    },
    {
      label: 'Protein',
      current: Math.round(totals.protein),
      target: goalMetrics.proteinTarget,
      unit: 'g',
      suffix: 'protein',
      barColor: 'bg-emerald-600',
    },
    {
      label: 'Carbs',
      current: Math.round(totals.carbs),
      target: goalMetrics.carbsTarget,
      unit: 'g',
      suffix: 'carbs',
      barColor: 'bg-indigo-500',
    },
    {
      label: 'Fat',
      current: Math.round(totals.fat),
      target: goalMetrics.fatTarget,
      unit: 'g',
      suffix: 'fat',
      barColor: 'bg-amber-500',
    },
  ];

  // Group meals by period of day while maintaining chronological order inside each group
  const periods: Array<'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'> = [
    'Breakfast',
    'Lunch',
    'Dinner',
    'Snack',
  ];
  const groupedMeals = periods
    .map((period) => ({
      period,
      items: meals.filter((m) => getMealPeriod(m.consumed_at, timezone) === period),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {/* Date Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedDate(shiftDateString(selectedDate, -1))}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            ← Prev Day
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(todayDateStr)}
            disabled={selectedDate === todayDateStr}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              selectedDate === todayDateStr
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(shiftDateString(selectedDate, 1))}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            Next Day →
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">
            {formatReadableDate(selectedDate, todayDateStr)}
          </span>
          <input
            type="date"
            aria-label="Pick date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            className="px-2.5 py-1 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Four Primary Macro Metrics */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Daily Nutrition Totals</h2>
          <button
            type="button"
            onClick={onNavigateLogMeal}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            + Log Meal
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {macroCards.map((m) => {
            const pct = m.target > 0 ? Math.min(100, Math.round((m.current / m.target) * 100)) : 0;
            const isOver = m.target > 0 && m.current > m.target;
            const diff = Math.abs(m.target - m.current);

            return (
              <div
                key={m.label}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200"
              >
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm font-bold text-slate-900">{m.label}</span>
                  <span className="text-sm font-bold text-slate-900">
                    {m.current.toLocaleString()}
                    {m.unit}{' '}
                    <span className="text-slate-400 font-normal">
                      / {m.target.toLocaleString()}
                      {m.unit}
                    </span>
                  </span>
                </div>

                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isOver ? 'bg-amber-500' : m.barColor
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="text-xs font-semibold">
                  {isOver ? (
                    <span className="text-amber-700">
                      {diff.toLocaleString()}
                      {m.unit} {m.unit ? '' : ' '}
                      {m.suffix} over
                    </span>
                  ) : (
                    <span className="text-slate-600">
                      {diff.toLocaleString()}
                      {m.unit} {m.unit ? '' : ' '}
                      {m.suffix} remaining
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Daily Meal History */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 mb-3">
          Meals Logged ({meals.length})
        </h2>

        {editingMeal && (
          <form
            onSubmit={handleSaveEdit}
            className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Edit Logged Meal</span>
              <button
                type="button"
                onClick={() => setEditingMeal(null)}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Description
              </label>
              <input
                type="text"
                required
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Calories</label>
                <input
                  type="number"
                  min={0}
                  value={editCal}
                  onChange={(e) => setEditCal(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Protein (g)</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={editP}
                  onChange={(e) => setEditP(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Carbs (g)</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={editC}
                  onChange={(e) => setEditC(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Fat (g)</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={editF}
                  onChange={(e) => setEditF(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-0.5">Date & Time</label>
              <input
                type="datetime-local"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading meals...</div>
        ) : meals.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500 mb-3">
              No meals logged for {formatReadableDate(selectedDate, todayDateStr)}.
            </p>
            <button
              type="button"
              onClick={onNavigateLogMeal}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
            >
              Log a Meal Now
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedMeals.map((group) => (
              <div key={group.period}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  {group.period}
                </h3>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-3.5">
                  {group.items.map((meal) => (
                    <div
                      key={meal.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {meal.description}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatTime(meal.consumed_at, timezone)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-2.5">
                          <span className="font-semibold text-slate-800">
                            {meal.calories} calories
                          </span>
                          <span className="text-blue-600 font-medium">
                            {meal.protein}g P
                          </span>
                          <span>{meal.carbs}g C</span>
                          <span>{meal.fat}g F</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => handleReuseMeal(meal)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer"
                        >
                          Log Again
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveToQuickAccess(meal)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                        >
                          + Quick
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditMeal(meal)}
                          className="px-2 py-1 text-slate-500 hover:text-blue-600 cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMeal(meal)}
                          className="px-2 py-1 text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

