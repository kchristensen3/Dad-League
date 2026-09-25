/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc,
  getDoc,
  limit,
  where
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestoreUtils';
import { Session, Activity, Member, League } from './types';
import { 
  Calendar as CalendarIcon, 
  MessageSquare, 
  List, 
  User as UserIcon, 
  Info,
  LogOut,
  LogIn,
  Plus,
  Send,
  Users,
  Trophy,
  Activity as ActivityIcon,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Components
import LoginScreen from './components/LoginScreen';
import About from './components/About';
import CalendarView from './components/CalendarView';
import Backlog from './components/Backlog';
import Chat from './components/Chat';
import Profile from './components/Profile';
import CommunityBoard from './components/CommunityBoard';
import Members from './components/Members';
import LeagueManager from './components/LeagueManager';
import LegalModal from './components/LegalModal';

// Safe storage helpers to avoid DOMException/SecurityError in iframes
function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function safeRemoveStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [showLoginScreen, setShowLoginScreen] = useState(true);
  const [member, setMember] = useState<Member | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(() => safeGetStorage('selectedLeagueId'));
  const [activeTab, setActiveTab] = useState(() => {
    if (safeGetStorage('hasSeenAbout')) return 'calendar';
    return 'about';
  });
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ title: string, message: string } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState('general');
  const [isScrolled, setIsScrolled] = useState(false);
  const [showLeagueSwitcher, setShowLeagueSwitcher] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'privacy' | 'terms' | null>(null);

  useEffect(() => {
    if (selectedLeagueId) {
      safeSetStorage('selectedLeagueId', selectedLeagueId);
    } else {
      safeRemoveStorage('selectedLeagueId');
    }
  }, [selectedLeagueId]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          // Sync user to members collection
          const memberRef = doc(db, 'members', u.uid);
          const memberSnap = await getDoc(memberRef);
          
          if (!memberSnap.exists()) {
            const newMember: Member = {
              userId: u.uid,
              displayName: u.displayName || 'Anonymous Dad',
              email: u.email || '',
              photoURL: u.photoURL || '',
              createdAt: new Date().toISOString(),
              leagueIds: []
            };
            try {
              await setDoc(memberRef, newMember);
              setMember(newMember);
            } catch (err) {
              console.warn("Could not write member doc:", err);
              setMember(newMember);
            }
          } else {
            setMember(memberSnap.data() as Member);
          }
        } catch (err) {
          console.warn("Could not read member doc:", err);
          setMember({
            userId: u.uid,
            displayName: u.displayName || 'Anonymous Dad',
            email: u.email || '',
            photoURL: u.photoURL || '',
            createdAt: new Date().toISOString(),
            leagueIds: []
          });
        }
      } else {
        setMember(null);
      }
      setLoading(false);
    });

    // Safety timeout: Never leave user stuck on spinner
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    // Request notification permission safely
    try {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {}

    return () => {
      unsubscribeAuth();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch user's leagues
    const qL = query(collection(db, 'leagues'), where('memberIds', 'array-contains', user.uid));
    const unsubscribeL = onSnapshot(qL, (snap) => {
      const leagueList = snap.docs.map(d => ({ id: d.id, ...d.data() } as League));
      setLeagues(leagueList);
      
      // If selected league is not in the list anymore, clear it
      if (selectedLeagueId && !leagueList.find(l => l.id === selectedLeagueId)) {
        setSelectedLeagueId(null);
      }
    }, (err) => console.warn("Leagues query warning:", err));

    return () => unsubscribeL();
  }, [user, selectedLeagueId]);

  useEffect(() => {
    if (!user || !selectedLeagueId) return;

    // Fetch sessions specifically for this league and sort client-side
    const qS = query(
      collection(db, 'sessions'), 
      where('leagueId', '==', selectedLeagueId)
    );

    const unsubscribeS = onSnapshot(qS, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setSessions(list);
    }, (err) => console.warn("Sessions query warning:", err));

    // Listener for NEW sessions (push notification feel)
    const qNewSessions = query(
      collection(db, 'sessions'), 
      where('leagueId', '==', selectedLeagueId),
      limit(5)
    );
    let initialLoad = true;
    
    const unsubscribeSessions = onSnapshot(qNewSessions, (snap) => {
      if (initialLoad) {
        initialLoad = false;
        return;
      }
      
      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          const title = `New Event: ${data.activityName}`;
          const message = `Hosted by ${data.hostName} on ${new Date(data.date).toLocaleDateString()}. RSVP now!`;
          
          setNotification({ title, message });
          
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body: message, icon: '/favicon.ico' });
          }
          
          setTimeout(() => setNotification(null), 8000);
        }
      });
    }, (err) => console.warn("New events listener warning:", err));

    return () => {
      unsubscribeS();
      unsubscribeSessions();
    };
  }, [user, selectedLeagueId]);

  const activeLeague = leagues.find(l => l.id === selectedLeagueId);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
      setShowLoginScreen(false);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setMember(null);
      setShowLoginScreen(true);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full"
        />
        <p className="text-xs uppercase font-black tracking-widest text-slate-400">Loading Dad League...</p>
      </div>
    );
  }

  // Show login screen if user is not authenticated OR when login screen view is requested
  if (showLoginScreen || !user) {
    return (
      <>
        <LoginScreen
          user={user}
          onLogin={handleLogin}
          onEnterDashboard={() => setShowLoginScreen(false)}
          onLogout={handleLogout}
          isLoading={loading}
        />
        <LegalModal
          isOpen={legalModalTab !== null}
          initialTab={legalModalTab || 'privacy'}
          onClose={() => setLegalModalTab(null)}
        />
      </>
    );
  }

  if (!selectedLeagueId) {
    return (
      <div className="min-h-screen bg-slate-100">
        <header className="py-6 px-6 border-b border-slate-200 bg-white">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-lg">D</div>
              <h1 className="text-xl font-black tracking-tight uppercase">DAD<span className="text-indigo-600">LEAGUE</span></h1>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowLoginScreen(true)} 
                className="px-3.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <LogIn size={14} /> Login Screen
              </button>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Sign Out">
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </header>
        <LeagueManager 
          user={user} 
          leagues={leagues} 
          onLeagueSelected={(id) => setSelectedLeagueId(id)} 
        />
      </div>
    );
  }

  const tabs = [
    { id: 'calendar', label: 'Home', icon: CalendarIcon },
    { id: 'backlog', label: 'Ideas', icon: List },
    { id: 'board', label: 'Board', icon: MessageSquare },
    { id: 'chat', label: 'Chat', icon: Send },
    { id: 'members', label: 'League', icon: Users },
  ];

  return (
    <div className={`min-h-screen bg-slate-100 text-slate-900 font-sans ${activeTab === 'chat' ? 'h-screen flex flex-col overflow-hidden' : 'pb-24'}`}>
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -100, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -100, x: '-50%' }}
            className="fixed top-0 left-1/2 z-[100] w-full max-w-sm px-4"
          >
            <div className="bg-slate-900 text-white p-4 rounded-3xl shadow-2xl border border-slate-700 flex flex-col gap-1 items-center text-center">
              <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center mb-1 text-slate-600">
                <CalendarIcon size={20} />
              </div>
              <h4 className="font-black uppercase tracking-tight text-lg">{notification.title}</h4>
              <p className="text-slate-400 text-xs font-bold leading-relaxed">{notification.message}</p>
              <button 
                onClick={() => {
                  setActiveTab('calendar');
                  setNotification(null);
                }}
                className="mt-2 text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300"
              >
                View & RSVP
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className={`sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 transition-all duration-300 ${isScrolled ? 'py-2 px-4 shadow-md' : 'py-4 px-6 shadow-sm'}`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-3 group px-1">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-lg -rotate-3 transition-transform group-hover:rotate-0 duration-300">
                <Trophy size={20} className="text-white rotate-3 group-hover:rotate-0 transition-transform" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-black uppercase tracking-tighter leading-none">
                  Dad<span className="text-indigo-600">League</span>
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1 h-1 bg-indigo-400 rounded-full"></div>
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Your Crew</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 relative">
            <button 
              onClick={() => setShowLoginScreen(true)} 
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all cursor-pointer shadow-xs"
              title="View Login Screen"
            >
              <LogIn size={14} /> Login Screen
            </button>

            <div className="hidden md:flex items-center bg-slate-50 border border-slate-200 rounded-full px-3 py-1 mr-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse mr-2"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{activeLeague?.name}</span>
            </div>
            
            <button 
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={`transition-all rounded-full p-0.5 border-2 relative ${showUserMenu ? 'border-indigo-600 scale-105 shadow-sm' : 'border-slate-200 hover:border-indigo-400'}`}
            >
              <img 
                src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                className={`${isScrolled ? 'w-8 h-8' : 'w-10 h-10'} rounded-full shadow-md object-cover`} 
                alt="Profile" 
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border border-slate-200 shadow-sm">
                <ChevronDown size={10} className={`text-slate-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {/* User Menu Dropdown */}
            <AnimatePresence>
              {showUserMenu && (
                <>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowUserMenu(false)}
                    className="fixed inset-0 z-40"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <img 
                          src={user.photoURL || ''} 
                          className="w-10 h-10 rounded-full border border-white shadow-sm" 
                          alt="" 
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-black text-sm text-slate-900 truncate">{user.displayName}</span>
                          <span className="text-[10px] text-slate-500 truncate">{user.email}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-2">
                       <div className="px-3 py-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active League</span>
                      </div>
                      <button 
                        onClick={() => {
                          setShowLeagueSwitcher(true);
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xs uppercase">
                            {activeLeague?.name.charAt(0)}
                          </div>
                          <div className="flex flex-col items-start">
                            <span className="font-bold text-sm text-slate-900">{activeLeague?.name}</span>
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tight">Switch League</span>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                      </button>
                    </div>

                    <div className="p-2 border-t border-slate-100">
                      <button 
                        onClick={() => {
                          setShowLoginScreen(true);
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 transition-colors text-indigo-700"
                      >
                        <LogIn size={18} />
                        <span className="font-bold text-sm">View Login Screen</span>
                      </button>
                      <button 
                        onClick={() => {
                          setActiveTab('profile');
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors text-slate-600 hover:text-indigo-600"
                      >
                        <UserIcon size={18} />
                        <span className="font-bold text-sm">Account Settings</span>
                      </button>
                      <button 
                        onClick={() => {
                          setActiveTab('about');
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors text-slate-600 hover:text-indigo-600"
                      >
                        <Info size={18} />
                        <span className="font-bold text-sm">What Is Dad League?</span>
                      </button>
                      <button 
                        onClick={() => {
                          setLegalModalTab('privacy');
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors text-slate-600 hover:text-indigo-600"
                      >
                        <ShieldCheck size={18} />
                        <span className="font-bold text-sm">Privacy & Terms</span>
                      </button>
                      <a 
                        href="/dad-league-source.zip" 
                        download="dad-league-source.zip"
                        onClick={() => setShowUserMenu(false)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-50 transition-colors text-indigo-600 font-bold"
                      >
                        <Download size={18} />
                        <div className="flex flex-col text-left">
                          <span className="text-sm leading-tight">Export App (.ZIP)</span>
                          <span className="text-[10px] text-slate-400 font-normal">Capacitor & GitHub ready</span>
                        </div>
                      </a>
                    </div>

                    <div className="p-2 border-t border-slate-100 bg-slate-50/30">
                      <button 
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 transition-colors text-red-500"
                      >
                        <LogOut size={18} />
                        <span className="font-bold text-sm">Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* League Switcher Dropdown */}
      <AnimatePresence>
        {showLeagueSwitcher && (
          <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowLeagueSwitcher(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-black uppercase text-xs tracking-widest text-slate-400">Switch League</h3>
                <button onClick={() => setSelectedLeagueId(null)} className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-700">Manage All</button>
              </div>
              <div className="grid gap-2">
                {leagues.map(l => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setSelectedLeagueId(l.id);
                      setShowLeagueSwitcher(false);
                    }}
                    className={`w-full p-4 rounded-xl flex items-center gap-3 transition-all ${
                      selectedLeagueId === l.id 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black ${selectedLeagueId === l.id ? 'bg-white/20' : 'bg-white shadow-sm text-indigo-600'}`}>
                      {l.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm leading-tight">{l.name}</div>
                      <div className={`text-[10px] uppercase font-black tracking-widest transition-colors ${selectedLeagueId === l.id ? 'text-white/60' : 'text-slate-400'}`}>
                        {l.memberIds.length} Members
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <button 
                onClick={() => {
                  setSelectedLeagueId(null);
                  setShowLeagueSwitcher(false);
                }}
                className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-xs uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={14} /> New League
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className={`max-w-4xl mx-auto p-4 lg:p-8 ${activeTab === 'chat' ? 'flex-1 overflow-hidden flex flex-col w-full' : ''}`}>
        <AnimatePresence mode="wait">
          {activeTab === 'calendar' && (
            <motion.div 
              key="calendar"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CalendarView 
                user={user} 
                leagueId={selectedLeagueId}
                sessions={sessions} 
                onNavigateToChat={(threadId) => {
                  setSelectedThreadId(threadId);
                  setActiveTab('chat');
                }}
              />
            </motion.div>
          )}
          {activeTab === 'backlog' && (
            <motion.div 
              key="backlog"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Backlog user={user} leagueId={selectedLeagueId} />
            </motion.div>
          )}
          {activeTab === 'board' && (
            <motion.div 
              key="board"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CommunityBoard user={user} leagueId={selectedLeagueId} />
            </motion.div>
          )}
          {activeTab === 'chat' && (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full flex flex-col overflow-hidden"
            >
              <Chat 
                user={user} 
                leagueId={selectedLeagueId}
                sessions={sessions}
                selectedThreadId={selectedThreadId}
                setSelectedThreadId={setSelectedThreadId}
              />
            </motion.div>
          )}
          {activeTab === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Profile 
                user={user} 
                member={member} 
                onLogout={handleLogout} 
                onShowLoginScreen={() => setShowLoginScreen(true)} 
              />
            </motion.div>
          )}
          {activeTab === 'members' && (
            <motion.div 
              key="members"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Members user={user} leagueId={selectedLeagueId} />
            </motion.div>
          )}
          {activeTab === 'about' && (
            <motion.div 
              key="about"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <About league={activeLeague} onAccept={() => {
                safeSetStorage('hasSeenAbout', 'true');
                setActiveTab('calendar');
              }} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <AnimatePresence>
        {!isScrolled && (
          <motion.nav 
            id="main-navigation"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg z-40 p-1.5 rounded-full bg-white/45 backdrop-blur-2xl backdrop-saturate-200 border border-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.12),0_1px_2px_0_rgba(255,255,255,0.8)_inset,0_-1px_2px_0_rgba(0,0,0,0.04)_inset]"
          >
            <div className="flex items-center justify-between relative">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`nav-tab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex flex-col items-center justify-center flex-1 py-2 px-1 rounded-full transition-all duration-300 group select-none ${
                      isActive 
                        ? 'text-indigo-900 font-bold' 
                        : 'text-slate-600 hover:text-slate-900 active:scale-95'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-liquid-capsule"
                        transition={{ type: 'spring', bounce: 0.22, duration: 0.5 }}
                        className="absolute inset-0 rounded-full bg-white/75 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_1px_rgba(255,255,255,0.9)_inset] border border-white/90"
                      />
                    )}
                    <span className="relative z-10 flex flex-col items-center gap-0.5">
                      <tab.icon 
                        size={19} 
                        className={`transition-transform duration-300 ${isActive ? 'scale-110 stroke-[2.35] text-indigo-700 drop-shadow-[0_1px_2px_rgba(79,70,229,0.2)]' : 'stroke-[1.8] group-hover:scale-105'}`} 
                      />
                      <span className={`text-[9px] tracking-tight uppercase font-black transition-colors duration-200 ${isActive ? 'text-indigo-900' : 'text-slate-500'}`}>
                        {tab.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <LegalModal
        isOpen={legalModalTab !== null}
        initialTab={legalModalTab || 'privacy'}
        onClose={() => setLegalModalTab(null)}
      />
    </div>
  );
}

