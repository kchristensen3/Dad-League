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
  Plus,
  Send,
  Users,
  Trophy,
  Activity as ActivityIcon,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Components
import About from './components/About';
import CalendarView from './components/CalendarView';
import Backlog from './components/Backlog';
import Chat from './components/Chat';
import Profile from './components/Profile';
import CommunityBoard from './components/CommunityBoard';
import Members from './components/Members';
import LeagueManager from './components/LeagueManager';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(localStorage.getItem('selectedLeagueId'));
  const [activeTab, setActiveTab] = useState(() => {
    if (localStorage.getItem('hasSeenAbout')) return 'calendar';
    return 'about';
  });
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ title: string, message: string } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState('general');
  const [isScrolled, setIsScrolled] = useState(false);
  const [showLeagueSwitcher, setShowLeagueSwitcher] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (selectedLeagueId) {
      localStorage.setItem('selectedLeagueId', selectedLeagueId);
    } else {
      localStorage.removeItem('selectedLeagueId');
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
            handleFirestoreError(err, OperationType.WRITE, `members/${u.uid}`);
          }
        } else {
          setMember(memberSnap.data() as Member);
        }
      } else {
        setMember(null);
      }
      setLoading(false);
    });

    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => unsubscribeAuth();
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
    }, (err) => handleFirestoreError(err, OperationType.GET, 'leagues'));

    return () => unsubscribeL();
  }, [user, selectedLeagueId]);

  useEffect(() => {
    if (!user || !selectedLeagueId) return;

    // Fetch sessions specifically for this league
    const qS = query(
      collection(db, 'sessions'), 
      where('leagueId', '==', selectedLeagueId),
      orderBy('date', 'asc')
    );

    const unsubscribeS = onSnapshot(qS, (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'sessions'));

    // Listener for NEW sessions (push notification feel)
    const qNewSessions = query(
      collection(db, 'sessions'), 
      where('leagueId', '==', selectedLeagueId),
      orderBy('date', 'desc'), 
      limit(1)
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
    }, (err) => console.error("New events listener error:", err));

    return () => {
      unsubscribeS();
      unsubscribeSessions();
    };
  }, [user, selectedLeagueId]);

  const activeLeague = leagues.find(l => l.id === selectedLeagueId);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent"></div>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-4">
            <h1 className="text-6xl font-black tracking-tight uppercase">
              DAD<span className="text-indigo-500">LEAGUE</span>
            </h1>
            <p className="text-slate-400 font-medium text-lg">
              The premier league for dads who need a break.
              Plan your hangs. Connect with the crew.
            </p>
          </div>

          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-white text-slate-900 rounded-2xl font-bold text-xl hover:bg-slate-100 transition-all flex items-center justify-center gap-3 shadow-2xl shadow-slate-950/50 active:scale-95"
          >
            <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="Google" />
            Join the League
          </button>
        </motion.div>
      </div>
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
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
              <LogOut size={20} />
            </button>
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
            <div className="hidden sm:flex items-center bg-slate-50 border border-slate-200 rounded-full px-3 py-1 mr-1">
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
              <Profile user={user} member={member} onLogout={handleLogout} />
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
                localStorage.setItem('hasSeenAbout', 'true');
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
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="fixed bottom-4 left-4 right-4 bg-white/95 backdrop-blur-md text-slate-900 border border-slate-200 px-2 py-3 z-40 rounded-2xl shadow-xl"
          >
            <div className="max-w-xl mx-auto flex items-center justify-between">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                    activeTab === tab.id 
                      ? 'text-indigo-600 bg-indigo-50 shadow-inner border border-indigo-100' 
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <tab.icon size={20} className={activeTab === tab.id ? 'scale-110' : ''} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                </button>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}

