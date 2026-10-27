import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { kgToLb, lbToKg, round1 } from '../../shared/nutritionMath';
import type {
  GoalMetrics,
  UnitSystem,
  WeightLog,
  WeightPointWithRolling,
} from '../../shared/types';
import type { ToastMessage } from '../components/UndoToast';

interface ProgressPageProps {
  unitSystem: UnitSystem;
  goalMetrics: GoalMetrics;
  onWeightUpdated: (latestWeightKg: number, initialWeightKg?: number) => void;
  onNavigateLogMeal: () => void;
  onNavigateSettings: () => void;
  onShowToast: (toast: ToastMessage) => void;
}

function formatGoalDate(isoDate: string | null): string {
  if (!isoDate) return 'Configure deficit in Settings';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const ProgressPage: React.FC<ProgressPageProps> = ({
  unitSystem,
  goalMetrics,
  onWeightUpdated,
  onNavigateLogMeal,
  onNavigateSettings,
  onShowToast,
}) => {
  const unitLabel = unitSystem === 'imperial' ? 'lb' : 'kg';

  const [points, setPoints] = useState<WeightPointWithRolling[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<number | null>(null);
  const [weightInput, setWeightInput] = useState(
    String(goalMetrics.currentWeightDisplay)
  );
  const [weightDate, setWeightDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [savingWeight, setSavingWeight] = useState(false);

  const loadWeights = async () => {
    try {
      const res = await apiFetch<{
        weight_logs: WeightLog[];
        weight_points: WeightPointWithRolling[];
        weekly_trend_display: number | null;
      }>('/api/profile/weights');
      setPoints(res.weight_points);
      setWeeklyTrend(res.weekly_trend_display);

      if (res.weight_points.length > 0) {
        const latest = res.weight_points[res.weight_points.length - 1];
        const first = res.weight_points[0];
        onWeightUpdated(latest.weight_kg, first.weight_kg);
      }
    } catch {
      // Ignore network error
    }
  };

  useEffect(() => {
    loadWeights();
  }, [unitSystem]);

  useEffect(() => {
    setWeightInput(String(goalMetrics.currentWeightDisplay));
  }, [goalMetrics.currentWeightDisplay]);

  const handleLogWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(weightInput);
    if (!val || val <= 0 || savingWeight) return;

    setSavingWeight(true);
    try {
      const weightKg = unitSystem === 'imperial' ? lbToKg(val) : val;
      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      const measuredAt =
        weightDate === todayIso
          ? now.toISOString()
          : new Date(`${weightDate}T12:00:00Z`).toISOString();

      await apiFetch('/api/profile/weights', {
        method: 'POST',
        body: JSON.stringify({
          weight_kg: weightKg,
          measured_at: measuredAt,
        }),
      });

      await loadWeights();
      onShowToast({
        id: 'weight-logged',
        text: `Recorded weight: ${round1(val)} ${unitLabel}`,
      });
    } catch (err) {
      onShowToast({
        id: 'weight-err',
        text: err instanceof Error ? err.message : 'Could not save weight.',
      });
    } finally {
      setSavingWeight(false);
    }
  };

  const handleDeleteWeight = async (id: string) => {
    try {
      await apiFetch(`/api/profile/weights/${id}`, { method: 'DELETE' });
      await loadWeights();
    } catch {
      onShowToast({ id: 'err', text: 'Failed to delete weight log.' });
    }
  };

  const displayPoints = points.map((p) => ({
    ...p,
    rawDisplay: round1(unitSystem === 'imperial' ? kgToLb(p.weight_kg) : p.weight_kg),
    rollingDisplay: round1(
      unitSystem === 'imperial' ? kgToLb(p.rolling_avg_kg) : p.rolling_avg_kg
    ),
  }));

  // SVG Chart dimensions
  const chartW = 600;
  const chartH = 190;
  const padX = 36;
  const padY = 20;

  const allValues = [
    ...displayPoints.map((d) => d.rawDisplay),
    ...displayPoints.map((d) => d.rollingDisplay),
    goalMetrics.targetWeightDisplay,
  ];
  const minVal = Math.floor(Math.min(...allValues) - 2);
  const maxVal = Math.ceil(Math.max(...allValues) + 2);
  const valSpan = Math.max(4, maxVal - minVal);

  const toX = (idx: number, total: number) => {
    if (total <= 1) return chartW / 2;
    return padX + (idx / (total - 1)) * (chartW - padX * 2);
  };
  const toY = (v: number) =>
    chartH - padY - ((v - minVal) / valSpan) * (chartH - padY * 2);

  const rollingPath =
    displayPoints.length > 1
      ? displayPoints
          .map(
            (pt, i) =>
              `${i === 0 ? 'M' : 'L'} ${toX(i, displayPoints.length).toFixed(1)} ${toY(
                pt.rollingDisplay
              ).toFixed(1)}`
          )
          .join(' ')
      : '';

  const targetLineY = toY(goalMetrics.targetWeightDisplay);

  const effectiveTrend =
    weeklyTrend !== null ? weeklyTrend : -goalMetrics.plannedWeeklyLossDisplay;

  return (
    <div className="space-y-5">
      {/* Top Goal Card */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Body Composition Goal
            </p>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
              Your Goal: {goalMetrics.targetBodyFat}% Body Fat
            </h1>
          </div>
          <button
            type="button"
            onClick={onNavigateSettings}
            className="text-xs font-semibold text-blue-600 hover:underline shrink-0 cursor-pointer"
          >
            Edit Goal →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">Current body fat</div>
            <div className="text-lg font-bold text-slate-900">
              {goalMetrics.currentBodyFat}%
            </div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
            <div className="text-xs text-blue-700">Target body fat</div>
            <div className="text-lg font-bold text-blue-700">
              {goalMetrics.targetBodyFat}%
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">Current weight</div>
            <div className="text-lg font-bold text-slate-900">
              {goalMetrics.currentWeightDisplay} {unitLabel}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">Target weight</div>
            <div className="text-lg font-bold text-slate-900">
              {goalMetrics.targetWeightDisplay} {unitLabel}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">Estimated fat to lose</div>
            <div className="text-lg font-bold text-blue-600">
              {goalMetrics.fatToLoseDisplay} {unitLabel}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">Lean body mass</div>
            <div className="text-lg font-bold text-slate-900">
              {goalMetrics.leanBodyMassDisplay} {unitLabel}
            </div>
          </div>
        </div>

        {/* Estimated Goal Date Banner */}
        <div className="p-4 rounded-xl bg-blue-600 text-white mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-blue-100 font-semibold">
              Estimated Goal Date
            </div>
            <div className="text-xl font-bold">
              {formatGoalDate(goalMetrics.estimatedGoalDate)}
            </div>
            <div className="text-xs text-blue-100 mt-0.5">
              Projection based on your {goalMetrics.dailyDeficit} kcal/day deficit (
              {goalMetrics.daysToGoal ?? 0} days remaining)
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateLogMeal}
            className="px-5 py-2.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-sm shrink-0 shadow-xs transition cursor-pointer"
          >
            + Log Meal
          </button>
        </div>

        {/* Targets & Trend Row */}
        <div className="grid grid-cols-3 gap-3 text-center py-3 px-2 rounded-xl bg-slate-50 border border-slate-200 mb-4">
          <div>
            <div className="text-xs text-slate-500">Daily calorie target</div>
            <div className="text-base font-bold text-slate-900">
              {goalMetrics.dailyCalorieTarget.toLocaleString()}
            </div>
          </div>
          <div className="border-x border-slate-200">
            <div className="text-xs text-slate-500">Protein target</div>
            <div className="text-base font-bold text-blue-600">
              {goalMetrics.proteinTarget}g
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Weekly weight trend</div>
            <div className="text-base font-bold text-slate-900">
              {effectiveTrend > 0 ? `+${effectiveTrend}` : effectiveTrend} {unitLabel}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
            <span>Progress toward target weight ({goalMetrics.targetWeightDisplay} {unitLabel})</span>
            <span className="text-blue-600">{goalMetrics.progressPercent}%</span>
          </div>
          <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all"
              style={{ width: `${goalMetrics.progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Note: Target weight and fat-to-lose calculations assume your lean body mass (
            {goalMetrics.leanBodyMassDisplay} {unitLabel}) remains constant through adequate protein intake.
          </p>
        </div>
      </section>

      {/* Weight Tracking Section */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Weight Tracking</h2>
          <p className="text-xs text-slate-500">
            We use a 7-day rolling average to smooth out daily water fluctuations. Short-term weight shifts are not treated as immediate changes in body fat.
          </p>
        </div>

        <form
          onSubmit={handleLogWeight}
          className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200"
        >
          <div className="flex-1">
            <label
              htmlFor="weight-entry-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Weight ({unitLabel})
            </label>
            <input
              id="weight-entry-input"
              type="number"
              step="0.1"
              min="30"
              max="700"
              required
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
            />
          </div>
          <div>
            <label
              htmlFor="weight-date-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Date
            </label>
            <input
              id="weight-date-input"
              type="date"
              value={weightDate}
              onChange={(e) => setWeightDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={savingWeight}
            className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm cursor-pointer"
          >
            {savingWeight ? 'Saving...' : 'Record Weight'}
          </button>
        </form>

        {/* Simple SVG Weight History & Rolling Average Chart */}
        {displayPoints.length > 0 && (
          <div className="border border-slate-200 rounded-xl p-3 bg-white">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 font-medium text-blue-600">
                  <span className="w-2.5 h-0.5 bg-blue-600 inline-block" /> 7-Day Rolling Avg
                </span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> Daily Weigh-In
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <span className="w-2.5 h-0.5 bg-emerald-500 inline-block" /> Target ({goalMetrics.targetWeightDisplay} {unitLabel})
                </span>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="w-full h-44 overflow-visible"
              role="img"
              aria-label="Weight history chart"
            >
              {/* Target Weight Dashed Line */}
              <line
                x1={padX}
                y1={targetLineY}
                x2={chartW - padX}
                y2={targetLineY}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text
                x={chartW - padX}
                y={Math.max(12, targetLineY - 5)}
                textAnchor="end"
                className="text-[10px] fill-emerald-600 font-semibold"
              >
                Target: {goalMetrics.targetWeightDisplay} {unitLabel}
              </text>

              {/* Rolling Average Line */}
              {rollingPath && (
                <path
                  d={rollingPath}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Daily Weight Dots */}
              {displayPoints.map((pt, i) => {
                const cx = toX(i, displayPoints.length);
                const cy = toY(pt.rawDisplay);
                return (
                  <g key={pt.id}>
                    <circle cx={cx} cy={cy} r={3.5} fill="#94a3b8" />
                    {(i === 0 || i === displayPoints.length - 1) && (
                      <text
                        x={cx}
                        y={Math.max(12, cy - 8)}
                        textAnchor={i === 0 ? 'start' : 'end'}
                        className="text-[11px] fill-slate-700 font-semibold"
                      >
                        {pt.rawDisplay} {unitLabel}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Recent Weight Log Entries */}
        {displayPoints.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Recent Weigh-Ins
            </h3>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-3.5 max-h-52 overflow-y-auto">
              {[...displayPoints]
                .reverse()
                .slice(0, 10)
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="py-2.5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">
                        {entry.rawDisplay} {unitLabel}
                      </span>
                      <span className="text-slate-500 ml-2">
                        (7d avg: {entry.rollingDisplay} {unitLabel})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">
                        {entry.measured_at.slice(0, 10)}
                      </span>
                      {displayPoints.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteWeight(entry.id)}
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

