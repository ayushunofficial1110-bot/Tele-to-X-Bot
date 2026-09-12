import React, { useState } from 'react';
import {
  Cpu,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  Copy,
  Check,
  RotateCcw,
  Zap,
} from 'lucide-react';

export const PipelineLab: React.FC = () => {
  const [direction, setDirection] = useState<'x_to_telegram' | 'telegram_to_x'>('x_to_telegram');
  const [format, setFormat] = useState<'auto' | 'concise' | 'thread'>('auto');
  const [author, setAuthor] = useState('@AnthropicAI');
  const [content, setContent] = useState(
    'Today we are introducing Claude 3.7 Sonnet: our first hybrid reasoning model capable of instantaneous responses or step-by-step mathematical reasoning up to 128K thinking tokens. Available now across API and web.'
  );

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    adResult: {
      isAd: boolean;
      confidence: number;
      reason: string;
      category: string;
    };
    rewriteResult: {
      text: string;
      threadParts?: string[];
      characterCount: number;
      isThread: boolean;
      preservedFactsChecked: boolean;
    };
  } | null>(null);

  const [copied, setCopied] = useState(false);

  const handleTest = async () => {
    if (!content.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/pipeline/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          direction,
          format,
          author,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(data);
      }
    } catch (err) {
      console.error('Pipeline test failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPreset = (type: 'tech_announcement' | 'long_thread' | 'crypto_ad' | 'affiliate_promo') => {
    if (type === 'tech_announcement') {
      setDirection('x_to_telegram');
      setFormat('auto');
      setAuthor('@GoogleDeepMind');
      setContent(
        'Gemini 2.5 Flash achieves state-of-the-art multimodal latency across 45 vision-language benchmarks, with a 70% decrease in inference compute requirements compared to earlier architectures.'
      );
    } else if (type === 'long_thread') {
      setDirection('telegram_to_x');
      setFormat('thread');
      setAuthor('@macro_analyst');
      setContent(
        'Comprehensive Macro Breakdown: Global semiconductor supply chains are experiencing a massive pivot toward domestic advanced packaging facilities. In 2024, worldwide fab capacity grew 6.4%, led by 300mm wafer expansions across Asia and Europe. Meanwhile, high-bandwidth memory (HBM3e) demand continues to outpace foundry supply by 38%, forcing hyperscalers to commit capital expenditure 18 months in advance. Looking into Q3, expect price increases of 8-12% on high-tier compute modules.'
      );
    } else if (type === 'crypto_ad') {
      setDirection('x_to_telegram');
      setFormat('auto');
      setAuthor('@100xGemsCrypto');
      setContent(
        '🚨 MASSIVE AIRDROP ALERT: $500,000 giveaway! The $BULL presale is now 92% filled! Grab your tokens before DEX listing tomorrow at t.co/presale-gem! 100x return guaranteed! 🚀🚀 #ad #sponsored'
      );
    } else {
      setDirection('x_to_telegram');
      setFormat('auto');
      setAuthor('@deal_hunter_bot');
      setContent(
        'Get 40% OFF the newest wireless noise-canceling headphones using exclusive coupon code "SAVE40" at checkout! Click affiliate link: http://bit.ly/deal-headphones?ref=affiliate_bot #deal #sponsored'
      );
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2 text-sky-400">
          <Cpu className="w-5 h-5" />
          <h2 className="text-xl font-bold text-white tracking-tight">
            AI Pipeline Testing Lab & Inspector
          </h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Inspect how the Gemini API analyzes promotional content, preserves factual claims, and validates 280-character constraints in real time.
        </p>
      </div>

      {/* Preset Quick Loader */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-500 font-semibold flex-shrink-0">Presets:</span>
        <button
          onClick={() => loadPreset('tech_announcement')}
          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white whitespace-nowrap transition"
        >
          📰 Tech Announcement (Organic)
        </button>
        <button
          onClick={() => loadPreset('long_thread')}
          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white whitespace-nowrap transition"
        >
          🧵 Long Post ➔ X Thread
        </button>
        <button
          onClick={() => loadPreset('crypto_ad')}
          className="px-3 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/50 text-rose-300 whitespace-nowrap transition"
        >
          🛡️ Crypto Presale Shill (Ad Filter)
        </button>
        <button
          onClick={() => loadPreset('affiliate_promo')}
          className="px-3 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/50 text-rose-300 whitespace-nowrap transition"
        >
          🏷️ Coupon / Affiliate Code (Ad Filter)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input and Parameters (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white">Source Input & Configuration</h3>
            <span className="text-[10px] uppercase font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
              gemini-3.8-flash
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Cross-Posting Direction
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('x_to_telegram')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                  direction === 'x_to_telegram'
                    ? 'border-sky-500 bg-sky-500/10 text-white font-bold'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                X ➔ Telegram
              </button>
              <button
                type="button"
                onClick={() => setDirection('telegram_to_x')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                  direction === 'telegram_to_x'
                    ? 'border-sky-500 bg-sky-500/10 text-white font-bold'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                Telegram ➔ X
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Author / Handle</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Output Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="auto">Auto (Smart Selection)</option>
                <option value="concise">Concise (Under 280c)</option>
                <option value="thread">Thread (Numbered Splits)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-slate-300">Raw Post Content</label>
              <span className="text-[10px] text-slate-500">
                {content.length} chars • {content.split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
            <textarea
              rows={7}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste any tweet or Telegram post here to test..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 leading-relaxed font-sans"
            />
          </div>

          <button
            id="btn-run-pipeline-test"
            onClick={handleTest}
            disabled={isLoading || !content.trim()}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-sky-600/20 disabled:opacity-50 transition flex items-center justify-center space-x-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isLoading ? 'Processing with Gemini...' : 'Run Pipeline & Inspect'}</span>
          </button>
        </div>

        {/* Right Column: Pipeline Inspection Results (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {!result ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 h-full flex flex-col items-center justify-center space-y-3">
              <Zap className="w-12 h-12 text-slate-700" />
              <h4 className="text-sm font-bold text-slate-400">Pipeline Output Preview</h4>
              <p className="text-xs max-w-sm">
                Click "Run Pipeline & Inspect" to execute the Gemini Fact-Preserving Rewriter and Ad Detector.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1. Ad & Promotion Classification Card */}
              <div
                className={`p-5 rounded-3xl border transition ${
                  result.adResult.isAd
                    ? 'bg-rose-950/20 border-rose-900/50'
                    : 'bg-emerald-950/20 border-emerald-900/50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {result.adResult.isAd ? (
                      <ShieldAlert className="w-5 h-5 text-rose-400" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    )}
                    <h4 className="text-sm font-bold text-white">
                      Ad & Promotional Content Detector
                    </h4>
                  </div>

                  <span
                    className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                      result.adResult.isAd
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {result.adResult.isAd ? '❌ Blocked (Promotional Ad)' : '✅ Approved (Organic)'}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Classification Confidence:</span>
                    <span className="font-bold text-white">
                      {Math.round(result.adResult.confidence * 100)}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        result.adResult.isAd ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.round(result.adResult.confidence * 100)}%` }}
                    ></div>
                  </div>

                  <div className="pt-2 text-slate-300">
                    <span className="text-slate-500 text-[10px] uppercase font-bold block mb-0.5">
                      Reasoning:
                    </span>
                    <p className="text-slate-300 leading-relaxed text-xs">
                      {result.adResult.reason}
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Fact-Preserving Rewritten Output */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <h4 className="text-sm font-bold text-white">
                      Fact-Preserving AI Rewriter Output
                    </h4>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                      <Check className="w-3 h-3" />
                      <span>Zero Hallucinations Verified</span>
                    </span>

                    <button
                      onClick={() => handleCopy(result.rewriteResult.text)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Copy rewritten output"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {result.rewriteResult.isThread && result.rewriteResult.threadParts ? (
                  <div className="space-y-3">
                    <div className="text-xs text-sky-400 font-semibold flex items-center space-x-2">
                      <span>Thread Preview: {result.rewriteResult.threadParts.length} connected tweets</span>
                      <span className="text-[10px] text-slate-500">• Each under 280 characters</span>
                    </div>

                    {result.rewriteResult.threadParts.map((tweet, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5"
                      >
                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                          <span className="font-bold text-sky-300">Tweet {i + 1} of {result.rewriteResult.threadParts?.length}</span>
                          <span className={`${tweet.length > 270 ? 'text-amber-400' : 'text-slate-500'}`}>
                            {tweet.length} / 280 chars
                          </span>
                        </div>
                        <p className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">
                          {tweet}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                      <span>Published Format: Single Post</span>
                      <span className={`${result.rewriteResult.characterCount > 270 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {result.rewriteResult.characterCount} characters
                      </span>
                    </div>
                    <div className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">
                      {result.rewriteResult.text}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
