import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { User, UserProfile } from '../../shared/types';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>
          ) => void;
        };
      };
    };
  }
}

interface AuthSuccessPayload {
  user: User;
  profile: UserProfile | null;
  latestWeightKg: number | null;
  initialWeightKg: number | null;
}

export const AuthPage: React.FC<{
  initialMode?: 'login' | 'register';
  onBackToLanding?: () => void;
  onAuthenticated: (payload: AuthSuccessPayload) => void;
}> = ({ initialMode = 'login', onBackToLanding, onAuthenticated }) => {
  const params = new URLSearchParams(window.location.search);
  const initialResetToken = params.get('reset_token') || '';

  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(
    initialResetToken ? 'reset' : initialMode
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiFetch<{ google_client_id: string | null }>('/api/auth/config')
      .then((cfg) => {
        if (cfg.google_client_id) {
          setGoogleClientId(cfg.google_client_id);
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!googleClientId || (mode !== 'login' && mode !== 'register')) return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response.credential) return;
          setLoading(true);
          setError(null);
          try {
            const detectedTz =
              Intl.DateTimeFormat().resolvedOptions().timeZone ||
              'America/New_York';
            const res = await apiFetch<AuthSuccessPayload>('/api/auth/google', {
              method: 'POST',
              body: JSON.stringify({
                credential: response.credential,
                timezone: detectedTz,
              }),
            });
            onAuthenticated(res);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Google sign-in failed.'
            );
          } finally {
            setLoading(false);
          }
        },
      });
      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
      });
    };

    if (window.google?.accounts?.id) {
      initGoogle();
      return;
    }

    const scriptId = 'google-gsi-client';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', initGoogle);
    }
  }, [googleClientId, mode, onAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const detectedTz =
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

      if (mode === 'login') {
        const res = await apiFetch<AuthSuccessPayload>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        onAuthenticated(res);
      } else if (mode === 'register') {
        const res = await apiFetch<AuthSuccessPayload>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, timezone: detectedTz }),
        });
        onAuthenticated(res);
      } else if (mode === 'forgot') {
        const res = await apiFetch<{
          ok: boolean;
          message: string;
          dev_reset_token?: string;
        }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        if (res.dev_reset_token) {
          setResetToken(res.dev_reset_token);
          setMode('reset');
          setInfo('Reset token generated. Enter your new password below.');
        } else {
          setInfo(res.message);
        }
      } else if (mode === 'reset') {
        await apiFetch('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, password }),
        });
        const me = await apiFetch<AuthSuccessPayload>('/api/auth/me');
        window.history.replaceState({}, '', '/');
        onAuthenticated(me);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-10">
      <div className="w-full max-w-sm mx-auto">
        {onBackToLanding && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onBackToLanding}
              className="text-xs font-semibold text-slate-600 hover:text-blue-600 cursor-pointer"
            >
              ← Back to FeedMeLean Home
            </button>
          </div>
        )}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl mx-auto mb-3 shadow-sm">
            FL
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            FeedMe<span className="text-blue-600">Lean</span>
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Reach your target body-fat percentage with effortless meal logging.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          {(mode === 'login' || mode === 'register') && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 text-sm font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 text-sm font-semibold rounded-lg transition cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium"
            >
              {error}
            </div>
          )}

          {info && (
            <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode !== 'reset' && (
              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            )}

            {mode === 'reset' && (
              <div>
                <label
                  htmlFor="auth-reset-token"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Reset Token
                </label>
                <input
                  id="auth-reset-token"
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste reset token"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            )}

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    {mode === 'reset' ? 'New Password' : 'Password'}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                        setInfo(null);
                      }}
                      className="text-xs text-blue-600 hover:underline font-medium cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 text-white font-semibold text-sm shadow-xs transition cursor-pointer"
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                ? 'Log In'
                : mode === 'register'
                ? 'Create Free Account'
                : mode === 'forgot'
                ? 'Send Reset Link'
                : 'Set New Password'}
            </button>
          </form>

          {googleClientId && (mode === 'login' || mode === 'register') && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div
                ref={googleBtnRef}
                className="flex justify-center overflow-hidden"
              />
            </div>
          )}

          {(mode === 'forgot' || mode === 'reset') && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setInfo(null);
              }}
              className="mt-4 w-full text-center text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              ← Back to Log In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

