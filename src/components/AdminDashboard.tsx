import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Send,
  Radio,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  ExternalLink,
  Bot,
  Flame,
  Check,
  Zap,
} from 'lucide-react';
import { SystemStats, OtherBot, SystemLog } from '../types.ts';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [otherBots, setOtherBots] = useState<OtherBot[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);

  // Broadcast state
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastBtnText, setBroadcastBtnText] = useState('');
  const [broadcastBtnUrl, setBroadcastBtnUrl] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  // Telegram Config state
  const [botToken, setBotToken] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<any>(null);

  // Other Bot Modal
  const [showBotModal, setShowBotModal] = useState(false);
  const [editingBot, setEditingBot] = useState<OtherBot | null>(null);
  const [botFormName, setBotFormName] = useState('');
  const [botFormUsername, setBotFormUsername] = useState('');
  const [botFormDesc, setBotFormDesc] = useState('');
  const [botFormCategory, setBotFormCategory] = useState('Utilities');
  const [botFormUrl, setBotFormUrl] = useState('');
  const [botFormIcon, setBotFormIcon] = useState('🤖');
  const [botFormBadge, setBotFormBadge] = useState('HOT');

  useEffect(() => {
    fetchStats();
    fetchOtherBots();
    fetchSystemLogs();
    fetchSettings();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.ok) setStats(data.stats);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchOtherBots = async () => {
    try {
      const res = await fetch('/api/admin/other-bots');
      const data = await res.json();
      if (data.ok) setOtherBots(data.bots);
    } catch (err) {
      console.error('Failed to fetch other bots:', err);
    }
  };

  const fetchSystemLogs = async () => {
    try {
      const res = await fetch('/api/admin/logs?limit=50');
      const data = await res.json();
      if (data.ok) setSystemLogs(data.logs);
    } catch (err) {
      console.error('Failed to fetch system logs:', err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.ok && data.settings) {
        if (data.settings.botTokenMasked) {
          setBotToken(data.settings.botTokenMasked);
        }
        setWebhookUrl(data.settings.webhookUrl || `${window.location.origin}/api/telegram/webhook`);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: broadcastText,
          buttonText: broadcastBtnText || undefined,
          buttonUrl: broadcastBtnUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBroadcastResult(`Broadcast dispatched to ${data.result.deliveredCount} users successfully.`);
        setBroadcastText('');
        fetchSystemLogs();
        fetchStats();
      } else {
        setBroadcastResult(`Error: ${data.error}`);
      }
    } catch (err) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: botToken.includes('...') ? undefined : botToken,
          webhookUrl,
        }),
      });
      const data = await res.json();
      setTelegramStatus(data);
      if (data.ok) {
        fetchSettings();
        fetchSystemLogs();
      }
    } catch (err) {
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: botFormName,
            username: botFormUsername,
            description: botFormDesc,
            category: botFormCategory,
            url: botFormUrl,
            icon: botFormIcon,
            badge: botFormBadge || undefined,
          }),
        });
      } else {
        await fetch('/api/admin/other-bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: botFormName,
            username: botFormUsername,
            description: botFormDesc,
            category: botFormCategory,
            url: botFormUrl,
            icon: botFormIcon,
            badge: botFormBadge || undefined,
            enabled: true,
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

  const handleDeleteBot = async (id: string) => {
    if (!confirm('Remove this bot from the recommendation menu?')) return;
    try {
      await fetch(`/api/admin/other-bots/${id}`, { method: 'DELETE' });
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
    setBotFormCategory('AI Tools');
    setBotFormUrl('');
    setBotFormIcon('🤖');
    setBotFormBadge('NEW');
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
    setShowBotModal(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-indigo-400">
            <Shield className="w-5 h-5" />
            <h2 className="text-xl font-bold text-white tracking-tight">System Admin & Operations</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Global SaaS health monitoring, broadcast announcements, Telegram webhook setup, and cross-promoted bot directory.
          </p>
        </div>

        <button
          onClick={() => {
            fetchStats();
            fetchOtherBots();
            fetchSystemLogs();
          }}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Global System Metrics Grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Total Users</span>
            <span className="text-2xl font-bold text-white mt-1 block">{stats.totalUsers}</span>
            <span className="text-[10px] text-slate-500">Registered SaaS tenants</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Active Tenants</span>
            <span className="text-2xl font-bold text-sky-400 mt-1 block">{stats.activeUsers}</span>
            <span className="text-[10px] text-slate-500">Active this month</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">New Users (24h)</span>
            <span className="text-2xl font-bold text-emerald-400 mt-1 block">+{stats.newUsersLast24h}</span>
            <span className="text-[10px] text-slate-500">Growth rate</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Automations</span>
            <span className="text-2xl font-bold text-indigo-400 mt-1 block">{stats.totalAutomations}</span>
            <span className="text-[10px] text-slate-500">Pipelines live</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Posts Processed</span>
            <span className="text-2xl font-bold text-emerald-400 mt-1 block">{stats.totalPostsProcessed}</span>
            <span className="text-[10px] text-slate-500">{stats.totalPostsFailed} failures</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Ads Filtered</span>
            <span className="text-2xl font-bold text-rose-400 mt-1 block">{stats.totalAdsFiltered}</span>
            <span className="text-[10px] text-slate-500">Commercial spam dropped</span>
          </div>
        </div>
      )}

      {/* Main Admin Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Broadcast & Telegram Config (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Broadcast Announcement Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
              <Send className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Broadcast Announcement</h3>
                <p className="text-[11px] text-slate-400">
                  Deliver notifications and updates to all registered bot users instantly.
                </p>
              </div>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Message Content (Markdown supported)
                </label>
                <textarea
                  rows={4}
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  placeholder="🚀 Update: X2Telegram now supports 1080p video attachments and automatic thread splitters!"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Action Button Label (Optional)
                  </label>
                  <input
                    type="text"
                    value={broadcastBtnText}
                    onChange={(e) => setBroadcastBtnText(e.target.value)}
                    placeholder="Read Changelog"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Button URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={broadcastBtnUrl}
                    onChange={(e) => setBroadcastBtnUrl(e.target.value)}
                    placeholder="https://t.me/your_news_channel"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <button
                id="btn-send-broadcast"
                type="submit"
                disabled={isBroadcasting || !broadcastText.trim()}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition flex items-center justify-center space-x-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isBroadcasting ? 'Dispatching to Users...' : 'Send Broadcast to All Users'}</span>
              </button>

              {broadcastResult && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-emerald-400 flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{broadcastResult}</span>
                </div>
              )}
            </form>
          </div>

          {/* Telegram Webhook & Live Bot Token Setup */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
              <Bot className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Live Telegram Bot & Webhook Setup</h3>
                <p className="text-[11px] text-slate-400">
                  Configure token from @BotFather for live public deployment.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Telegram Bot Token (from @BotFather)
                </label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Public Webhook Endpoint URL
                </label>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-domain.run.app/api/telegram/webhook"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <button
                id="btn-verify-telegram"
                onClick={handleTestTelegram}
                disabled={isTestingTelegram}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition flex items-center justify-center space-x-2"
              >
                <Radio className="w-3.5 h-3.5 text-sky-400" />
                <span>{isTestingTelegram ? 'Verifying Telegram API...' : 'Test Connection & Set Webhook'}</span>
              </button>

              {telegramStatus && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    telegramStatus.ok
                      ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-300'
                      : 'bg-rose-950/20 border-rose-900/50 text-rose-300'
                  }`}
                >
                  {telegramStatus.ok ? (
                    <div className="space-y-1">
                      <div className="flex items-center space-x-1.5 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Connected to @{telegramStatus.botInfo?.username} (ID: {telegramStatus.botInfo?.id})</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Webhook response: {telegramStatus.webhookStatus?.description || 'Ready for updates'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>{telegramStatus.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Other Bots Directory & System Logs (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Other Bots Directory Management */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Flame className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">"Other Bots" Ecosystem Directory</h3>
                  <p className="text-[11px] text-slate-400">
                    Cross-promote partner and affiliated Telegram bots to users.
                  </p>
                </div>
              </div>

              <button
                id="btn-add-other-bot"
                onClick={openAddBot}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Bot</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {otherBots.map((bot) => (
                <div
                  key={bot.id}
                  className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{bot.icon}</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs text-white">{bot.name}</span>
                        <span className="text-[10px] text-sky-400 font-mono">{bot.username}</span>
                        {bot.badge && (
                          <span className="text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {bot.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm truncate">{bot.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-slate-500">{bot.clicksCount} clicks</span>
                    <button
                      onClick={() => openEditBot(bot)}
                      className="p-1.5 text-slate-400 hover:text-white rounded"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteBot(bot.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Audit Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Sliders className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Live System Engine Logs</h3>
              </div>
              <button
                onClick={fetchSystemLogs}
                className="p-1 text-slate-400 hover:text-white"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 font-mono text-[11px]">
              {systemLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2 rounded-lg bg-slate-950 border border-slate-800/80 flex items-start space-x-2"
                >
                  <span
                    className={`uppercase font-bold text-[9px] px-1.5 py-0.2 rounded ${
                      log.level === 'error'
                        ? 'bg-rose-500/20 text-rose-400'
                        : log.level === 'warn'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-sky-500/20 text-sky-400'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-slate-500 text-[10px] flex-shrink-0">
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>
                  <span className="text-slate-400 font-semibold flex-shrink-0">{log.source}:</span>
                  <span className="text-slate-200 truncate flex-1">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Add/Edit Other Bot */}
      {showBotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">
                {editingBot ? 'Edit Ecosystem Bot' : 'Add Bot to Directory'}
              </h3>
              <button
                onClick={() => setShowBotModal(false)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBot} className="space-y-3 pt-4 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-300 mb-1">Bot Name</label>
                  <input
                    type="text"
                    value={botFormName}
                    onChange={(e) => setBotFormName(e.target.value)}
                    placeholder="AI Summary Bot"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Emoji Icon</label>
                  <input
                    type="text"
                    value={botFormIcon}
                    onChange={(e) => setBotFormIcon(e.target.value)}
                    placeholder="🤖"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500 text-center text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Telegram Username</label>
                <input
                  type="text"
                  value={botFormUsername}
                  onChange={(e) => setBotFormUsername(e.target.value)}
                  placeholder="@ai_summary_bot"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Short Pitch / Description</label>
                <input
                  type="text"
                  value={botFormDesc}
                  onChange={(e) => setBotFormDesc(e.target.value)}
                  placeholder="Instantly summarizes YouTube videos and PDFs in Telegram."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={botFormCategory}
                    onChange={(e) => setBotFormCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="AI Tools">AI Tools</option>
                    <option value="Crypto & Web3">Crypto & Web3</option>
                    <option value="Productivity">Productivity</option>
                    <option value="Media & Audio">Media & Audio</option>
                    <option value="Utilities">Utilities</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Badge (e.g. HOT, NEW)</label>
                  <input
                    type="text"
                    value={botFormBadge}
                    onChange={(e) => setBotFormBadge(e.target.value)}
                    placeholder="HOT"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBotModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold"
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
