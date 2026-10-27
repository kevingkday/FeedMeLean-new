import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { clearUserLocalCache } from '../lib/cache';
import {
  calculateGoalMetrics,
  cmToFeetInches,
  cmToInches,
  feetInchesToCm,
  inchesToCm,
  kgToLb,
  lbToKg,
  round1,
} from '../../shared/nutritionMath';
import type {
  ActivityLevel,
  BodyFatEstimateResult,
  Sex,
  SuggestedPlanResult,
  UnitSystem,
  User,
  UserProfile,
} from '../../shared/types';
import type { ToastMessage } from '../components/UndoToast';

interface SettingsPageProps {
  user: User;
  profile: UserProfile | null;
  onProfileUpdated: (profile: UserProfile) => void;
  onUserUpdated: (user: User) => void;
  onLoggedOut: () => void;
  onShowToast: (toast: ToastMessage) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  user,
  profile,
  onProfileUpdated,
  onUserUpdated,
  onLoggedOut,
  onShowToast,
}) => {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(
    profile?.unit_system || 'imperial'
  );
  const [age, setAge] = useState(String(profile?.age ?? 35));
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'male');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    profile?.activity_level ?? 'light'
  );

  // Height state
  const initFtIn = cmToFeetInches(profile?.height_cm ?? 177.8);
  const [heightFeet, setHeightFeet] = useState(String(initFtIn.feet));
  const [heightInches, setHeightInches] = useState(String(initFtIn.inches));
  const [heightCmInput, setHeightCmInput] = useState(
    String(round1(profile?.height_cm ?? 178))
  );

  // Weight state
  const [weightInput, setWeightInput] = useState(
    String(
      round1(
        (profile?.unit_system ?? 'imperial') === 'imperial'
          ? kgToLb(profile?.weight_kg ?? 81.19)
          : profile?.weight_kg ?? 81.2
      )
    )
  );

  // Body fat & targets
  const [currentBf, setCurrentBf] = useState(
    String(profile?.current_body_fat ?? 22)
  );
  const [targetBf, setTargetBf] = useState(String(profile?.target_body_fat ?? 12));
  const [calorieDeficit, setCalorieDeficit] = useState(
    String(profile?.calorie_deficit ?? 500)
  );
  const [proteinTarget, setProteinTarget] = useState(
    String(profile?.protein_target ?? 150)
  );
  const [timezone, setTimezone] = useState(
    profile?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'America/New_York'
  );

  // Optional circumference measurements for AI Body-Fat Estimator
  const [showBfEstimator, setShowBfEstimator] = useState(false);
  const [waistInput, setWaistInput] = useState(
    profile?.waist_cm
      ? String(
          round1(
            unitSystem === 'imperial'
              ? cmToInches(profile.waist_cm)
              : profile.waist_cm
          )
        )
      : ''
  );
  const [neckInput, setNeckInput] = useState(
    profile?.neck_cm
      ? String(
          round1(
            unitSystem === 'imperial' ? cmToInches(profile.neck_cm) : profile.neck_cm
          )
        )
      : ''
  );
  const [hipInput, setHipInput] = useState(
    profile?.hip_cm
      ? String(
          round1(
            unitSystem === 'imperial' ? cmToInches(profile.hip_cm) : profile.hip_cm
          )
        )
      : ''
  );
  const [bfNotes, setBfNotes] = useState('');
  const [estimatingBf, setEstimatingBf] = useState(false);
  const [bfResult, setBfResult] = useState<BodyFatEstimateResult | null>(null);

  // AI Suggest My Plan state
  const [suggestingPlan, setSuggestingPlan] = useState(false);
  const [planResult, setPlanResult] = useState<SuggestedPlanResult | null>(null);

  // Saving profile
  const [savingProfile, setSavingProfile] = useState(false);

  // Account management state
  const [accountEmail, setAccountEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setUnitSystem(profile.unit_system);
    setAge(String(profile.age ?? 35));
    setSex(profile.sex ?? 'male');
    setActivityLevel(profile.activity_level ?? 'light');
    const fi = cmToFeetInches(profile.height_cm ?? 177.8);
    setHeightFeet(String(fi.feet));
    setHeightInches(String(fi.inches));
    setHeightCmInput(String(round1(profile.height_cm ?? 178)));
    setWeightInput(
      String(
        round1(
          profile.unit_system === 'imperial'
            ? kgToLb(profile.weight_kg ?? 81.19)
            : profile.weight_kg ?? 81.2
        )
      )
    );
    setCurrentBf(String(profile.current_body_fat ?? 22));
    setTargetBf(String(profile.target_body_fat ?? 12));
    setCalorieDeficit(String(profile.calorie_deficit ?? 500));
    setProteinTarget(String(profile.protein_target ?? 150));
    setTimezone(profile.timezone || 'America/New_York');
  }, [profile]);

  const handleToggleUnitSystem = (nextUnit: UnitSystem) => {
    if (nextUnit === unitSystem) return;
    const currentW = parseFloat(weightInput) || 0;
    if (currentW > 0) {
      const converted =
        nextUnit === 'metric' ? lbToKg(currentW) : kgToLb(currentW);
      setWeightInput(String(round1(converted)));
    }
    if (nextUnit === 'metric') {
      const cm = feetInchesToCm(
        Number(heightFeet) || 5,
        Number(heightInches) || 10
      );
      setHeightCmInput(String(round1(cm)));
    } else {
      const fi = cmToFeetInches(Number(heightCmInput) || 178);
      setHeightFeet(String(fi.feet));
      setHeightInches(String(fi.inches));
    }
    setUnitSystem(nextUnit);
  };

  const resolvedHeightCm =
    unitSystem === 'imperial'
      ? feetInchesToCm(Number(heightFeet) || 5, Number(heightInches) || 10)
      : Number(heightCmInput) || 178;

  const resolvedWeightKg =
    unitSystem === 'imperial'
      ? lbToKg(Number(weightInput) || 179)
      : Number(weightInput) || 81.2;

  const previewMetrics = calculateGoalMetrics({
    unit_system: unitSystem,
    age: Number(age) || 35,
    sex,
    height_cm: resolvedHeightCm,
    weight_kg: resolvedWeightKg,
    activity_level: activityLevel,
    current_body_fat: Number(currentBf) || 22,
    target_body_fat: Number(targetBf) || 12,
    calorie_deficit: Number(calorieDeficit) || 500,
    protein_target: Number(proteinTarget) || 150,
  });

  const handleEstimateBodyFat = async () => {
    setEstimatingBf(true);
    try {
      const waistCm = waistInput
        ? unitSystem === 'imperial'
          ? inchesToCm(Number(waistInput))
          : Number(waistInput)
        : null;
      const neckCm = neckInput
        ? unitSystem === 'imperial'
          ? inchesToCm(Number(neckInput))
          : Number(neckInput)
        : null;
      const hipCm = hipInput
        ? unitSystem === 'imperial'
          ? inchesToCm(Number(hipInput))
          : Number(hipInput)
        : null;

      const res = await apiFetch<BodyFatEstimateResult>(
        '/api/profile/estimate-body-fat',
        {
          method: 'POST',
          body: JSON.stringify({
            age: Number(age) || 35,
            sex,
            height_cm: resolvedHeightCm,
            weight_kg: resolvedWeightKg,
            activity_level: activityLevel,
            waist_cm: waistCm,
            neck_cm: neckCm,
            hip_cm: hipCm,
            notes: bfNotes,
          }),
        }
      );
      setBfResult(res);
    } catch (err) {
      onShowToast({
        id: 'bf-err',
        text: err instanceof Error ? err.message : 'Failed to estimate body fat.',
      });
    } finally {
      setEstimatingBf(false);
    }
  };

  const handleSuggestPlan = async () => {
    setSuggestingPlan(true);
    try {
      const res = await apiFetch<SuggestedPlanResult>(
        '/api/profile/suggest-plan',
        {
          method: 'POST',
          body: JSON.stringify({
            age: Number(age) || 35,
            sex,
            height_cm: resolvedHeightCm,
            weight_kg: resolvedWeightKg,
            activity_level: activityLevel,
            current_body_fat: Number(currentBf) || 22,
            target_body_fat: Number(targetBf) || 12,
            unit_system: unitSystem,
          }),
        }
      );
      setPlanResult(res);
    } catch (err) {
      onShowToast({
        id: 'plan-err',
        text: err instanceof Error ? err.message : 'Failed to suggest plan.',
      });
    } finally {
      setSuggestingPlan(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);

    try {
      const waistCm = waistInput
        ? unitSystem === 'imperial'
          ? inchesToCm(Number(waistInput))
          : Number(waistInput)
        : null;
      const neckCm = neckInput
        ? unitSystem === 'imperial'
          ? inchesToCm(Number(neckInput))
          : Number(neckInput)
        : null;
      const hipCm = hipInput
        ? unitSystem === 'imperial'
          ? inchesToCm(Number(hipInput))
          : Number(hipInput)
        : null;

      const res = await apiFetch<{ profile: UserProfile }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          unit_system: unitSystem,
          age: Number(age) || 35,
          sex,
          height_cm: resolvedHeightCm,
          weight_kg: resolvedWeightKg,
          waist_cm: waistCm,
          neck_cm: neckCm,
          hip_cm: hipCm,
          activity_level: activityLevel,
          current_body_fat: Number(currentBf) || 22,
          target_body_fat: Number(targetBf) || 12,
          calorie_deficit: Number(calorieDeficit) || 500,
          protein_target: Number(proteinTarget) || 150,
          timezone,
        }),
      });

      onProfileUpdated(res.profile);
      onShowToast({
        id: 'profile-saved',
        text: 'Body composition and nutrition targets saved!',
      });
    } catch (err) {
      onShowToast({
        id: 'profile-err',
        text: err instanceof Error ? err.message : 'Failed to save profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccount(true);
    try {
      const res = await apiFetch<{ ok: boolean; email: string }>(
        '/api/auth/account',
        {
          method: 'PUT',
          body: JSON.stringify({
            email: accountEmail,
            current_password: currentPassword || undefined,
            new_password: newPassword || undefined,
          }),
        }
      );
      onUserUpdated({ ...user, email: res.email });
      setCurrentPassword('');
      setNewPassword('');
      onShowToast({ id: 'acc-saved', text: 'Account settings updated.' });
    } catch (err) {
      onShowToast({
        id: 'acc-err',
        text: err instanceof Error ? err.message : 'Failed to update account.',
      });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    onLoggedOut();
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await apiFetch('/api/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      clearUserLocalCache(user.id);
      onLoggedOut();
    } catch (err) {
      onShowToast({
        id: 'del-err',
        text: err instanceof Error ? err.message : 'Could not delete account.',
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  const weightUnitLabel = unitSystem === 'imperial' ? 'lb' : 'kg';
  const lengthUnitLabel = unitSystem === 'imperial' ? 'in' : 'cm';

  return (
    <div className="space-y-6">
      {/* Body Composition & Nutrition Targets Form */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Body Composition & Goal Settings
            </h1>
            <p className="text-xs text-slate-500">
              Configure your measurements and target body-fat percentage
            </p>
          </div>

          {/* Unit System Toggle */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => handleToggleUnitSystem('imperial')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                unitSystem === 'imperial'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              Imperial (lb, ft/in)
            </button>
            <button
              type="button"
              onClick={() => handleToggleUnitSystem('metric')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                unitSystem === 'metric'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              Metric (kg, cm)
            </button>
          </div>
        </div>

        {/* Basic Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Age
            </label>
            <input
              type="number"
              min={13}
              max={110}
              required
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sex
            </label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          {unitSystem === 'imperial' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Height (ft / in)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  min={3}
                  max={8}
                  value={heightFeet}
                  onChange={(e) => setHeightFeet(e.target.value)}
                  placeholder="ft"
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  max={11}
                  value={heightInches}
                  onChange={(e) => setHeightInches(e.target.value)}
                  placeholder="in"
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Height (cm)
              </label>
              <input
                type="number"
                min={100}
                max={250}
                step="0.5"
                value={heightCmInput}
                onChange={(e) => setHeightCmInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current Weight ({weightUnitLabel})
            </label>
            <input
              type="number"
              min={30}
              max={700}
              step="0.1"
              required
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
            />
          </div>
        </div>

        {/* Activity Level */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Activity Level
          </label>
          <select
            value={activityLevel}
            onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
          >
            <option value="sedentary">Sedentary — Desk job, little or no exercise (1.2x)</option>
            <option value="light">Lightly Active — Light exercise 1–3 days/week (1.375x)</option>
            <option value="moderate">Moderately Active — Exercise 3–5 days/week (1.55x)</option>
            <option value="active">Active — Hard exercise 6–7 days/week (1.725x)</option>
            <option value="very_active">Very Active — Physical job or 2x/day training (1.9x)</option>
          </select>
        </div>

        {/* Body Fat Percentage Inputs + AI Estimator Toggle */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">
              Body-Fat Percentage Goal
            </span>
            <button
              type="button"
              onClick={() => setShowBfEstimator((v) => !v)}
              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              {showBfEstimator ? 'Hide AI Estimator' : 'Not sure? Estimate with AI'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Current Body Fat (%)
              </label>
              <input
                type="number"
                min={3}
                max={70}
                step="0.5"
                required
                value={currentBf}
                onChange={(e) => setCurrentBf(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1">
                Target Body Fat (%)
              </label>
              <input
                type="number"
                min={3}
                max={60}
                step="0.5"
                required
                value={targetBf}
                onChange={(e) => setTargetBf(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-blue-300 bg-white text-sm font-bold text-blue-700"
              />
            </div>
          </div>

          {showBfEstimator && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <p className="text-xs text-slate-600">
                Height, weight, age, and sex alone cannot determine body-fat percentage accurately. Adding optional waist and neck circumference measurements significantly improves estimation accuracy.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Waist ({lengthUnitLabel}, at navel)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    placeholder="Optional"
                    value={waistInput}
                    onChange={(e) => setWaistInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Neck ({lengthUnitLabel})
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    placeholder="Optional"
                    value={neckInput}
                    onChange={(e) => setNeckInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                {sex === 'female' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Hip ({lengthUnitLabel}, widest)
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      placeholder="Optional"
                      value={hipInput}
                      onChange={(e) => setHipInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Optional Training / Physique Context
                </label>
                <input
                  type="text"
                  placeholder="e.g., Lift weights 3x/week, visible upper abs, carry weight in midsection"
                  value={bfNotes}
                  onChange={(e) => setBfNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                />
              </div>

              <button
                type="button"
                onClick={handleEstimateBodyFat}
                disabled={estimatingBf}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                {estimatingBf ? 'Estimating...' : 'Estimate Current Body Fat'}
              </button>

              {bfResult && (
                <div className="p-3 rounded-xl bg-white border border-blue-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-600">
                        AI Approximate Estimate:{' '}
                      </span>
                      <span className="text-base font-bold text-blue-600">
                        {bfResult.estimated_body_fat}%
                      </span>
                      <span className="text-xs text-slate-500 ml-1">
                        (Range: {bfResult.range_low}%–{bfResult.range_high}%)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentBf(String(bfResult.estimated_body_fat))}
                      className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      Use {bfResult.estimated_body_fat}%
                    </button>
                  </div>
                  <p className="text-xs text-slate-700">{bfResult.explanation}</p>
                  <p className="text-[11px] text-slate-500 italic">{bfResult.disclaimer}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live Goal Calculations Preview */}
        <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Calculated Goal & Calorie Requirements
              </h3>
              <p className="text-[11px] text-slate-500">
                Assumes constant lean body mass ({previewMetrics.leanBodyMassDisplay}{' '}
                {weightUnitLabel})
              </p>
            </div>
            <button
              type="button"
              onClick={handleSuggestPlan}
              disabled={suggestingPlan}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
            >
              {suggestingPlan ? 'Generating Plan...' : '✨ Suggest My Plan'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <div className="text-[11px] text-slate-500">Lean Body Mass</div>
              <div className="text-sm font-bold text-slate-900">
                {previewMetrics.leanBodyMassDisplay} {weightUnitLabel}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <div className="text-[11px] text-slate-500">Target Weight</div>
              <div className="text-sm font-bold text-slate-900">
                {previewMetrics.targetWeightDisplay} {weightUnitLabel}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <div className="text-[11px] text-slate-500">Fat to Lose</div>
              <div className="text-sm font-bold text-blue-600">
                {previewMetrics.fatToLoseDisplay} {weightUnitLabel}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-white border border-slate-200">
              <div className="text-[11px] text-slate-500">Est. TDEE</div>
              <div className="text-sm font-bold text-slate-900">
                {previewMetrics.tdee.toLocaleString()} cal
              </div>
            </div>
          </div>

          {/* AI Suggested Plan Card */}
          {planResult && (
            <div className="p-3.5 rounded-xl bg-white border border-blue-300 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    AI Recommended Plan
                  </span>
                  <p className="text-xs text-slate-700 mt-0.5">{planResult.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCalorieDeficit(String(planResult.recommended_deficit));
                    setProteinTarget(String(planResult.recommended_protein_g));
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 cursor-pointer"
                >
                  Apply Plan
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg">
                <div>
                  <span className="text-slate-500 block">Daily Deficit</span>
                  <span className="font-bold text-slate-900">
                    {planResult.recommended_deficit} kcal
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Daily Calories</span>
                  <span className="font-bold text-slate-900">
                    {planResult.recommended_calories.toLocaleString()} kcal
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Daily Protein</span>
                  <span className="font-bold text-blue-600">
                    {planResult.recommended_protein_g}g
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Est. Weekly Loss</span>
                  <span className="font-bold text-slate-900">
                    {unitSystem === 'imperial'
                      ? `${planResult.expected_weekly_loss_lb} lb/wk`
                      : `${planResult.expected_weekly_loss_kg} kg/wk`}{' '}
                    (~{planResult.estimated_weeks} wks)
                  </span>
                </div>
              </div>

              <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                {planResult.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Deficit, Protein, and Timezone Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Daily Calorie Deficit (kcal)
            </label>
            <input
              type="number"
              min={0}
              max={1500}
              step={25}
              value={calorieDeficit}
              onChange={(e) => setCalorieDeficit(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
            />
            <span className="text-[11px] text-slate-500">
              Daily Target: {previewMetrics.dailyCalorieTarget.toLocaleString()} kcal/day
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Daily Protein Target (g)
            </label>
            <input
              type="number"
              min={40}
              max={400}
              step={5}
              value={proteinTarget}
              onChange={(e) => setProteinTarget(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold"
            />
            <span className="text-[11px] text-slate-500">
              Carbs: {previewMetrics.carbsTarget}g · Fat: {previewMetrics.fatTarget}g
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Timezone
            </label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>
        </div>

        {previewMetrics.safetyWarning && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium"
          >
            ⚠️ {previewMetrics.safetyWarning}
          </div>
        )}

        <button
          type="submit"
          disabled={savingProfile}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xs transition cursor-pointer"
        >
          {savingProfile ? 'Saving Settings...' : 'Save Body Composition & Targets'}
        </button>
      </form>

      {/* Account Settings Card */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Account Settings</h2>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3.5 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            Log Out
          </button>
        </div>

        <form onSubmit={handleSaveAccount} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Current Password (to change password)
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Leave blank to keep current"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingAccount}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            {savingAccount ? 'Updating...' : 'Update Account'}
          </button>
        </form>

        {/* Delete Account Section */}
        <div className="pt-4 border-t border-slate-200">
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
            >
              Delete Account and All Personal Data
            </button>
          ) : (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-2.5">
              <p className="text-xs font-semibold text-red-800">
                Permanently delete your account, profile, weight history, and all logged meals? This action cannot be undone.
              </p>
              <input
                type="password"
                placeholder="Confirm your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full sm:w-64 px-3 py-1.5 rounded-lg border border-red-300 bg-white text-xs"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deletingAccount}
                  onClick={handleDeleteAccount}
                  className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {deletingAccount ? 'Deleting...' : 'Permanently Delete My Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

