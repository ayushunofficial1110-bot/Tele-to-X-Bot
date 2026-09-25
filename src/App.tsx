import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { UserDashboard } from './components/UserDashboard.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { GuideModal } from './components/GuideModal.tsx';
import { BotUser, Automation } from './types.ts';
import { Send, Key, ArrowRight, Shield, Sparkles, CheckCircle2, UserCheck, Bot } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'admin'>('dashboard');
  const [currentUser, setCurrentUser] = useState<BotUser | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [botUsername, setBotUsername] = useState<string>('');

  // Login / Registration Form State
  const [handleInput, setHandleInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Initial Auth Check and Public Bot Info
  useEffect(() => {
    checkInitialAuth();
    fetch('/api/telegram/info')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.botUsername) {
          setBotUsername(data.botUsername);
        }
      })
      .catch(() => {});
  }, []);

  // When currentUser changes, reload their isolated automations
  useEffect(() => {
    if (currentUser?.id) {
      fetchAutomations(currentUser.id);
    } else {
      setAutomations([]);
    }
  }, [currentUser?.id]);

  const checkInitialAuth = async () => {
    try {
      // 1. Check URL parameters for token or userId
      const params = new URLSearchParams(window.location.search);
      const tokenFromUrl = params.get('auth_token') || params.get('token');
      const userIdFromUrl = params.get('user_id') || params.get('userId');

      let tokenToTry = tokenFromUrl || localStorage.getItem('x2tg_auth_token');

      if (tokenToTry || userIdFromUrl) {
        const res = await fetch('/api/user/auth-by-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenToTry, telegramId: userIdFromUrl }),
        });
        const data = await res.json();
        if (data.ok && data.user) {
          setCurrentUser(data.user);
          localStorage.setItem('x2tg_auth_token', data.user.authToken);
          setLoading(false);
          return;
        }
      }

      // If no valid saved session, let user authenticate or launch simulator
    } catch (err) {
      console.error('Initial auth check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAutomations = async (userId: string) => {
    try {
      const res = await fetch(`/api/user/automations?userId=${userId}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.automations)) {
        setAutomations(data.automations);
      }
    } catch (err) {
      console.error('Failed to load automations:', err);
    }
  };

  const handleLoginOrRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleInput.trim()) return;

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/user/auth-by-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: handleInput.trim(),
          username: handleInput.trim(),
          telegramId: handleInput.trim(),
        }),
      });
      const data = await res.json();

      if (data.ok && data.user) {
        setCurrentUser(data.user);
        localStorage.setItem('x2tg_auth_token', data.user.authToken);
        setShowLoginModal(false);
        setActiveTab('dashboard');
      } else {
        setLoginError(
          'Account not found. Please message your Telegram bot and send /start to receive your secure dashboard login link.'
        );
      }
    } catch {
      setLoginError('Connection error during authentication.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('x2tg_auth_token');
    setCurrentUser(null);
    setAutomations([]);
    setActiveTab('dashboard');
  };

  const handleRefresh = () => {
    if (currentUser) {
      fetchAutomations(currentUser.id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-mono">Initializing SaaS Engine...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenLogin={() => setShowLoginModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* If user is not logged in and not on admin tab, show login gateway */}
        {!currentUser && activeTab !== 'admin' ? (
          <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="text-center mb-10 space-y-3">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Multi-User Autonomous SaaS Engine</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                X ↔ Telegram Autonomous Cross-Posting Bot
              </h1>
              <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                Connect your X accounts and Telegram channels with AI fact-preserving rewrites, automated ad detection, and complete multi-user tenant isolation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Option A: Telegram /start Auth */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-xl">
                <div>
                  <div className="w-12 h-12 bg-sky-500/10 border border-sky-500/20 rounded-2xl flex items-center justify-center text-sky-400 mb-4">
                    <Send className="w-6 h-6 -rotate-12" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">Automatic Telegram Registration</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    The relationship is strictly User ↔ Bot. No admin approval required. Send <code className="text-sky-300 font-mono">/start</code> to create your isolated account instantly.
                  </p>

                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Open Telegram and message our bot</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Send <strong>/start</strong> to get your secure dashboard link</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Configure your sources and destinations directly</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-800">
                  {botUsername ? (
                    <a
                      href={`https://t.me/${botUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-sky-600/20 transition flex items-center justify-center space-x-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>Open Bot on Telegram (@{botUsername})</span>
                    </a>
                  ) : (
                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-center">
                      <p className="text-xs text-slate-300 font-medium">
                        Open Telegram and send <code className="text-sky-300 font-mono">/start</code> to your bot
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Option B: Enter Handle or Token */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-xl">
                <div>
                  <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400 mb-4">
                    <Key className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">Web Access Gateway</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    Enter your Telegram handle or authorization token to access your isolated automations dashboard.
                  </p>

                  <form onSubmit={handleLoginOrRegister} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Telegram Handle or Token
                      </label>
                      <input
                        type="text"
                        value={handleInput}
                        onChange={(e) => setHandleInput(e.target.value)}
                        placeholder="@username or token..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 font-mono"
                        required
                      />
                    </div>

                    {loginError && (
                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px]">
                        {loginError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoggingIn || !handleInput.trim()}
                      className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-2"
                    >
                      <UserCheck className="w-4 h-4 text-sky-400" />
                      <span>{isLoggingIn ? 'Verifying...' : 'Enter Dashboard'}</span>
                    </button>
                  </form>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>System administrator?</span>
                  <button
                    onClick={() => setActiveTab('admin')}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
                  >
                    <span>Admin Panel</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && currentUser && (
              <UserDashboard
                currentUser={currentUser}
                automations={automations}
                onRefresh={handleRefresh}
              />
            )}

            {activeTab === 'admin' && <AdminDashboard />}
          </>
        )}
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Log in to Isolated Account</h3>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLoginOrRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Telegram Username (@handle) or Token
                </label>
                <input
                  type="text"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  placeholder="@my_channel_owner"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 font-mono"
                  required
                  autoFocus
                />
              </div>

              {loginError && (
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {loginError}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md shadow-sky-600/20"
                >
                  {isLoggingIn ? 'Authenticating...' : 'Enter Dashboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
