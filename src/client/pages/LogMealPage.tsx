import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  addRecentDescription,
  getCachedSavedMeals,
  getRecentDescriptions,
  setCachedSavedMeals,
} from '../lib/cache';
import type {
  AnalyzedMealResult,
  GoalMetrics,
  MealLog,
  SavedMeal,
  User,
} from '../../shared/types';
import type { ToastMessage } from '../components/UndoToast';

interface LogMealPageProps {
  user: User;
  goalMetrics: GoalMetrics;
  todayTotals: { calories: number; protein: number; carbs: number; fat: number };
  recentMeals: MealLog[];
  onMealLogged: (meal: MealLog) => void;
  onMealDeleted: (mealId: string, meal: MealLog) => void;
  onShowToast: (toast: ToastMessage) => void;
  onNavigateToday: () => void;
}

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export const LogMealPage: React.FC<LogMealPageProps> = ({
  user,
  goalMetrics,
  todayTotals,
  recentMeals,
  onMealLogged,
  onMealDeleted,
  onShowToast,
  onNavigateToday,
}) => {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [description, setDescription] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analyzed meal state
  const [analyzed, setAnalyzed] = useState<AnalyzedMealResult | null>(null);
  const [isEditingMacros, setIsEditingMacros] = useState(false);
  const [editCalories, setEditCalories] = useState(0);
  const [editProtein, setEditProtein] = useState(0);
  const [editCarbs, setEditCarbs] = useState(0);
  const [editFat, setEditFat] = useState(0);

  // Custom timestamp toggle
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [customDateTime, setCustomDateTime] = useState(() =>
    toLocalDateTimeInputValue(new Date())
  );

  // Quick Access Saved Meals
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>(() =>
    getCachedSavedMeals(user.id)
  );
  const [savingToQuick, setSavingToQuick] = useState(false);
  const [savedToQuickSuccess, setSavedToQuickSuccess] = useState(false);
  const [loggingSavedId, setLoggingSavedId] = useState<string | null>(null);

  // Inline Quick Access editor
  const [editingSavedMeal, setEditingSavedMeal] = useState<SavedMeal | null>(null);
  const [showNewSavedModal, setShowNewSavedModal] = useState(false);
  const [savedFormName, setSavedFormName] = useState('');
  const [savedFormCalories, setSavedFormCalories] = useState('');
  const [savedFormProtein, setSavedFormProtein] = useState('');
  const [savedFormCarbs, setSavedFormCarbs] = useState('');
  const [savedFormFat, setSavedFormFat] = useState('');

  // Recent meal descriptions
  const [recentDescriptions, setRecentDescriptions] = useState<string[]>(() =>
    getRecentDescriptions(user.id)
  );

  useEffect(() => {
    let active = true;
    apiFetch<{ saved_meals: SavedMeal[] }>('/api/saved-meals')
      .then((res) => {
        if (!active) return;
        setSavedMeals(res.saved_meals);
        setCachedSavedMeals(user.id, res.saved_meals);
      })
      .catch(() => {
        // Offline fallback uses cached saved meals
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 768;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.78);
          setImageDataUrl(compressed);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async (customText?: string) => {
    const textToAnalyze = (customText ?? description).trim();
    if ((!textToAnalyze && !imageDataUrl) || analyzing) return;

    setError(null);
    setAnalyzing(true);
    setSavedToQuickSuccess(false);

    try {
      const result = await apiFetch<AnalyzedMealResult>('/api/meals/analyze', {
        method: 'POST',
        body: JSON.stringify({
          description: textToAnalyze,
          image_data_url: imageDataUrl || undefined,
        }),
      });

      if (!textToAnalyze && result.description) {
        setDescription(result.description);
      }
      setAnalyzed(result);
      setEditCalories(result.calories);
      setEditProtein(result.protein);
      setEditCarbs(result.carbs);
      setEditFat(result.fat);
      setIsEditingMacros(false);

      if (textToAnalyze || result.description) {
        const updatedRecent = addRecentDescription(
          user.id,
          textToAnalyze || result.description
        );
        setRecentDescriptions(updatedRecent);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to analyze meal. Please try again.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleLogAnalyzedMeal = async () => {
    if (!analyzed || logging) return;
    setLogging(true);
    setError(null);

    try {
      const consumedAtIso = showCustomTime
        ? new Date(customDateTime).toISOString()
        : new Date().toISOString();

      const res = await apiFetch<{ meal: MealLog }>('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          description: description.trim() || analyzed.description,
          calories: editCalories,
          protein: editProtein,
          carbs: editCarbs,
          fat: editFat,
          consumed_at: consumedAtIso,
        }),
      });

      const loggedMeal = res.meal;
      onMealLogged(loggedMeal);

      // Reset form & keep user on screen
      setDescription('');
      setImageDataUrl(null);
      setAnalyzed(null);
      setIsEditingMacros(false);
      setShowCustomTime(false);
      setSavedToQuickSuccess(false);

      onShowToast({
        id: loggedMeal.id,
        text: `Logged "${loggedMeal.description}" (${loggedMeal.calories} cal)`,
        undoLabel: 'Undo',
        onUndo: async () => {
          await apiFetch(`/api/meals/${loggedMeal.id}`, { method: 'DELETE' }).catch(
            () => null
          );
          onMealDeleted(loggedMeal.id, loggedMeal);
        },
      });

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to log meal. Check your connection and try again.'
      );
    } finally {
      setLogging(false);
    }
  };

  const handleSaveAnalyzedToQuickAccess = async () => {
    if (!analyzed || savingToQuick || savedToQuickSuccess) return;
    setSavingToQuick(true);
    try {
      const mealName = (description.trim() || analyzed.description).slice(0, 60);
      const res = await apiFetch<{ saved_meal: SavedMeal }>('/api/saved-meals', {
        method: 'POST',
        body: JSON.stringify({
          name: mealName,
          description: description.trim() || analyzed.description,
          calories: editCalories,
          protein: editProtein,
          carbs: editCarbs,
          fat: editFat,
        }),
      });

      const nextList = [res.saved_meal, ...savedMeals];
      setSavedMeals(nextList);
      setCachedSavedMeals(user.id, nextList);
      setSavedToQuickSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save to Quick Access.');
    } finally {
      setSavingToQuick(false);
    }
  };

  const handleQuickLogSavedMeal = async (saved: SavedMeal) => {
    if (loggingSavedId) return;
    setLoggingSavedId(saved.id);
    setError(null);

    try {
      const consumedAtIso = showCustomTime
        ? new Date(customDateTime).toISOString()
        : new Date().toISOString();

      const res = await apiFetch<{ meal: MealLog; saved_meal: SavedMeal }>(
        `/api/saved-meals/${saved.id}/log`,
        {
          method: 'POST',
          body: JSON.stringify({ consumed_at: consumedAtIso }),
        }
      );

      onMealLogged(res.meal);

      // Update saved meals sorting by frequency & recency
      const updatedList = savedMeals
        .map((m) => (m.id === saved.id ? res.saved_meal : m))
        .sort((a, b) => {
          if (b.use_count !== a.use_count) return b.use_count - a.use_count;
          return (b.last_used_at || '').localeCompare(a.last_used_at || '');
        });

      setSavedMeals(updatedList);
      setCachedSavedMeals(user.id, updatedList);

      onShowToast({
        id: res.meal.id,
        text: `Logged "${saved.name}" (${saved.calories} cal)`,
        undoLabel: 'Undo',
        onUndo: async () => {
          await apiFetch(`/api/meals/${res.meal.id}`, { method: 'DELETE' }).catch(
            () => null
          );
          onMealDeleted(res.meal.id, res.meal);
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not log meal. Please check your connection.'
      );
    } finally {
      setLoggingSavedId(null);
    }
  };

  const handleQuickLogRecentMeal = async (recent: MealLog) => {
    if (logging) return;
    setLogging(true);
    setError(null);
    try {
      const res = await apiFetch<{ meal: MealLog }>('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          description: recent.description,
          calories: recent.calories,
          protein: recent.protein,
          carbs: recent.carbs,
          fat: recent.fat,
          consumed_at: new Date().toISOString(),
        }),
      });
      onMealLogged(res.meal);
      onShowToast({
        id: res.meal.id,
        text: `Logged "${res.meal.description}" (${res.meal.calories} cal)`,
        undoLabel: 'Undo',
        onUndo: async () => {
          await apiFetch(`/api/meals/${res.meal.id}`, { method: 'DELETE' }).catch(
            () => null
          );
          onMealDeleted(res.meal.id, res.meal);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log recent meal.');
    } finally {
      setLogging(false);
    }
  };

  const openEditSavedMeal = (meal: SavedMeal) => {
    setEditingSavedMeal(meal);
    setShowNewSavedModal(false);
    setSavedFormName(meal.name);
    setSavedFormCalories(String(meal.calories));
    setSavedFormProtein(String(meal.protein));
    setSavedFormCarbs(String(meal.carbs));
    setSavedFormFat(String(meal.fat));
  };

  const openNewSavedMeal = () => {
    setEditingSavedMeal(null);
    setShowNewSavedModal(true);
    setSavedFormName('');
    setSavedFormCalories('');
    setSavedFormProtein('');
    setSavedFormCarbs('');
    setSavedFormFat('');
  };

  const handleSaveQuickAccessModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!savedFormName.trim()) return;

    try {
      if (editingSavedMeal) {
        const res = await apiFetch<{ saved_meal: SavedMeal }>(
          `/api/saved-meals/${editingSavedMeal.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              name: savedFormName.trim(),
              description: savedFormName.trim(),
              calories: Number(savedFormCalories) || 0,
              protein: Number(savedFormProtein) || 0,
              carbs: Number(savedFormCarbs) || 0,
              fat: Number(savedFormFat) || 0,
            }),
          }
        );
        const next = savedMeals.map((m) =>
          m.id === editingSavedMeal.id ? res.saved_meal : m
        );
        setSavedMeals(next);
        setCachedSavedMeals(user.id, next);
        setEditingSavedMeal(null);
      } else {
        const res = await apiFetch<{ saved_meal: SavedMeal }>('/api/saved-meals', {
          method: 'POST',
          body: JSON.stringify({
            name: savedFormName.trim(),
            description: savedFormName.trim(),
            calories: Number(savedFormCalories) || 0,
            protein: Number(savedFormProtein) || 0,
            carbs: Number(savedFormCarbs) || 0,
            fat: Number(savedFormFat) || 0,
          }),
        });
        const next = [res.saved_meal, ...savedMeals];
        setSavedMeals(next);
        setCachedSavedMeals(user.id, next);
        setShowNewSavedModal(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Quick Access meal.');
    }
  };

  const handleDeleteSavedMeal = async (id: string) => {
    try {
      await apiFetch(`/api/saved-meals/${id}`, { method: 'DELETE' });
      const next = savedMeals.filter((m) => m.id !== id);
      setSavedMeals(next);
      setCachedSavedMeals(user.id, next);
      if (editingSavedMeal?.id === id) setEditingSavedMeal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete saved meal.');
    }
  };

  const calDiff = goalMetrics.dailyCalorieTarget - todayTotals.calories;
  const proteinDiff = goalMetrics.proteinTarget - Math.round(todayTotals.protein);

  return (
    <div className="space-y-5">
      {/* Compact Today's Remaining Status Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs sm:text-sm">
          <div>
            <span className="text-slate-500 font-medium">Today: </span>
            <span className="font-bold text-slate-900">
              {todayTotals.calories.toLocaleString()}
            </span>
            <span className="text-slate-400">
              {' '}
              / {goalMetrics.dailyCalorieTarget.toLocaleString()} cal
            </span>
            <span
              className={`ml-1.5 font-semibold ${
                calDiff >= 0 ? 'text-blue-600' : 'text-amber-600'
              }`}
            >
              (
              {calDiff >= 0
                ? `${calDiff.toLocaleString()} left`
                : `${Math.abs(calDiff).toLocaleString()} over`}
              )
            </span>
          </div>
          <div className="hidden sm:block h-4 w-px bg-slate-200" />
          <div className="hidden sm:block">
            <span className="text-slate-500 font-medium">Protein: </span>
            <span className="font-bold text-slate-900">
              {Math.round(todayTotals.protein)}g
            </span>
            <span className="text-slate-400"> / {goalMetrics.proteinTarget}g</span>
            <span className="ml-1.5 font-semibold text-blue-600">
              ({proteinDiff >= 0 ? `${proteinDiff}g left` : `${Math.abs(proteinDiff)}g over`})
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onNavigateToday}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 shrink-0 cursor-pointer"
        >
          Full Day →
        </button>
      </div>

      {/* Primary Natural-Language Meal Entry Card */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="meal-description-input"
            className="text-base font-bold text-slate-900"
          >
            What did you eat?
          </label>
          <button
            type="button"
            onClick={() => {
              setShowCustomTime((v) => !v);
              if (!showCustomTime) {
                setCustomDateTime(toLocalDateTimeInputValue(new Date()));
              }
            }}
            className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
          >
            {showCustomTime ? 'Use current time' : 'Change date/time'}
          </button>
        </div>

        {showCustomTime && (
          <div className="mb-3">
            <label
              htmlFor="meal-datetime-input"
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Meal Date & Time
            </label>
            <input
              id="meal-datetime-input"
              type="datetime-local"
              value={customDateTime}
              onChange={(e) => setCustomDateTime(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        )}

        <textarea
          id="meal-description-input"
          ref={inputRef}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAnalyze();
            }
          }}
          placeholder="e.g., 3 scrambled eggs, 2 slices toast with butter and coffee with milk"
          className="w-full p-3.5 rounded-xl border border-slate-300 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 resize-none"
        />

        {imageDataUrl && (
          <div className="mt-2.5 flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-200">
            <img
              src={imageDataUrl}
              alt="Meal preview"
              className="w-12 h-12 rounded-lg object-cover border border-slate-300"
            />
            <span className="text-xs text-slate-600 flex-1">
              Photo attached for AI analysis
            </span>
            <button
              type="button"
              onClick={() => setImageDataUrl(null)}
              className="text-xs font-semibold text-red-600 hover:underline px-2 cursor-pointer"
            >
              Remove
            </button>
          </div>
        )}

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoSelected}
          className="hidden"
        />

        {error && (
          <div
            role="alert"
            className="mt-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium"
          >
            {error}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAnalyze()}
            disabled={(!description.trim() && !imageDataUrl) || analyzing}
            className="flex-1 py-3.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-semibold text-base shadow-xs transition cursor-pointer"
          >
            {analyzing ? 'Analyzing Meal...' : 'Analyze Meal'}
          </button>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            title="Attach or take a photo of your meal"
            className="py-3.5 px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-medium cursor-pointer"
          >
            📷 Photo
          </button>
          {(description || imageDataUrl) && (
            <button
              type="button"
              onClick={() => {
                setDescription('');
                setImageDataUrl(null);
                setAnalyzed(null);
                setError(null);
                inputRef.current?.focus();
              }}
              className="py-3.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Instant Analysis Result & 1-Tap Log Panel */}
        {analyzed && (
          <div className="mt-4 pt-4 border-t border-slate-200 animate-fadeIn">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {description.trim() || analyzed.description}
                </p>
                {analyzed.clarification_needed && (
                  <p className="text-xs text-amber-700 mt-0.5">
                    Note: {analyzed.clarification_needed}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsEditingMacros((v) => !v)}
                className="text-xs font-semibold text-blue-600 hover:underline shrink-0 cursor-pointer"
              >
                {isEditingMacros ? 'Done Editing' : 'Edit Values'}
              </button>
            </div>

            {!isEditingMacros ? (
              <div className="grid grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-center">
                <div>
                  <div className="text-xs text-slate-500 font-medium">Calories</div>
                  <div className="text-lg font-bold text-slate-900">{editCalories}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">Protein</div>
                  <div className="text-lg font-bold text-blue-600">{editProtein}g</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">Carbs</div>
                  <div className="text-lg font-bold text-slate-800">{editCarbs}g</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-medium">Fat</div>
                  <div className="text-lg font-bold text-slate-800">{editFat}g</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Calories
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editCalories}
                    onChange={(e) => setEditCalories(Math.max(0, Number(e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Protein (g)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={editProtein}
                    onChange={(e) => setEditProtein(Math.max(0, Number(e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={editCarbs}
                    onChange={(e) => setEditCarbs(Math.max(0, Number(e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={editFat}
                    onChange={(e) => setEditFat(Math.max(0, Number(e.target.value)))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleLogAnalyzedMeal}
                disabled={logging}
                className="flex-1 py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold text-base shadow-sm transition cursor-pointer"
              >
                {logging ? 'Logging...' : 'Log Meal'}
              </button>
              <button
                type="button"
                onClick={handleSaveAnalyzedToQuickAccess}
                disabled={savingToQuick || savedToQuickSuccess}
                className="py-3.5 px-4 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-sm transition cursor-pointer"
              >
                {savedToQuickSuccess
                  ? '✓ Saved to Quick Access'
                  : savingToQuick
                  ? 'Saving...'
                  : 'Save to Quick Access'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Quick Access Meals Section (Directly below meal entry) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Quick Access</h2>
            <p className="text-xs text-slate-500">
              Tap Log to add directly to today without re-analyzing
            </p>
          </div>
          <button
            type="button"
            onClick={openNewSavedMeal}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
          >
            + Add Meal
          </button>
        </div>

        {(editingSavedMeal || showNewSavedModal) && (
          <form
            onSubmit={handleSaveQuickAccessModal}
            className="mb-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                {editingSavedMeal ? 'Edit Quick Access Meal' : 'New Quick Access Meal'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingSavedMeal(null);
                  setShowNewSavedModal(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <div>
              <input
                type="text"
                required
                placeholder="Meal name (e.g., 1 scoop whey protein)"
                value={savedFormName}
                onChange={(e) => setSavedFormName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Calories</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={savedFormCalories}
                  onChange={(e) => setSavedFormCalories(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Protein (g)</label>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.5"
                  value={savedFormProtein}
                  onChange={(e) => setSavedFormProtein(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Carbs (g)</label>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.5"
                  value={savedFormCarbs}
                  onChange={(e) => setSavedFormCarbs(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-0.5">Fat (g)</label>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.5"
                  value={savedFormFat}
                  onChange={(e) => setSavedFormFat(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              {editingSavedMeal ? (
                <button
                  type="button"
                  onClick={() => handleDeleteSavedMeal(editingSavedMeal.id)}
                  className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                >
                  Delete Meal
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
              >
                Save Quick Meal
              </button>
            </div>
          </form>
        )}

        {savedMeals.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">
            No saved meals yet. Analyze a meal above and tap &ldquo;Save to Quick Access&rdquo;.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {savedMeals.map((meal) => (
              <div
                key={meal.id}
                className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {meal.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => openEditSavedMeal(meal)}
                      className="text-[11px] text-slate-400 hover:text-blue-600 font-medium shrink-0 cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="font-semibold text-slate-800">
                      {meal.calories} cal
                    </span>
                    <span className="text-blue-600 font-medium">{meal.protein}g P</span>
                    <span>{meal.carbs}g C</span>
                    <span>{meal.fat}g F</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={loggingSavedId === meal.id}
                  onClick={() => handleQuickLogSavedMeal(meal)}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 text-white font-semibold text-sm shrink-0 shadow-xs transition cursor-pointer"
                >
                  {loggingSavedId === meal.id ? '...' : 'Log'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Meals & Recent Searches */}
      {(recentMeals.length > 0 || recentDescriptions.length > 0) && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          {recentMeals.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-2">Recent Logged Meals</h2>
              <div className="divide-y divide-slate-100">
                {recentMeals.slice(0, 5).map((m) => (
                  <div
                    key={m.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {m.description}
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.calories} cal · {m.protein}g P · {m.carbs}g C · {m.fat}g F
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickLogRecentMeal(m)}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-800 font-semibold text-xs shrink-0 transition cursor-pointer"
                    >
                      Log Again
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentDescriptions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Recent Descriptions
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {recentDescriptions.map((desc) => (
                  <button
                    key={desc}
                    type="button"
                    onClick={() => {
                      setDescription(desc);
                      handleAnalyze(desc);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 truncate max-w-xs cursor-pointer"
                  >
                    {desc}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

