export type UnitSystem = 'imperial' | 'metric';
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'disabled';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
}

export interface UserProfile {
  user_id: string;
  age: number | null;
  sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  neck_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  activity_level: ActivityLevel;
  current_body_fat: number | null;
  target_body_fat: number | null;
  calorie_deficit: number;
  protein_target: number;
  carbs_target: number | null;
  fat_target: number | null;
  unit_system: UnitSystem;
  timezone: string;
  preferences: string;
  updated_at: string;
}

export interface MealLog {
  id: string;
  user_id: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  consumed_at: string;
  local_date: string;
  created_at: string;
  updated_at: string;
}

export interface SavedMeal {
  id: string;
  user_id: string;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

export interface WeightLog {
  id: string;
  user_id: string;
  weight_kg: number;
  measured_at: string;
  created_at: string;
}

export interface WeightPointWithRolling extends WeightLog {
  rolling_avg_kg: number;
}

export interface AnalyzedMealResult {
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  clarification_needed?: string | null;
  cached?: boolean;
}

export interface BodyFatEstimateResult {
  estimated_body_fat: number;
  range_low: number;
  range_high: number;
  navy_formula_estimate: number | null;
  explanation: string;
  disclaimer: string;
}

export interface SuggestedPlanResult {
  recommended_deficit: number;
  recommended_calories: number;
  recommended_protein_g: number;
  expected_weekly_loss_lb: number;
  expected_weekly_loss_kg: number;
  estimated_weeks: number;
  estimated_goal_date: string;
  recommendations: string[];
  summary: string;
}

export interface GoalMetrics {
  isComplete: boolean;
  currentWeightKg: number;
  currentWeightDisplay: number;
  currentBodyFat: number;
  targetBodyFat: number;
  leanBodyMassKg: number;
  leanBodyMassDisplay: number;
  targetWeightKg: number;
  targetWeightDisplay: number;
  fatToLoseKg: number;
  fatToLoseDisplay: number;
  bmr: number;
  tdee: number;
  dailyCalorieTarget: number;
  dailyDeficit: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  plannedWeeklyLossKg: number;
  plannedWeeklyLossDisplay: number;
  daysToGoal: number | null;
  estimatedGoalDate: string | null;
  progressPercent: number;
  safetyWarning: string | null;
}

