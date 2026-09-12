import React, { useState } from 'react';
import {
  Send,
  Sliders,
  Cpu,
  Shield,
  User,
  Plus,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { BotUser } from '../types.ts';

interface NavbarProps {
  activeTab: 'simulator' | 'dashboard' | 'pipeline' | 'admin';
  setActiveTab: (tab: 'simulator' | 'dashboard' | 'pipeline' | 'admin') => void;
  users: BotUser[];
  currentUser: BotUser | null;
  onSelectUser: (userId: string) => void;
  onCreateUser: (username: string, firstName: string, plan: 'free' | 'pro' | 'enterprise') => void;
  onOpenGuide: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  users,
  currentUser,
  onSelectUser,
  onCreateUser,
  onOpenGuide,
}) => {
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newPlan, setNewPlan] = useState<'free' | 'pro' | 'enterprise'>('pro');

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername) return;
    onCreateUser(newUsername, newFirstName || 'Creator', newPlan);
    setShowUserModal(false);
    setNewUsername('');
    setNewFirstName('');
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20 text-white font-bold">
              <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">X ↔ Telegram</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  Multi-User SaaS
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Automated Cross-Posting & AI Rewriter</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
            <button
              id="nav-tab-simulator"
              onClick={() => setActiveTab('simulator')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'simulator'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram Bot Simulator</span>
            </button>

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
              <span>User Dashboard</span>
            </button>

            <button
              id="nav-tab-pipeline"
              onClick={() => setActiveTab('pipeline')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'pipeline'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>AI Pipeline Lab</span>
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

          {/* Right Action: User Context Switcher & Guide */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              id="btn-open-guide"
              onClick={onOpenGuide}
              title="Setup Guide & Architecture"
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            {/* Tenant User Switcher */}
            <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
              <User className="w-3.5 h-3.5 text-sky-400 mr-2" />
              <select
                id="user-tenant-select"
                value={currentUser?.id || ''}
                onChange={(e) => onSelectUser(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none cursor-pointer pr-1"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="bg-slate-900 text-slate-200">
                    {u.telegramUsername} ({u.plan.toUpperCase()})
                  </option>
                ))}
              </select>

              <button
                id="btn-add-tenant-user"
                onClick={() => setShowUserModal(true)}
                title="Create Isolated SaaS Tenant"
                className="ml-1.5 p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-sky-400 transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Tab bar */}
        <div className="md:hidden flex space-x-1 pb-3 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
              activeTab === 'simulator' ? 'bg-sky-600 text-white' : 'text-slate-400 bg-slate-800/40'
            }`}
          >
            Bot Simulator
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
              activeTab === 'dashboard' ? 'bg-sky-600 text-white' : 'text-slate-400 bg-slate-800/40'
            }`}
          >
            User Dashboard
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
              activeTab === 'pipeline' ? 'bg-sky-600 text-white' : 'text-slate-400 bg-slate-800/40'
            }`}
          >
            AI Lab
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

      {/* New Tenant Modal */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center space-x-2 text-sky-400 mb-2">
              <Sparkles className="w-5 h-5" />
              <h3 className="text-lg font-bold text-white">Create Isolated SaaS Tenant</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Every user operates in complete isolation with their own automated connections, X auth keys, and logs.
            </p>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Telegram Username</label>
                <input
                  type="text"
                  placeholder="@crypto_alpha"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  placeholder="Dave Wilson"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">SaaS Plan Tier</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['free', 'pro', 'enterprise'] as const).map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setNewPlan(plan)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium capitalize border transition ${
                        newPlan === plan
                          ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {plan}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20"
                >
                  Create & Switch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
