import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Play,
  Pause,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Key,
  RefreshCw,
  Clock,
  Sparkles,
  ExternalLink,
  Layers,
  FileText,
  Sliders,
  Check,
  Bot,
} from 'lucide-react';
import { BotUser, Automation, PostLog, UserSettings, OtherBot } from '../types.ts';

interface UserDashboardProps {
  currentUser: BotUser;
  automations: Automation[];
  onRefresh: () => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  currentUser,
  automations,
  onRefresh,
}) => {
  const [logs, setLogs] = useState<PostLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'published' | 'filtered_ad' | 'failed'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Automation Form State
  const [formDirection, setFormDirection] = useState<'x_to_telegram' | 'telegram_to_x'>('x_to_telegram');
  const [formSource, setFormSource] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formFormat, setFormFormat] = useState<'auto' | 'concise' | 'thread'>('auto');
  const [formFilterAds, setFormFilterAds] = useState(true);
  const [formAutoRewrite, setFormAutoRewrite] = useState(true);
  const [formIncludeLink, setFormIncludeLink] = useState(true);

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState<UserSettings>(currentUser.settings);
  const [syncingAutoId, setSyncingAutoId] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<{ id: string; text: string } | null>(null);
  const [channelVerifyState, setChannelVerifyState] = useState<{
    status: 'idle' | 'checking' | 'success' | 'error';
    message?: string;
    title?: string;
  }>({ status: 'idle' });
  const [isXOAuthConnecting, setIsXOAuthConnecting] = useState(false);
  const [otherBots, setOtherBots] = useState<OtherBot[]>([]);

  useEffect(() => {
    fetchLogs();
    fetchOtherBots();
    setSettingsForm(currentUser.settings);
  }, [currentUser.id, currentUser.settings]);

  const fetchOtherBots = async () => {
    try {
      const res = await fetch('/api/other-bots');
      const data = await res.json();
      if (data.ok && Array.isArray(data.bots)) {
        setOtherBots(data.bots);
      }
    } catch (err) {
      console.error('Failed to load other bots:', err);
    }
  };

  const handleRecordBotClick = (botId: string) => {
    fetch(`/api/other-bots/${botId}/click`, { method: 'POST' }).catch(() => {});
  };

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'X_OAUTH_SUCCESS') {
        onRefresh();
        setShowSettingsModal(false);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onRefresh]);

  const handleSyncNow = async (auto: Automation) => {
    setSyncingAutoId(auto.id);
    setSyncNotice(null);
    try {
      const res = await fetch(`/api/user/automations/${auto.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const data = await res.json();
      setSyncNotice({ id: auto.id, text: data.message || 'Sync completed.' });
      onRefresh();
      fetchLogs();
      setTimeout(() => setSyncNotice(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncNotice({ id: auto.id, text: `Sync failed: ${msg}` });
    } finally {
      setSyncingAutoId(null);
    }
  };

  const handleConnectXOAuth = async () => {
    setIsXOAuthConnecting(true);
    try {
      const res = await fetch(`/api/auth/x/login?userId=${currentUser.id}`);
      const data = await res.json();
      if (data.ok && data.url) {
        // Open OAuth in popup or current window
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(
          data.url,
          'X_OAuth_Login',
          `width=${width},height=${height},top=${top},left=${left},toolbar=no,location=no,status=no,menubar=no`
        );
      }
    } catch (err) {
      console.error('Failed to initiate X OAuth:', err);
    } finally {
      setIsXOAuthConnecting(false);
    }
  };

  const handleDisconnectXOAuth = async () => {
    if (!confirm('Disconnect X (Twitter) authentication?')) return;
    try {
      await fetch('/api/auth/x/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to disconnect X:', err);
    }
  };

  const handleVerifyChannel = async () => {
    const channelId = settingsForm.telegramChannelId?.trim();
    if (!channelId) {
      setChannelVerifyState({
        status: 'error',
        message: 'Please enter a Telegram channel username or ID first.',
      });
      return;
    }

    setChannelVerifyState({ status: 'checking', message: 'Checking bot admin rights in channel...' });

    try {
      const res = await fetch('/api/telegram/verify-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json();

      if (data.ok && data.canPost) {
        setChannelVerifyState({
          status: 'success',
          title: data.chatTitle,
          message: `Verified! Bot is an administrator in "${data.chatTitle}" with permission to post messages.`,
        });
      } else {
        setChannelVerifyState({
          status: 'error',
          message:
            data.error ||
            `Bot is not an administrator in "${channelId}". Please add the bot as an admin with "Post Messages" enabled.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setChannelVerifyState({ status: 'error', message: `Verification check failed: ${msg}` });
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/user/logs?userId=${currentUser.id}&limit=50`);
      const data = await res.json();
      if (data.ok) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch user logs:', err);
    }
  };

  const handleToggleAuto = async (id: string) => {
    try {
      await fetch(`/api/user/automations/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle automation:', err);
    }
  };

  const handleDeleteAuto = async (id: string) => {
    if (!confirm('Are you sure you want to delete this automation?')) return;
    try {
      await fetch(`/api/user/automations/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to delete automation:', err);
    }
  };

  const handleTestAuto = async (auto: Automation) => {
    try {
      await fetch('/api/telegram/trigger-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationId: auto.id,
          userId: currentUser.id,
          author: auto.source,
          content: `Test publication from ${auto.source}: Real-time cross-posting pipeline verified with fact preservation.`,
        }),
      });
      setTimeout(() => {
        onRefresh();
        fetchLogs();
      }, 1500);
    } catch (err) {
      console.error('Failed to run test:', err);
    }
  };

  const handleCreateAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSource || !formDestination) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/user/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          name: `${formSource} ➔ ${formDestination}`,
          direction: formDirection,
          source: formSource,
          destination: formDestination,
          settings: {
            filterPromotions: formFilterAds,
            autoRewrite: formAutoRewrite,
            format: formFormat,
            includeMedia: true,
            includeOriginalLink: formIncludeLink,
            preserveHashtags: true,
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowCreateModal(false);
        setFormSource('');
        setFormDestination('');
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to create automation:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          settings: settingsForm,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowSettingsModal(false);
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'all') return true;
    return log.status === logFilter;
  });

  const quotaLimit = currentUser.plan === 'enterprise' ? 10000 : currentUser.plan === 'pro' ? 2500 : 100;
  const quotaUsedPercent = Math.min(100, Math.round((currentUser.postsProcessedCount / quotaLimit) * 100));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* SaaS User Isolation Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
          <div>
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {currentUser.firstName} ({currentUser.telegramUsername})
              </h2>
              <span className="text-xs uppercase font-bold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                {currentUser.plan} Plan
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Isolated SaaS Tenant ID: <code className="text-slate-300 font-mono">{currentUser.id}</code> • 
              Telegram ID: <code className="text-slate-300 font-mono">{currentUser.telegramId}</code>
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              id="btn-user-settings"
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
            >
              <Key className="w-4 h-4 text-sky-400" />
              <span>API Credentials & Settings</span>
            </button>

            <button
              id="btn-create-automation-top"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white shadow-lg shadow-sky-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Automation</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
            <span className="text-xs text-slate-400 font-medium">Active Automations</span>
            <div className="text-2xl font-bold text-white mt-1">
              {automations.filter((a) => a.status === 'active').length}
              <span className="text-xs text-slate-500 font-normal ml-1">/ {automations.length} total</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
            <span className="text-xs text-slate-400 font-medium">Posts Forwarded</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {currentUser.postsProcessedCount}
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
            <span className="text-xs text-slate-400 font-medium">Promotional Ads Blocked</span>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {currentUser.postsFilteredAdsCount}
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Monthly Quota</span>
              <span className="text-slate-300 font-bold">{quotaUsedPercent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-sky-500 h-full rounded-full transition-all"
                style={{ width: `${quotaUsedPercent}%` }}
              ></div>
            </div>
            <div className="text-[10px] text-slate-500 mt-1.5">
              {currentUser.postsProcessedCount} of {quotaLimit} posts used
            </div>
          </div>
        </div>
      </div>

      {/* Automations Management Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-sky-400" />
            <h3 className="text-lg font-bold text-white">Configured Automations</h3>
          </div>
          <span className="text-xs text-slate-400">Strict User ↔ Bot Isolation</span>
        </div>

        {automations.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
            <Zap className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-sm font-bold text-white">No active connections yet</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Connect your X account and Telegram channel to automatically synchronize content with AI fact preservation.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition shadow-md shadow-sky-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Connect First Source</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {automations.map((auto) => (
              <div
                key={auto.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg transition space-y-4"
              >
                {/* Header with status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        auto.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {auto.status}
                    </span>
                    <span className="text-xs font-bold text-slate-300">
                      {auto.direction === 'x_to_telegram' ? 'X ➔ Telegram' : 'Telegram ➔ X'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleToggleAuto(auto.id)}
                      title={auto.status === 'active' ? 'Pause Automation' : 'Resume Automation'}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      {auto.status === 'active' ? (
                        <Pause className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteAuto(auto.id)}
                      title="Delete Automation"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Source & Destination Routing */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                  <div className="truncate max-w-[42%]">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Source</span>
                    <span className="font-mono text-white truncate block">{auto.source}</span>
                  </div>

                  <ArrowRight className="w-4 h-4 text-sky-400 flex-shrink-0" />

                  <div className="truncate max-w-[42%] text-right">
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Destination</span>
                    <span className="font-mono text-sky-300 truncate block">{auto.destination}</span>
                  </div>
                </div>

                {/* Features & Actions */}
                <div className="flex items-center justify-between text-[11px] pt-1 text-slate-400">
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center space-x-1 text-emerald-400">
                      <Sparkles className="w-3 h-3" />
                      <span>AI Fact Rewrite</span>
                    </span>
                    <span className="flex items-center space-x-1 text-sky-400">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Ad Filter ON</span>
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleSyncNow(auto)}
                      disabled={syncingAutoId === auto.id}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 font-medium transition disabled:opacity-50"
                      title="Immediately query source account for newly published tweets"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${syncingAutoId === auto.id ? 'animate-spin' : ''}`} />
                      <span>{syncingAutoId === auto.id ? 'Checking...' : 'Sync Now'}</span>
                    </button>
                    <button
                      onClick={() => handleTestAuto(auto)}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded bg-sky-600/10 hover:bg-sky-600/20 text-sky-300 border border-sky-500/20 font-medium transition"
                      title="Send sample test post through AI pipeline and queue"
                    >
                      <Play className="w-2.5 h-2.5" />
                      <span>Test Run</span>
                    </button>
                  </div>
                </div>

                {syncNotice && syncNotice.id === auto.id && (
                  <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-800/80 text-[11px] text-sky-200">
                    {syncNotice.text}
                  </div>
                )}

                <div className="flex justify-between items-center text-[10px] text-slate-500 pt-2 border-t border-slate-800/80">
                  <span>Processed: <strong className="text-slate-300">{auto.stats.processedCount}</strong></span>
                  <span>Ads Skipped: <strong className="text-slate-300">{auto.stats.skippedAdsCount}</strong></span>
                  <span>
                    Last checked: {auto.lastPollAt ? new Date(auto.lastPollAt).toLocaleTimeString() : 'Active Poll Loop'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit Log & Post History */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-sky-400" />
            <h3 className="text-lg font-bold text-white">Post History & Ad Filter Audit</h3>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
            {(['all', 'published', 'filtered_ad', 'failed'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setLogFilter(filter)}
                className={`px-3 py-1 rounded-lg capitalize font-medium transition ${
                  logFilter === filter
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter.replace('_', ' ')}
              </button>
            ))}
            <button
              onClick={fetchLogs}
              title="Refresh logs"
              className="p-1 text-slate-400 hover:text-white rounded"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
            No activity logs found for this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`p-4 rounded-2xl border transition ${
                  log.status === 'published'
                    ? 'bg-slate-900 border-slate-800'
                    : log.status === 'filtered_ad'
                    ? 'bg-rose-950/20 border-rose-900/40'
                    : 'bg-amber-950/20 border-amber-900/40'
                }`}
              >
                {/* Log Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mb-3">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        log.status === 'published'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : log.status === 'filtered_ad'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {log.status === 'published'
                        ? '✅ Published'
                        : log.status === 'filtered_ad'
                        ? '🛡️ Ad Filtered'
                        : '⚠️ Failed'}
                    </span>

                    <span className="font-semibold text-slate-300">
                      {log.direction === 'x_to_telegram' ? 'X ➔ Telegram' : 'Telegram ➔ X'}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">Author: <strong className="text-white">{log.sourceAuthor}</strong></span>
                  </div>

                  <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {/* Content Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Original Content */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Original Text</span>
                    <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {log.sourceContent}
                    </p>
                    {log.sourceUrl && (
                      <a
                        href={log.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 text-[10px] text-sky-400 hover:underline pt-1"
                      >
                        <span>View Source</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  {/* Processed / Filtered Output */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">
                        {log.status === 'filtered_ad' ? 'Ad Filter Reason' : 'AI Rewritten Output'}
                      </span>
                      {log.status === 'published' && (
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                          Fact Checked
                        </span>
                      )}
                    </div>

                    {log.status === 'filtered_ad' ? (
                      <div className="space-y-1.5 text-rose-300">
                        <div className="flex items-center space-x-1.5 font-semibold text-[11px]">
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                          <span>Flagged as {log.adCategory || 'commercial promo'} ({Math.round((log.adConfidence || 0.9) * 100)}% confidence)</span>
                        </div>
                        <p className="text-slate-400 text-[11px]">
                          {log.adReasoning || 'Identified promotional patterns, token shill or affiliate tags.'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        {log.threadParts && log.threadParts.length > 1 ? (
                          <div className="space-y-2">
                            <span className="text-[10px] font-semibold text-sky-400">
                              Thread Output ({log.threadParts.length} parts):
                            </span>
                            {log.threadParts.map((t, idx) => (
                              <div key={idx} className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-200">
                                {t}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {log.processedContent}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Featured Partner Bots Directory (Only Active Bots Configured by Admin) */}
      {otherBots.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-800/80">
          <div className="flex items-center space-x-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-bold text-white">Recommended Telegram Bots</h3>
            <span className="text-xs text-slate-500">• Verified Directory</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherBots.map((bot) => (
              <div
                key={bot.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition"
              >
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2.5">
                      <span className="text-2xl">{bot.icon || '🤖'}</span>
                      <div>
                        <h4 className="text-sm font-bold text-white leading-snug">{bot.name}</h4>
                        <span className="text-[11px] text-sky-400 font-mono">{bot.username}</span>
                      </div>
                    </div>
                    {bot.badge && (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {bot.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    {bot.description || 'Recommended automated Telegram bot tool.'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-500">
                    {bot.category}
                  </span>
                  <a
                    href={bot.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => handleRecordBotClick(bot.id)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition"
                  >
                    <span>Launch Bot</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Create Automation */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-sky-400">
                <Zap className="w-5 h-5" />
                <h3 className="text-lg font-bold text-white">Create New Automation</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAutomation} className="space-y-4 pt-4">
              {/* Direction Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Cross-Posting Direction
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormDirection('x_to_telegram')}
                    className={`p-3 rounded-xl border text-left transition ${
                      formDirection === 'x_to_telegram'
                        ? 'border-sky-500 bg-sky-500/10 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span className="font-bold text-xs block">X ➔ Telegram</span>
                    <span className="text-[10px] text-slate-400">Monitor X, forward to TG channel</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormDirection('telegram_to_x')}
                    className={`p-3 rounded-xl border text-left transition ${
                      formDirection === 'telegram_to_x'
                        ? 'border-sky-500 bg-sky-500/10 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    <span className="font-bold text-xs block">Telegram ➔ X</span>
                    <span className="text-[10px] text-slate-400">Convert TG posts into 280c or threads</span>
                  </button>
                </div>
              </div>

              {/* Source Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {formDirection === 'x_to_telegram' ? 'Source X Handle to Monitor' : 'Source Telegram Channel'}
                </label>
                <input
                  type="text"
                  placeholder={formDirection === 'x_to_telegram' ? '@OpenAI or @sama' : '@my_crypto_channel'}
                  value={formSource}
                  onChange={(e) => setFormSource(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                  required
                />
              </div>

              {/* Destination Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {formDirection === 'x_to_telegram' ? 'Destination Telegram Channel' : 'Destination Authorized X Handle'}
                </label>
                <input
                  type="text"
                  placeholder={formDirection === 'x_to_telegram' ? '@my_channel or https://t.me/my_channel' : '@my_x_handle'}
                  value={formDestination}
                  onChange={(e) => setFormDestination(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                  required
                />
              </div>

              {/* Format Option */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Content Delivery Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['auto', 'concise', 'thread'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormFormat(fmt)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium capitalize border transition ${
                        formFormat === fmt
                          ? 'border-sky-500 bg-sky-500/10 text-sky-300 font-bold'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feature Toggles */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <div>
                      <span className="font-semibold block">Automatic AI Fact-Preserving Rewriter</span>
                      <span className="text-[10px] text-slate-500">Adapts format without altering numbers, dates, or claims</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formAutoRewrite}
                    onChange={(e) => setFormAutoRewrite(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded bg-slate-950 border-slate-800"
                  />
                </label>

                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer p-2 rounded-lg hover:bg-slate-800/40">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="font-semibold block">Promotional & Spam Ad Detector</span>
                      <span className="text-[10px] text-slate-500">Filters token presales, affiliate links, and #ad content</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formFilterAds}
                    onChange={(e) => setFormFilterAds(e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded bg-slate-950 border-slate-800"
                  />
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-600/20 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Activating...' : 'Activate Automation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: User Settings & Account Configuration */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-sky-400">
                <Sliders className="w-5 h-5" />
                <h3 className="text-lg font-bold text-white">Account & Channel Configuration</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 pt-4">
              <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-300 block mb-1">🔒 Server-Managed Infrastructure</span>
                All server secrets (MongoDB, Telegram Bot Token, Twitter App credentials, and Admin Key) are managed strictly on the server. You only configure your personal channels and authorization.
              </div>

              {/* X OAuth 2.0 PKCE Integration */}
              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  X (Twitter) Authorization
                </label>
                {currentUser.settings.xCredentials?.oauth2AccessToken ? (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-xl flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs text-emerald-300">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <div>
                        <span className="font-bold block">Connected via OAuth 2.0</span>
                        <span className="text-[10px] text-emerald-400/80">
                          {currentUser.settings.xCredentials?.accountHandle || 'Authorized for direct publishing'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDisconnectXOAuth}
                      className="px-2.5 py-1 text-[11px] rounded bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-medium transition"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Official X OAuth 2.0</span>
                      <span className="text-[10px] text-slate-400">1-click authorization without sharing passwords</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectXOAuth}
                      disabled={isXOAuthConnecting}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-sky-600/20"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>{isXOAuthConnecting ? 'Opening...' : 'Connect X'}</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Your Connected X (Twitter) Handle
                </label>
                <input
                  type="text"
                  placeholder="@my_twitter_handle"
                  value={settingsForm.xCredentials.accountHandle || ''}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      xCredentials: { ...settingsForm.xCredentials, accountHandle: e.target.value },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Default Telegram Destination Channel
                  </label>
                  <button
                    type="button"
                    onClick={handleVerifyChannel}
                    disabled={channelVerifyState.status === 'checking'}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-medium underline"
                  >
                    {channelVerifyState.status === 'checking' ? 'Verifying...' : 'Verify Bot Rights'}
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="@my_channel or https://t.me/my_channel"
                  value={settingsForm.telegramChannelId || ''}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, telegramChannelId: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                />
                {channelVerifyState.status === 'success' && (
                  <div className="mt-1.5 p-2 rounded-lg bg-emerald-950/50 border border-emerald-800/80 text-[11px] text-emerald-300 flex items-start space-x-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>{channelVerifyState.message}</span>
                  </div>
                )}
                {channelVerifyState.status === 'error' && (
                  <div className="mt-1.5 p-2 rounded-lg bg-rose-950/50 border border-rose-800/80 text-[11px] text-rose-300 flex items-start space-x-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
                    <span>{channelVerifyState.message}</span>
                  </div>
                )}
                <span className="text-[10px] text-slate-500 block mt-1">
                  Ensure this bot is added as an administrator to your channel with "Post Messages" permission.
                </span>
              </div>

              {/* Preferences */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <label className="block text-xs font-semibold text-slate-300">
                  Processing Preferences
                </label>
                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                  <span>AI Fact-Preserving Rewriting</span>
                  <input
                    type="checkbox"
                    checked={settingsForm.autoRewrite}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, autoRewrite: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-sky-600 focus:ring-0 bg-slate-950 border-slate-800"
                  />
                </label>
                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                  <span>Smart Spam & Ad Filter</span>
                  <input
                    type="checkbox"
                    checked={settingsForm.adFilterEnabled}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, adFilterEnabled: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-sky-600 focus:ring-0 bg-slate-950 border-slate-800"
                  />
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-600/20"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
