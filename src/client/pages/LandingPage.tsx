import React from 'react';

interface LandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onLogin,
  onRegister,
}) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
              FL
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">
              FeedMe<span className="text-blue-600">Lean</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onLogin}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
            >
              Log In
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold shadow-xs transition cursor-pointer"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-4 pt-10 pb-12 sm:pt-16 sm:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            <div className="lg:col-span-7 space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                <span>100% Free</span>
                <span>·</span>
                <span>Target Body-Fat Percentage Tracker</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Stop guessing calories.{' '}
                <span className="text-blue-600">
                  Reach your exact target body-fat %.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
                FeedMeLean isn&rsquo;t another bloated food database. Set your current and target body-fat percentage—for example, going from{' '}
                <strong className="text-slate-900">22% to 12% body fat</strong>—and log meals in seconds using plain English.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onRegister}
                  className="py-3.5 px-7 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base shadow-sm transition cursor-pointer text-center"
                >
                  Create Free Account →
                </button>
                <button
                  type="button"
                  onClick={onLogin}
                  className="py-3.5 px-6 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-semibold text-base transition cursor-pointer text-center"
                >
                  Log In to Existing Account
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Completely free · No subscriptions · Works on iPhone, Android, and Desktop
              </p>
            </div>

            {/* Live Example Card Preview */}
            <div className="lg:col-span-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-md space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                      Example Goal Plan
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">
                      Your Goal: 12% Body Fat
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                    22% → 12% BF
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block">Current Weight</span>
                    <span className="text-sm font-bold text-slate-900">
                      179.0 lb (22% BF)
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block">Lean Body Mass</span>
                    <span className="text-sm font-bold text-slate-900">
                      139.6 lb
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                    <span className="text-blue-700 block">Target Weight</span>
                    <span className="text-sm font-bold text-blue-700">
                      158.7 lb (12% BF)
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block">Est. Fat to Lose</span>
                    <span className="text-sm font-bold text-blue-600">
                      20.3 lb
                    </span>
                  </div>
                </div>

                {/* Natural-Language Meal Example */}
                <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span>AI Natural-Language Meal Entry</span>
                    <span className="text-blue-400">Logged in 3 seconds</span>
                  </div>
                  <p className="text-xs text-slate-100 italic">
                    &ldquo;3 scrambled eggs, 2 slices toast with butter and coffee with milk&rdquo;
                  </p>
                  <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
                    <div className="bg-slate-800 rounded-lg py-1.5">
                      <div className="text-[10px] text-slate-400">Calories</div>
                      <div className="text-xs font-bold text-white">520</div>
                    </div>
                    <div className="bg-slate-800 rounded-lg py-1.5">
                      <div className="text-[10px] text-slate-400">Protein</div>
                      <div className="text-xs font-bold text-blue-400">27g</div>
                    </div>
                    <div className="bg-slate-800 rounded-lg py-1.5">
                      <div className="text-[10px] text-slate-400">Carbs</div>
                      <div className="text-xs font-bold text-white">39g</div>
                    </div>
                    <div className="bg-slate-800 rounded-lg py-1.5">
                      <div className="text-[10px] text-slate-400">Fat</div>
                      <div className="text-xs font-bold text-white">29g</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="bg-white border-y border-slate-200 py-12 sm:py-16">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                How FeedMeLean Works
              </h2>
              <p className="text-sm sm:text-base text-slate-600 mt-2">
                Designed around speed and body composition—so you spend less than 30 seconds a day logging food.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                  1
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Calculate Your Exact Goal
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Enter your stats and target body-fat percentage (or use the AI body-fat estimator). FeedMeLean computes your lean body mass, target weight, daily calorie deficit, protein requirement, and projected completion date.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                  2
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Log Meals in Plain English
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Type what you ate—or snap a photo—and tap <strong>Analyze</strong>. AI estimates calories, protein, carbs, and fat immediately. Save your go-to foods to <strong>Quick Access</strong> for 1-tap logging without re-analyzing.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                  3
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Track True Fat-Loss Trends
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  See exactly how many calories and grams of protein remain each day, and track your weight with a 7-day rolling average that filters out daily water fluctuations and updates your goal date.
                </p>
              </div>
            </div>

            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={onRegister}
                className="py-3.5 px-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-base shadow-sm transition cursor-pointer"
              >
                Start Tracking for Free →
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-50 py-6 border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} FeedMeLean. Built for effortless body-composition tracking.</span>
          <div className="flex items-center gap-4 font-semibold">
            <button
              type="button"
              onClick={onLogin}
              className="hover:text-blue-600 cursor-pointer"
            >
              Log In
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="hover:text-blue-600 cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
