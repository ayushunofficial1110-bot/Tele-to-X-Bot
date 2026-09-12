import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Bot,
  Zap,
  Radio,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import { BotUser, Automation, TelegramInlineButton, PostLog } from '../types.ts';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  time: string;
  replyMarkup?: {
    inline_keyboard?: TelegramInlineButton[][];
  };
}

interface TelegramSimulatorProps {
  currentUser: BotUser;
  automations: Automation[];
  onAutomationChange: () => void;
}

export const TelegramSimulator: React.FC<TelegramSimulatorProps> = ({
  currentUser,
  automations,
  onAutomationChange,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [channelPosts, setChannelPosts] = useState<PostLog[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<'organic_ai' | 'organic_crypto' | 'ad_promo'>('organic_ai');
  const [isSimulatingPost, setIsSimulatingPost] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load initial chat & channel logs
  useEffect(() => {
    fetchChatLogs();
    fetchChannelPosts();
  }, [currentUser.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const fetchChannelPosts = async () => {
    try {
      const res = await fetch(`/api/user/logs?userId=${currentUser.id}&limit=20`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.logs)) {
        setChannelPosts(data.logs.filter((p: PostLog) => p.status === 'published'));
      }
    } catch (err) {
      console.error('Failed to fetch channel posts:', err);
    }
  };

  const fetchChatLogs = async () => {
    // Send initial /start to load bot greeting
    setIsTyping(true);
    try {
      const res = await fetch('/api/telegram/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, text: '/start' }),
      });
      const data = await res.json();
      if (data.ok && data.response) {
        setMessages([
          {
            id: `msg_${Date.now()}`,
            sender: 'bot',
            text: data.response.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            replyMarkup: data.response.replyMarkup,
          },
        ]);
      }
    } catch (err) {
      console.error('Failed to send /start:', err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendText = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    // Add user message to UI
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/telegram/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, text }),
      });
      const data = await res.json();
      if (data.ok && data.response) {
        const botMsg: ChatMessage = {
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: data.response.text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          replyMarkup: data.response.replyMarkup,
        };
        setMessages((prev) => [...prev, botMsg]);
        onAutomationChange();
        fetchChannelPosts();
      }
    } catch (err) {
      console.error('Failed to simulate message:', err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleButtonClick = async (button: TelegramInlineButton) => {
    if (button.url) {
      window.open(button.url, '_blank');
      return;
    }
    if (!button.callback_data) return;

    setIsTyping(true);
    try {
      const res = await fetch('/api/telegram/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          callbackData: button.callback_data,
        }),
      });
      const data = await res.json();
      if (data.ok && data.response) {
        const botMsg: ChatMessage = {
          id: `bot_${Date.now()}`,
          sender: 'bot',
          text: data.response.text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          replyMarkup: data.response.replyMarkup,
        };
        setMessages((prev) => [...prev, botMsg]);
        onAutomationChange();
        fetchChannelPosts();
      }
    } catch (err) {
      console.error('Failed to simulate callback:', err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSimulateTweet = async () => {
    const activeAuto = automations.find((a) => a.direction === 'x_to_telegram' && a.status === 'active') || automations[0];
    if (!activeAuto) {
      alert('Please create or resume an active automation first via the bot.');
      return;
    }

    setIsSimulatingPost(true);
    setSimulationStatus('Running post through Gemini AI rewriter & ad detector...');

    let content = '';
    let author = activeAuto.source;
    let isPromotional = false;
    let mediaUrl: string | undefined = undefined;

    if (selectedPreset === 'organic_ai') {
      author = '@OpenAI';
      content =
        'Introducing GPT-4.5: our most nuanced reasoning model for knowledge, nuance, and code. Available today in research preview to ChatGPT Plus and Pro subscribers.';
      mediaUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';
    } else if (selectedPreset === 'organic_crypto') {
      author = '@VitalikButerin';
      content =
        'Ethereum Layer 2 gas fees dropped by 94% following the latest blob space optimization hard fork, enabling decentralized microtransactions at sub-cent costs.';
    } else {
      author = '@MegaPresaleToken';
      content =
        '🔥 URGENT AIRDROP: Claim 5,000 $ALPHA tokens right now! Connect your wallet at t.co/presale-win before countdown hits zero! 100x return guaranteed! 🚀🚀 #ad #sponsored';
      isPromotional = true;
    }

    try {
      const res = await fetch('/api/telegram/trigger-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationId: activeAuto.id,
          userId: currentUser.id,
          content,
          author,
          isPromotional,
          mediaUrl,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSimulationStatus(
          isPromotional
            ? '🛡️ Ad Detector flagged and discarded promotional token shill! (Check User Dashboard logs)'
            : '✨ Post processed by Gemini Fact-Preserving Rewriter & published to channel!'
        );
        setTimeout(() => {
          fetchChannelPosts();
          onAutomationChange();
          setIsSimulatingPost(false);
        }, 1800);
      }
    } catch (err) {
      console.error('Failed to trigger post:', err);
      setIsSimulatingPost(false);
      setSimulationStatus('Simulation encountered an error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top Banner: Real-time status */}
      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/70 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Live Bot Engine Active</span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-300">
              Active Tenant: <strong className="text-white">{currentUser.telegramUsername}</strong> ({currentUser.plan.toUpperCase()} Plan)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Interact with the bot using inline keyboard buttons. Test cross-posting with the sample feed trigger on the right.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchChatLogs}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Chat</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left / Center: Interactive Telegram Bot Chat (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden h-[680px]">
          {/* Telegram Chat Header */}
          <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold shadow">
                  <Bot className="w-5 h-5" />
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-950 rounded-full"></span>
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <h3 className="text-sm font-bold text-white tracking-tight">X ↔ Telegram Automation</h3>
                  <CheckCircle2 className="w-4 h-4 text-sky-400 fill-sky-400/20" />
                </div>
                <p className="text-[11px] text-slate-400">bot • official assistant</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                Webhook: Ready
              </span>
            </div>
          </div>

          {/* Chat Messages Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-950/30">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-sky-600 text-white rounded-br-none'
                      : 'bg-slate-800/90 text-slate-100 rounded-bl-none border border-slate-700/60'
                  }`}
                >
                  <div className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                    {msg.text}
                  </div>

                  {/* Inline Keyboard Buttons */}
                  {msg.replyMarkup?.inline_keyboard && (
                    <div className="mt-3 pt-2 border-t border-slate-700/50 space-y-1.5">
                      {msg.replyMarkup.inline_keyboard.map((row, rowIdx) => (
                        <div key={rowIdx} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {row.map((btn, btnIdx) => (
                            <button
                              key={btnIdx}
                              onClick={() => handleButtonClick(btn)}
                              className="w-full text-left px-3 py-2 rounded-xl bg-slate-700/70 hover:bg-sky-600/30 hover:border-sky-500/50 border border-slate-600/40 text-xs font-medium text-sky-200 hover:text-white transition flex items-center justify-between group"
                            >
                              <span className="truncate">{btn.text}</span>
                              {btn.url ? (
                                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-white ml-1 flex-shrink-0" />
                              ) : (
                                <Zap className="w-3 h-3 text-sky-400 group-hover:text-sky-300 ml-1 flex-shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={`text-[10px] mt-1 text-right ${
                      msg.sender === 'user' ? 'text-sky-200/70' : 'text-slate-400'
                    }`}
                  >
                    {msg.time}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-800/60 px-3 py-2 rounded-xl w-28 border border-slate-700/50">
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse"></span>
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse delay-150"></span>
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse delay-300"></span>
                <span className="ml-1 text-[11px]">typing...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Action Chips Bar */}
          <div className="px-3 py-2 bg-slate-950/60 border-t border-slate-800 flex items-center space-x-1.5 overflow-x-auto text-[11px]">
            <span className="text-slate-500 font-semibold px-1">Quick:</span>
            {[
              { label: '⚡ Automations', cmd: '/automations' },
              { label: '➕ New Auto', cmd: '/new' },
              { label: '🤖 Other Bots', cmd: '/otherbots' },
              { label: '⚙️ Settings', cmd: '/settings' },
              { label: '📊 Stats', cmd: '/stats' },
              { label: 'ℹ️ Guide', cmd: '/help' },
            ].map((chip) => (
              <button
                key={chip.cmd}
                onClick={() => handleSendText(chip.cmd)}
                className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 whitespace-nowrap transition"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <div className="p-3 bg-slate-950 border-t border-slate-800">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendText();
              }}
              className="flex items-center space-x-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Write a message or command (e.g. /start, @elonmusk)..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isTyping}
                className="p-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white transition shadow-md shadow-sky-600/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right: Live Channel Feed & Tweet Trigger (5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          {/* Trigger Live Post Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Radio className="w-4 h-4 text-sky-400 animate-pulse" />
                <h3 className="text-sm font-bold text-white">Pipeline Test Trigger</h3>
              </div>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                End-to-End
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Simulate an incoming tweet to observe the automated AI rewriting, ad filtering, and channel delivery:
            </p>

            {/* Presets */}
            <div className="space-y-2 mb-4">
              <label
                onClick={() => setSelectedPreset('organic_ai')}
                className={`flex items-start p-3 rounded-xl border cursor-pointer transition ${
                  selectedPreset === 'organic_ai'
                    ? 'border-sky-500 bg-sky-500/10 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={selectedPreset === 'organic_ai'}
                  onChange={() => {}}
                  className="mt-0.5 text-sky-500"
                />
                <div className="ml-2.5">
                  <div className="text-xs font-semibold flex items-center space-x-1.5">
                    <span>@OpenAI Product Launch (Organic News)</span>
                    <span className="text-[10px] text-emerald-400 font-normal">→ Passed & Rewritten</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Includes image, benchmarks & technical facts. Formatted with clean bullet points.
                  </p>
                </div>
              </label>

              <label
                onClick={() => setSelectedPreset('organic_crypto')}
                className={`flex items-start p-3 rounded-xl border cursor-pointer transition ${
                  selectedPreset === 'organic_crypto'
                    ? 'border-sky-500 bg-sky-500/10 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={selectedPreset === 'organic_crypto'}
                  onChange={() => {}}
                  className="mt-0.5 text-sky-500"
                />
                <div className="ml-2.5">
                  <div className="text-xs font-semibold flex items-center space-x-1.5">
                    <span>@VitalikButerin Layer-2 Tech (Organic)</span>
                    <span className="text-[10px] text-emerald-400 font-normal">→ Passed & Rewritten</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Preserves statistics (94% drop) and factual technical claims.
                  </p>
                </div>
              </label>

              <label
                onClick={() => setSelectedPreset('ad_promo')}
                className={`flex items-start p-3 rounded-xl border cursor-pointer transition ${
                  selectedPreset === 'ad_promo'
                    ? 'border-rose-500 bg-rose-500/10 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={selectedPreset === 'ad_promo'}
                  onChange={() => {}}
                  className="mt-0.5 text-rose-500"
                />
                <div className="ml-2.5">
                  <div className="text-xs font-semibold flex items-center space-x-1.5">
                    <span>Token Presale / Airdrop Shill (Promotional Ad)</span>
                    <span className="text-[10px] text-rose-400 font-normal">→ Blocked by AI</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Contains urgent claims, token sale link, and #ad tag. Dropped automatically.
                  </p>
                </div>
              </label>
            </div>

            <button
              id="btn-simulate-tweet"
              onClick={handleSimulateTweet}
              disabled={isSimulatingPost}
              className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-sky-600/20 disabled:opacity-50 transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSimulatingPost ? 'Processing Pipeline...' : 'Simulate & Run Through Queue'}</span>
            </button>

            {simulationStatus && (
              <div className="mt-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
                <span>{simulationStatus}</span>
              </div>
            )}
          </div>

          {/* Telegram Channel Preview */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-[340px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xs">
                  📡
                </div>
                <div>
                  <div className="flex items-center space-x-1">
                    <h4 className="text-xs font-bold text-white">Destination Channel</h4>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20" />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {currentUser.settings.telegramChannelId || '@tech_pulse_daily'} (14.2k subscribers)
                  </p>
                </div>
              </div>

              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Live Feed
              </span>
            </div>

            {/* Published Posts in Channel */}
            <div className="flex-1 overflow-y-auto space-y-3 pt-3 pr-1">
              {channelPosts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
                  <Bot className="w-8 h-8 mb-2 opacity-50 text-slate-400" />
                  <p className="text-xs">No posts published to this channel yet.</p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Use the button above to simulate your first post.
                  </p>
                </div>
              ) : (
                channelPosts.map((post) => (
                  <div
                    key={post.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-semibold text-sky-400 flex items-center space-x-1">
                        <span>Source:</span>
                        <span>{post.sourceAuthor}</span>
                      </span>
                      <span>
                        {new Date(post.publishedAt || post.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {post.media && post.media.length > 0 && (
                      <div className="relative rounded-lg overflow-hidden border border-slate-800 max-h-36">
                        <img
                          src={post.media[0].url}
                          alt="Media preview"
                          className="w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white flex items-center space-x-1">
                          <ImageIcon className="w-2.5 h-2.5" />
                          <span>Media Attached</span>
                        </span>
                      </div>
                    )}

                    <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {post.processedContent}
                    </div>

                    <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="flex items-center space-x-1 text-emerald-400/90">
                        <Check className="w-3 h-3" />
                        <span>Preserved Facts Verified</span>
                      </span>
                      <span>Delivered via Bot</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
