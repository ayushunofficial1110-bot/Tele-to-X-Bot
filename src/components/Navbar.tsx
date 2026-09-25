import React from 'react';
import {
  Send,
  Sliders,
  Cpu,
  Shield,
  User,
  HelpCircle,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { BotUser } from '../types.ts';

interface NavbarProps {
  activeTab: 'dashboard' | 'admin';
  setActiveTab: (tab: 'dashboard' | 'admin') => void;
  currentUser: BotUser | null;
  onLogout: () => void;
  onOpenGuide: () => void;
  onOpenLogin: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  onOpenGuide,
  onOpenLogin,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20 text-white font-bold">
              <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">X ↔ Telegram</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  Bot SaaS
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Automated Cross-Posting & AI Fact-Preserving Rewriter</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <button
              id="nav-tab-dashboard"
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>My Automations</span>
            </button>

            <button
              id="nav-tab-admin"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'admin'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin Panel</span>
            </button>
          </nav>

          {/* Right Action: User Context & Actions */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              id="btn-open-guide"
              onClick={onOpenGuide}
              title="Architecture & Deployment Guide"
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            {currentUser ? (
              <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-white leading-tight">
                    {currentUser.telegramUsername}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono">
                    {currentUser.plan} Plan
                  </div>
                </div>
                <button
                  id="btn-logout"
                  onClick={onLogout}
                  title="Log out from this account"
                  className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow-sm transition"
              >
                <User className="w-3.5 h-3.5" />
                <span>Log In</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Tab bar */}
        <div className="md:hidden flex space-x-1 pb-3 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
              activeTab === 'dashboard' ? 'bg-sky-600 text-white' : 'text-slate-400 bg-slate-800/40'
            }`}
          >
            My Automations
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
              activeTab === 'admin' ? 'bg-indigo-600 text-white' : 'text-slate-400 bg-slate-800/40'
            }`}
          >
            Admin Panel
          </button>
        </div>
      </div>
    </header>
  );
};
