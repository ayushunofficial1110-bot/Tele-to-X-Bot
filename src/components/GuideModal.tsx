import React from 'react';
import {
  Send,
  ShieldCheck,
  CheckCircle2,
  Key,
  Radio,
  BookOpen,
  Server,
  Zap,
} from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6 text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Production Setup & Architecture Guide</h3>
              <p className="text-xs text-slate-400">Public Telegram Bot for X (Twitter) ↔ Telegram Automation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* Steps List */}
        <div className="space-y-4 text-xs leading-relaxed">
          {/* Step 1 */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center space-x-2 text-sky-400 font-bold">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 flex items-center justify-center text-[10px]">1</span>
              <span>Register Public Bot on Telegram</span>
            </div>
            <p className="text-slate-300">
              Open Telegram and search for <strong className="text-white">@BotFather</strong>. Send the command <code className="bg-slate-900 px-1.5 py-0.5 rounded text-sky-300">/newbot</code>, choose a name and username (e.g. <code className="text-slate-200">@MyX2TelegramBot</code>), and copy the HTTP API token provided.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center space-x-2 text-sky-400 font-bold">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 flex items-center justify-center text-[10px]">2</span>
              <span>Configure Webhook in Admin Panel</span>
            </div>
            <p className="text-slate-300">
              Navigate to the <strong className="text-white">Admin Panel</strong> tab. Paste your token and click <strong className="text-white">"Test Connection & Set Webhook"</strong>. The server automatically calls Telegram's <code className="bg-slate-900 px-1.5 py-0.5 rounded text-sky-300">setWebhook</code> API pointing to <code className="text-sky-300">/api/telegram/webhook</code>.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center space-x-2 text-sky-400 font-bold">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 flex items-center justify-center text-[10px]">3</span>
              <span>Grant Channel Admin Rights</span>
            </div>
            <p className="text-slate-300">
              Add your bot to your target Telegram Channel as an <strong className="text-white">Administrator</strong> with the <strong className="text-white">"Post Messages"</strong> permission enabled. This allows the bot to seamlessly publish rewritten posts on your behalf.
            </p>
          </div>

          {/* Step 4 */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Multi-Tenant User Isolation Guarantee</span>
            </div>
            <p className="text-slate-300">
              The platform is built strictly as a <strong className="text-white">User ↔ Bot SaaS</strong>. Each user registers directly with the bot upon sending <code className="bg-slate-900 px-1.5 py-0.5 rounded text-sky-300">/start</code>. Individual automations, rate counters, custom API credentials, and log histories are partitioned strictly by <code className="text-emerald-300">userId</code>. Admins never interfere with user workflows.
            </p>
          </div>

          {/* Step 5 */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold">
              <Zap className="w-4 h-4" />
              <span>Smart Processing & Compliance</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>
                <strong className="text-slate-200">Fact-Preserving AI Rewriting:</strong> Formats posts for natural readability without changing dates, numbers, technical metrics, or quotes.
              </li>
              <li>
                <strong className="text-slate-200">Ad & Shill Detection:</strong> Multimodal heuristic + Gemini model analyzes text, links, and hashtags (#ad, token presale links) to discard spam before it reaches channels.
              </li>
              <li>
                <strong className="text-slate-200">Anti-Scraping / Official APIs:</strong> Adheres to strict X API rate limits with in-memory throttling, SHA-256 deduplication, and exponential backoff retry.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-600/20"
          >
            Got it, Let's Build!
          </button>
        </div>
      </div>
    </div>
  );
};
