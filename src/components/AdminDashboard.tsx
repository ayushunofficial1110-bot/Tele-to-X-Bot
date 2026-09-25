import React, { useState, useEffect } from 'react';
import {
  Shield,
  Send,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  ExternalLink,
  Bot,
  Zap,
  Lock,
  LogOut,
  Power,
  Clock,
  Radio,
} from 'lucide-react';
import { SystemStats, OtherBot, SystemLog } from '../types.ts';

interface AdminDashboardProps {
  onSignOut?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const [adminKey, setAdminKey] = useState<string>(() => sessionStorage.getItem('x2tg_admin_key') || '');
  const [keyInput, setKeyInput] = useState('');
  const [isAuthed, setIsAuthed] = useState<boolean>(() => Boolean(sessionStorage.getItem('x2tg_admin_key')));
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [otherBots, setOtherBots] = useState<OtherBot[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'success'>('all');

  // Broadcast state
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastBtnText, setBroadcastBtnText] = useState('');
  const [broadcastBtnUrl, setBroadcastBtnUrl] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  // Telegram Config state
  const [hasTelegramToken, setHasTelegramToken] = useState(false);
  const [configuredBotUsername, setConfiguredBotUsername] = useState('');
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<any>(null);
  const [isTokenUnauthorized, setIsTokenUnauthorized] = useState(false);
  const [isAiStudio, setIsAiStudio] = useState(false);

  // Other Bot Modal
  const [showBotModal, setShowBotModal] = useState(false);
  const [editingBot, setEditingBot] = useState<OtherBot | null>(null);
  const [botFormName, setBotFormName] = useState('');
  const [botFormUsername, setBotFormUsername] = useState('');
  const [botFormDesc, setBotFormDesc] = useState('');
  const [botFormCategory, setBotFormCategory] = useState('Utilities');
  const [botFormUrl, setBotFormUrl] = useState('');
  const [botFormIcon, setBotFormIcon] = useState('🤖');
  const [botFormBadge, setBotFormBadge] = useState('');
  const [botFormEnabled, setBotFormEnabled] = useState(true);
  const [botFormOrder, setBotFormOrder] = useState(1);

  useEffect(() => {
    if (isAuthed && adminKey) {
      loadAllAdminData();
    }
  }, [isAuthed, adminKey]);

  const loadAllAdminData = () => {
    fetchStats();
    fetchOtherBots();
    fetchSystemLogs();
    fetchSettings();
  };

  const handleVerifyKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setIsVerifying(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/admin/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: keyInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminKey(keyInput.trim());
        setIsAuthed(true);
        sessionStorage.setItem('x2tg_admin_key', keyInput.trim());
      } else {
        setAuthError(data.error || 'Invalid ADMIN_KEY. Please verify the key configured on your server.');
      }
    } catch {
      setAuthError('Connection failed while validating ADMIN_KEY.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSignOutAdmin = () => {
    sessionStorage.removeItem('x2tg_admin_key');
    setAdminKey('');
    setIsAuthed(false);
    setStats(null);
    setOtherBots([]);
    setSystemLogs([]);
  };

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'x-admin-key': adminKey,
  });

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats', { headers: getHeaders() });
      if (res.status === 401) {
        handleSignOutAdmin();
        return;
      }
      const data = await res.json();
      if (data.ok) setStats(data.stats);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchOtherBots = async () => {
    try {
      const res = await fetch('/api/admin/other-bots', { headers: getHeaders() });
      const data = await res.json();
      if (data.ok) setOtherBots(data.bots);
    } catch (err) {
      console.error('Failed to fetch other bots:', err);
    }
  };

  const fetchSystemLogs = async () => {
    try {
      const res = await fetch('/api/admin/logs?limit=100', { headers: getHeaders() });
      const data = await res.json();
      if (data.ok) setSystemLogs(data.logs);
    } catch (err) {
      console.error('Failed to fetch system logs:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings', { headers: getHeaders() });
      const data = await res.json();
      if (data.ok && data.settings) {
        setHasTelegramToken(Boolean(data.settings.hasTelegramToken));
        setConfiguredBotUsername(data.settings.botUsername || '');
        setIsTokenUnauthorized(Boolean(data.settings.isTokenUnauthorized));
        setIsAiStudio(Boolean(data.settings.isAiStudio));
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    setIsBroadcasting(true);
    setBroadcastResult(null);

    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          text: broadcastText,
          buttonText: broadcastBtnText || undefined,
          buttonUrl: broadcastBtnUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBroadcastResult(`Broadcast dispatched to ${data.result.sent}/${data.result.total} registered users successfully.`);
        setBroadcastText('');
        fetchSystemLogs();
        fetchStats();
      } else {
        setBroadcastResult(`Error: ${data.error}`);
      }
    } catch {
      setBroadcastResult('Failed to dispatch broadcast.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    setTelegramStatus(null);
    try {
      const res = await fetch('/api/admin/telegram-test', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setTelegramStatus(data);
      if (data.ok) {
        setIsTokenUnauthorized(false);
        fetchSettings();
        fetchSystemLogs();
      } else {
        if (data.error?.includes('401') || data.error?.toLowerCase().includes('unauthorized')) {
          setIsTokenUnauthorized(true);
        }
      }
    } catch {
      setTelegramStatus({ ok: false, error: 'Connection check failed' });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleSaveBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botFormName || !botFormUsername) return;

    try {
      if (editingBot) {
        await fetch(`/api/admin/other-bots/${editingBot.id}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            name: botFormName,
            username: botFormUsername,
            description: botFormDesc,
            category: botFormCategory,
            url: botFormUrl,
            icon: botFormIcon,
            badge: botFormBadge || undefined,
            enabled: botFormEnabled,
            order: botFormOrder,
          }),
        });
      } else {
        await fetch('/api/admin/other-bots', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            name: botFormName,
            username: botFormUsername,
            description: botFormDesc,
            category: botFormCategory,
            url: botFormUrl,
            icon: botFormIcon,
            badge: botFormBadge || undefined,
            enabled: botFormEnabled,
            order: botFormOrder,
          }),
        });
      }

      setShowBotModal(false);
      setEditingBot(null);
      fetchOtherBots();
    } catch (err) {
      console.error('Failed to save bot:', err);
    }
  };

  const handleToggleBotStatus = async (b: OtherBot) => {
    try {
      await fetch(`/api/admin/other-bots/${b.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ enabled: !b.enabled }),
      });
      fetchOtherBots();
    } catch (err) {
      console.error('Failed to toggle bot:', err);
    }
  };

  const handleDeleteBot = async (id: string) => {
    if (!confirm('Remove this bot from the directory?')) return;
    try {
      await fetch(`/api/admin/other-bots/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      fetchOtherBots();
    } catch (err) {
      console.error('Failed to delete bot:', err);
    }
  };

  const openAddBot = () => {
    setEditingBot(null);
    setBotFormName('');
    setBotFormUsername('');
    setBotFormDesc('');
    setBotFormCategory('Productivity');
    setBotFormUrl('');
    setBotFormIcon('🤖');
    setBotFormBadge('');
    setBotFormEnabled(true);
    setBotFormOrder(otherBots.length + 1);
    setShowBotModal(true);
  };

  const openEditBot = (b: OtherBot) => {
    setEditingBot(b);
    setBotFormName(b.name);
    setBotFormUsername(b.username);
    setBotFormDesc(b.description);
    setBotFormCategory(b.category);
    setBotFormUrl(b.url);
    setBotFormIcon(b.icon);
    setBotFormBadge(b.badge || '');
    setBotFormEnabled(b.enabled);
    setBotFormOrder(b.order);
    setShowBotModal(true);
  };

  // --- Render Authentication Wall if Not Logged In ---
  if (!isAuthed) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5 text-indigo-400">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Admin Portal Authentication</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            This protected dashboard gives access to system-level telemetry, global broadcasts, bot configuration, and system logs.
          </p>

          <form onSubmit={handleVerifyKey} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Enter ADMIN_KEY
              </label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Configured ADMIN_KEY..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                required
                autoFocus
              />
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition flex items-center justify-center space-x-2"
            >
              {isVerifying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Unlock Admin Dashboard</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800 text-[11px] text-slate-500 text-center">
            Enter the <code className="text-slate-400 font-mono">ADMIN_KEY</code> secret configured in your server environment variables.
          </div>
        </div>
      </div>
    );
  }

  const filteredLogs = systemLogs.filter((l) => logFilter === 'all' || l.level === logFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-indigo-400">
            <Shield className="w-5 h-5" />
            <h2 className="text-xl font-bold text-white tracking-tight">System Operations & Admin Console</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            System-level monitoring, global user broadcast, and dynamic Other Bots directory management.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadAllAdminData}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleSignOutAdmin}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Lock Admin</span>
          </button>
        </div>
      </div>

      {/* 1. Real System Performance Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-slate-400 font-medium">Total Registered Users</span>
          <div className="text-2xl font-bold text-white mt-1">{stats?.totalUsers ?? 0}</div>
          <span className="text-[10px] text-sky-400">Via /start in Telegram</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-slate-400 font-medium">Active Users</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{stats?.activeUsers ?? 0}</div>
          <span className="text-[10px] text-slate-500">Active within 30d</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-slate-400 font-medium">New Users (24h / 7d)</span>
          <div className="text-2xl font-bold text-indigo-400 mt-1">
            {stats?.newUsers24h ?? 0} <span className="text-sm font-normal text-slate-400">/ {stats?.newUsers7d ?? 0}</span>
          </div>
          <span className="text-[10px] text-slate-500">Real-time growth</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-slate-400 font-medium">Total Automations</span>
          <div className="text-2xl font-bold text-amber-400 mt-1">{stats?.totalAutomations ?? 0}</div>
          <span className="text-[10px] text-emerald-400">{stats?.activeAutomations ?? 0} Active Bridges</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-slate-400 font-medium">Published Posts</span>
          <div className="text-2xl font-bold text-sky-400 mt-1">{stats?.postsProcessed ?? 0}</div>
          <span className="text-[10px] text-rose-400">{stats?.failedPosts ?? 0} failed deliveries</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <span className="text-[11px] text-slate-400 font-medium">Spam & Ads Blocked</span>
          <div className="text-2xl font-bold text-purple-400 mt-1">{stats?.adFilteredPosts ?? 0}</div>
          <span className="text-[10px] text-slate-500">By AI & link heuristics</span>
        </div>
      </div>

      {/* 2. Broadcast Tool & Other Bots Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Global Broadcast Announcement */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center space-x-2 text-indigo-400 mb-4">
            <Send className="w-4 h-4" />
            <h3 className="text-sm font-bold text-white">Broadcast Announcement to All Users</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Sends an instant markdown message with optional inline button to every registered Telegram user.
          </p>

          <form onSubmit={handleSendBroadcast} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Message Text (Markdown)</label>
              <textarea
                rows={3}
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="🚀 System Update: Enhanced character limit support and new AI models are now active!"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Inline Button Label (Optional)</label>
                <input
                  type="text"
                  value={broadcastBtnText}
                  onChange={(e) => setBroadcastBtnText(e.target.value)}
                  placeholder="e.g. Open Dashboard"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Inline Button URL (Optional)</label>
                <input
                  type="url"
                  value={broadcastBtnUrl}
                  onChange={(e) => setBroadcastBtnUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isBroadcasting || !broadcastText.trim()}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition flex items-center justify-center space-x-2"
            >
              {isBroadcasting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Broadcast Now</span>
                </>
              )}
            </button>

            {broadcastResult && (
              <div className="p-3 rounded-xl bg-slate-950 border border-indigo-500/30 text-indigo-300 text-xs">
                {broadcastResult}
              </div>
            )}
          </form>
        </div>

        {/* Dynamic Other Bots Directory Manager */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2 text-indigo-400">
              <Bot className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Other Bots Directory</h3>
            </div>
            <button
              onClick={openAddBot}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Bot</span>
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Manage recommended partner bots shown to users in the Telegram bot menu (/otherbots) and Web Dashboard.
          </p>

          {otherBots.length === 0 ? (
            <div className="text-center py-10 bg-slate-950/60 rounded-2xl border border-dashed border-slate-800 p-6">
              <Bot className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-400">No partner bots configured yet</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Click "Add Bot" above to add tools that your users can discover.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {otherBots.map((bot) => (
                <div
                  key={bot.id}
                  className={`p-3.5 rounded-2xl border transition flex items-center justify-between ${
                    bot.enabled
                      ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                      : 'bg-slate-950/30 border-slate-800/40 opacity-60'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="text-xl flex-shrink-0">{bot.icon || '🤖'}</span>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white truncate">{bot.name}</span>
                        <span className="text-[10px] text-sky-400 font-mono">{bot.username}</span>
                        {bot.badge && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded font-bold">
                            {bot.badge}
                          </span>
                        )}
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                            bot.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {bot.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{bot.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 ml-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggleBotStatus(bot)}
                      title={bot.enabled ? 'Disable Bot' : 'Enable Bot'}
                      className={`p-1.5 rounded-lg border transition ${
                        bot.enabled
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-slate-500'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEditBot(bot)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteBot(bot.id)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Telegram Bot Gateway Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Radio className="w-4 h-4" />
            <h3 className="text-sm font-bold text-white">Telegram Gateway & Long Polling Status</h3>
          </div>
          {isTokenUnauthorized ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <AlertTriangle className="w-3 h-3" />
              <span>Token Unauthorized (401)</span>
            </span>
          ) : isAiStudio ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <CheckCircle2 className="w-3 h-3" />
              <span>AI Studio Mode (Polling Stopped to Protect Render)</span>
            </span>
          ) : hasTelegramToken ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              <span>Configured in Environment</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="w-3 h-3" />
              <span>Missing TELEGRAM_BOT_TOKEN</span>
            </span>
          )}
        </div>

        {isAiStudio && (
          <div className="mb-4 p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs flex items-start space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">AI Gemini Studio Safe Mode:</span> Telegram bot long-polling is intentionally stopped in this preview environment to prevent 409 conflict errors with your live bot running on Render. Your live production bot runs 24/7 on Render without interruptions.
            </div>
          </div>
        )}

        {isTokenUnauthorized && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Telegram Token Revoked or Invalid (HTTP 401):</span> The token provided in <code className="bg-rose-950/80 px-1 py-0.5 rounded font-mono text-white">TELEGRAM_BOT_TOKEN</code> was rejected by the Telegram Bot API. Verify or regenerate your token in <span className="font-semibold text-white">@BotFather</span> and update the environment variable on Render.
            </div>
          </div>
        )}

        <div className="bg-slate-950 rounded-2xl border border-slate-800/80 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-300">Active Bot:</span>
              <span className="text-xs font-mono text-sky-400 font-bold">
                {configuredBotUsername ? `@${configuredBotUsername}` : 'Pending connection verification'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Operating mode: <span className="text-emerald-400 font-semibold">{isAiStudio ? 'Stopped in AI Studio (Active on Render)' : 'Long Polling Only'}</span> (zero webhooks, self-contained single-process worker).
            </p>
          </div>

          <button
            onClick={handleTestTelegram}
            disabled={isTestingTelegram}
            className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold whitespace-nowrap flex items-center justify-center space-x-2 transition-colors"
          >
            {isTestingTelegram ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Checking Telegram API...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verify Bot Connection</span>
              </>
            )}
          </button>
        </div>

        {telegramStatus && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            {telegramStatus.ok ? (
              <div className="text-emerald-400 space-y-1">
                <div className="font-bold flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Telegram Bot Connected: @{telegramStatus.botInfo?.username}</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  ID: {telegramStatus.botInfo?.id} • Name: {telegramStatus.botInfo?.first_name}
                </div>
              </div>
            ) : (
              <div className="text-rose-400 font-semibold flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>{telegramStatus.error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Real-time System Event Logs */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Sliders className="w-4 h-4" />
            <h3 className="text-sm font-bold text-white">System Logs</h3>
          </div>

          <div className="flex items-center space-x-2">
            {(['all', 'info', 'warn', 'error', 'success'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLogFilter(lvl)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase transition ${
                  logFilter === lvl
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-slate-950 rounded-2xl border border-slate-800/80 p-4 font-mono text-xs max-h-72 overflow-y-auto space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-600 text-center py-6">No matching system logs recorded.</div>
          ) : (
            filteredLogs.map((log) => {
              const color =
                log.level === 'error'
                  ? 'text-rose-400'
                  : log.level === 'warn'
                  ? 'text-amber-400'
                  : log.level === 'success'
                  ? 'text-emerald-400'
                  : 'text-slate-300';
              return (
                <div key={log.id} className="flex items-start space-x-2 border-b border-slate-900 pb-1.5">
                  <span className="text-slate-500 text-[10px] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-indigo-400 text-[10px] uppercase font-bold">[{log.source}]</span>
                  <span className={`${color} flex-1`}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Other Bot Add/Edit Modal */}
      {showBotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">
              {editingBot ? 'Edit Recommended Bot' : 'Add Partner Bot'}
            </h3>

            <form onSubmit={handleSaveBot} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-300 mb-1">Bot Name</label>
                  <input
                    type="text"
                    value={botFormName}
                    onChange={(e) => setBotFormName(e.target.value)}
                    placeholder="e.g. Crypto Whale Alerts"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Icon (Emoji)</label>
                  <input
                    type="text"
                    value={botFormIcon}
                    onChange={(e) => setBotFormIcon(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white text-center"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Telegram @Username</label>
                <input
                  type="text"
                  value={botFormUsername}
                  onChange={(e) => setBotFormUsername(e.target.value)}
                  placeholder="@WhaleAlertBot"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Short Description</label>
                <textarea
                  rows={2}
                  value={botFormDesc}
                  onChange={(e) => setBotFormDesc(e.target.value)}
                  placeholder="Real-time notifications for large blockchain transactions..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Category</label>
                  <select
                    value={botFormCategory}
                    onChange={(e) => setBotFormCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Utilities">Utilities</option>
                    <option value="Crypto & Web3">Crypto & Web3</option>
                    <option value="AI Tools">AI Tools</option>
                    <option value="Productivity">Productivity</option>
                    <option value="News & Media">News & Media</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Badge (Optional)</label>
                  <input
                    type="text"
                    value={botFormBadge}
                    onChange={(e) => setBotFormBadge(e.target.value)}
                    placeholder="e.g. HOT, NEW, PRO"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-300 font-semibold">Enable in Bot & Dashboard</span>
                <input
                  type="checkbox"
                  checked={botFormEnabled}
                  onChange={(e) => setBotFormEnabled(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBotModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/20"
                >
                  Save Bot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
