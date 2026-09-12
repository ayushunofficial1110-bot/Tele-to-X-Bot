import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { TelegramSimulator } from './components/TelegramSimulator.tsx';
import { UserDashboard } from './components/UserDashboard.tsx';
import { PipelineLab } from './components/PipelineLab.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { GuideModal } from './components/GuideModal.tsx';
import { BotUser, Automation } from './types.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'dashboard' | 'pipeline' | 'admin'>('simulator');
  const [users, setUsers] = useState<BotUser[]>([]);
  const [currentUser, setCurrentUser] = useState<BotUser | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initial load
  useEffect(() => {
    fetchUsers();
  }, []);

  // When currentUser changes, reload automations
  useEffect(() => {
    if (currentUser) {
      fetchAutomations(currentUser.id);
    }
  }, [currentUser?.id]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/user/users');
      const data = await res.json();
      if (data.ok && Array.isArray(data.users)) {
        setUsers(data.users);
        if (!currentUser && data.users.length > 0) {
          setCurrentUser(data.users[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load users:', err);
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

  const handleSelectUser = (userId: string) => {
    const found = users.find((u) => u.id === userId);
    if (found) {
      setCurrentUser(found);
    }
  };

  const handleCreateUser = async (
    username: string,
    firstName: string,
    plan: 'free' | 'pro' | 'enterprise'
  ) => {
    try {
      const res = await fetch('/api/user/switch-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, firstName, plan }),
      });
      const data = await res.json();
      if (data.ok && data.user) {
        await fetchUsers();
        setCurrentUser(data.user);
      }
    } catch (err) {
      console.error('Failed to create tenant user:', err);
    }
  };

  const handleRefresh = () => {
    if (currentUser) {
      fetchAutomations(currentUser.id);
      fetchUsers();
    }
  };

  if (loading || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-mono">Initializing Multi-User SaaS Engine...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* App Header & Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        users={users}
        currentUser={currentUser}
        onSelectUser={handleSelectUser}
        onCreateUser={handleCreateUser}
        onOpenGuide={() => setIsGuideOpen(true)}
      />

      {/* Main Tab View Canvas */}
      <main className="flex-1 pb-16">
        {activeTab === 'simulator' && (
          <TelegramSimulator
            currentUser={currentUser}
            automations={automations}
            onAutomationChange={handleRefresh}
          />
        )}

        {activeTab === 'dashboard' && (
          <UserDashboard
            currentUser={currentUser}
            automations={automations}
            onRefresh={handleRefresh}
          />
        )}

        {activeTab === 'pipeline' && <PipelineLab />}

        {activeTab === 'admin' && <AdminDashboard />}
      </main>

      {/* Architecture & Deployment Guide Modal */}
      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
