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
  updateDoc, 
  arrayUnion, 
  getDoc, 
  limit, 
  where 
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestoreUtils';
import { Session, Activity, Member, League } from './types';
import { syncLeaguesAndRosters } from './lib/rosterSync';
import { sendDeviceNotification } from './lib/notificationService';
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
  Download,
  Bell,
  X
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
import InviteLandingCard from './components/InviteLandingCard';
import { App as CapApp } from '@capacitor/app';
import { 
  getInviteCodeFromUrl, 
  getStoredInviteCode, 
  storePendingInviteCode, 
  clearPendingInviteCode, 
  autoJoinLeagueWithCode 
} from './lib/inviteUtils';

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
  const [showLoginScreen, setShowLoginScreen] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(() => safeGetStorage('selectedLeagueId'));
  const [activeTab, setActiveTab] = useState(() => {
    if (safeGetStorage('hasSeenAbout')) return 'calendar';
    return 'about';
  });
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ 
    title: string; 
    message: string; 
    targetTab?: string; 
    actionLabel?: string; 
  } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState('general');
  const [isScrolled, setIsScrolled] = useState(false);
  const [showLeagueSwitcher, setShowLeagueSwitcher] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'privacy' | 'terms' | null>(null);
  const [activeInviteCode, setActiveInviteCode] = useState<string | null>(() => getInviteCodeFromUrl() || getStoredInviteCode());
  const [showInviteModal, setShowInviteModal] = useState<boolean>(() => Boolean(getInviteCodeFromUrl()));

  // 1. Detect URL invite codes and Capacitor Native App deep links
  useEffect(() => {
    const urlCode = getInviteCodeFromUrl();
    if (urlCode) {
      storePendingInviteCode(urlCode);
      setActiveInviteCode(urlCode);
      setShowInviteModal(true);
    }

    let removeAppListener: (() => void) | null = null;
    CapApp.addListener('appUrlOpen', (event) => {
      try {
        const parsed = new URL(event.url);
        const invite = parsed.searchParams.get('invite') || parsed.searchParams.get('code');
        if (invite) {
          const clean = invite.trim().toUpperCase();
          storePendingInviteCode(clean);
          setActiveInviteCode(clean);
          setShowInviteModal(true);
        }
      } catch (e) {
        const match = event.url.match(/[?&](?:invite|code)=([a-zA-Z0-9_-]+)/i);
        if (match && match[1]) {
          const clean = match[1].trim().toUpperCase();
          storePendingInviteCode(clean);
          setActiveInviteCode(clean);
          setShowInviteModal(true);
        }
      }
    }).then(sub => {
      removeAppListener = () => sub.remove();
    }).catch(() => {
      // Browser environment without capacitor app plugin
    });

    return () => {
      if (removeAppListener) removeAppListener();
    };
  }, []);

  // 2. Auto-join pipeline: whenever user is authenticated and there is a pending invite code
  useEffect(() => {
    if (!user || !activeInviteCode) return;

    let isMounted = true;
    async function performAutoJoin() {
      const targetCode = activeInviteCode;
      try {
        const res = await autoJoinLeagueWithCode(user, targetCode);
        if (!isMounted) return;

        if (res.success && res.league) {
          setSelectedLeagueId(res.league.id);
          setShowLoginScreen(false);
          setShowInviteModal(false);
          setActiveTab('calendar');
          setNotification({
            title: '🎉 Welcome to ' + res.league.name + '!',
            message: res.alreadyMember 
              ? "Switched to your league." 
              : "You've successfully joined with 1-tap!"
          });
          setTimeout(() => setNotification(null), 6000);
        }
      } catch (err) {
        console.error("Auto-join failed:", err);
      } finally {
        if (isMounted) {
          clearPendingInviteCode();
          setActiveInviteCode(null);
        }
      }
    }

    performAutoJoin();
    return () => {
      isMounted = false;
    };
  }, [user, activeInviteCode]);

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
        setShowLoginScreen(false);
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
        setShowLoginScreen(true);
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

    let latestLeagues: League[] = [];
    let latestMembers: Member[] = [];

    const triggerRosterSync = () => {
      if (latestLeagues.length > 0 && latestMembers.length > 0) {
        syncLeaguesAndRosters(latestLeagues, latestMembers, user);
      }
    };

    // Fetch all leagues
    const qAll = collection(db, 'leagues');
    const unsubscribeAll = onSnapshot(qAll, (snap) => {
      const allLeagues = snap.docs.map(d => ({ id: d.id, ...d.data() } as League));
      latestLeagues = allLeagues;

      // Desired display order: Detroit Dads, Baseball Crew, Architex, others
      const orderPriority = (name: string) => {
        const n = (name || '').toLowerCase();
        if (n.includes('detroit')) return 1;
        if (n.includes('baseball')) return 2;
        if (n.includes('architex')) return 3;
        return 4;
      };

      const sorted = [...allLeagues].sort((a, b) => orderPriority(a.name) - orderPriority(b.name));
      setLeagues(sorted);

      // Auto-select:
      setSelectedLeagueId(prevSelected => {
        const current = sorted.find(l => l.id === prevSelected);
        if (current) {
          return prevSelected;
        }
        const detroit = sorted.find(l => l.name.toLowerCase().includes('detroit'));
        if (detroit) {
          return detroit.id;
        }
        if (sorted.length > 0) {
          return sorted[0].id;
        }
        return null;
      });

      triggerRosterSync();
    }, (err) => console.warn("Leagues collection query notice:", err));

    // Fetch all members to support roster syncing
    const unsubscribeMembers = onSnapshot(collection(db, 'members'), (snap) => {
      latestMembers = snap.docs.map(d => ({ ...d.data() } as Member));
      triggerRosterSync();
    }, (err) => console.warn("Members collection query notice:", err));

    return () => {
      unsubscribeAll();
      unsubscribeMembers();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !selectedLeagueId) return;

    // Fetch sessions, including legacy/fallback sessions so no meetups disappear
    const unsubscribeS = onSnapshot(collection(db, 'sessions'), (snap) => {
      const allSessions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));
      const matched = allSessions.filter(s => s.leagueId === selectedLeagueId || !s.leagueId || s.leagueId === 'default-league');
      const list = matched.length > 0 ? matched : allSessions;
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setSessions(list);
    }, (err) => console.warn("Sessions query warning:", err));

    // 1. Listener for NEW sessions (Scheduled Events)
    const qNewSessions = query(
      collection(db, 'sessions'), 
      where('leagueId', '==', selectedLeagueId),
      limit(10)
    );
    let initialSessionsLoad = true;
    const unsubscribeSessions = onSnapshot(qNewSessions, (snap) => {
      if (initialSessionsLoad) {
        initialSessionsLoad = false;
        return;
      }
      
      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          if (data.hostId && data.hostId === user.uid) return;

          const title = `📅 New Event: ${data.activityName}`;
          const message = `Hosted by ${data.hostName || 'a dad'} on ${data.date ? new Date(data.date).toLocaleDateString() : 'an upcoming date'}. RSVP now!`;
          
          sendDeviceNotification(title, {
            body: message,
            category: 'events',
            userPrefs: member?.notificationPreferences,
            playSound: true
          });

          setNotification({ 
            title, 
            message,
            targetTab: 'calendar',
            actionLabel: 'View & RSVP'
          });
          setTimeout(() => setNotification(null), 8000);
        }
      });
    }, (err) => console.warn("New events listener warning:", err));

    // 2. Listener for NEW chat messages
    const qNewMessages = query(
      collection(db, 'messages'),
      where('leagueId', '==', selectedLeagueId),
      limit(10)
    );
    let initialMessagesLoad = true;
    const unsubscribeMessages = onSnapshot(qNewMessages, (snap) => {
      if (initialMessagesLoad) {
        initialMessagesLoad = false;
        return;
      }

      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          if (data.senderId === user.uid) return;

          const sender = data.senderName || 'A Dad';
          const title = `💬 ${sender} in Chat`;
          const rawText = data.text || '';
          const message = rawText.length > 80 ? rawText.slice(0, 80) + '...' : rawText;

          sendDeviceNotification(title, {
            body: message,
            category: 'messages',
            userPrefs: member?.notificationPreferences,
            playSound: true
          });

          setNotification({
            title,
            message,
            targetTab: 'chat',
            actionLabel: 'Open Chat'
          });
          setTimeout(() => setNotification(null), 7000);
        }
      });
    }, (err) => console.warn("New messages listener warning:", err));

    // 3. Listener for NEW board posts
    const qNewPosts = query(
      collection(db, 'posts'),
      where('leagueId', '==', selectedLeagueId),
      limit(10)
    );
    let initialPostsLoad = true;
    const unsubscribePosts = onSnapshot(qNewPosts, (snap) => {
      if (initialPostsLoad) {
        initialPostsLoad = false;
        return;
      }

      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          if (data.authorId === user.uid) return;

          const title = `📋 New Board Post: ${data.title || 'Discussion'}`;
          const rawContent = data.content || '';
          const message = `Posted by ${data.authorName || 'a member'}: ${rawContent.slice(0, 80)}...`;

          sendDeviceNotification(title, {
            body: message,
            category: 'boardPosts',
            userPrefs: member?.notificationPreferences,
            playSound: true
          });

          setNotification({
            title,
            message,
            targetTab: 'board',
            actionLabel: 'Read Post'
          });
          setTimeout(() => setNotification(null), 8000);
        }
      });
    }, (err) => console.warn("New posts listener warning:", err));

    // 4. Listener for NEW backlog ideas
    const qNewIdeas = query(
      collection(db, 'activities'),
      where('leagueId', '==', selectedLeagueId),
      limit(10)
    );
    let initialIdeasLoad = true;
    const unsubscribeIdeas = onSnapshot(qNewIdeas, (snap) => {
      if (initialIdeasLoad) {
        initialIdeasLoad = false;
        return;
      }

      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          if (data.suggestedBy === user.uid) return;

          const title = `💡 New Idea: ${data.title}`;
          const message = `Suggested by ${data.suggestedByName || 'a dad'}. Upvote it in the backlog!`;

          sendDeviceNotification(title, {
            body: message,
            category: 'ideas',
            userPrefs: member?.notificationPreferences,
            playSound: true
          });

          setNotification({
            title,
            message,
            targetTab: 'backlog',
            actionLabel: 'View Idea'
          });
          setTimeout(() => setNotification(null), 8000);
        }
      });
    }, (err) => console.warn("New ideas listener warning:", err));

    return () => {
      unsubscribeS();
      unsubscribeSessions();
      unsubscribeMessages();
      unsubscribePosts();
      unsubscribeIdeas();
    };
  }, [user, selectedLeagueId, member?.notificationPreferences]);

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
        {showInviteModal && activeInviteCode && (
          <InviteLandingCard
            inviteCode={activeInviteCode}
            currentUser={user}
            onJoinSuccess={(joinedLeague) => {
              setSelectedLeagueId(joinedLeague.id);
              setShowLoginScreen(false);
              setShowInviteModal(false);
              setActiveTab('calendar');
              clearPendingInviteCode();
              setActiveInviteCode(null);
              setNotification({
                title: `🎉 Welcome to ${joinedLeague.name}!`,
                message: "You've successfully joined the league!"
              });
              setTimeout(() => setNotification(null), 6000);
            }}
            onSignInRequired={handleLogin}
            onDismiss={() => {
              setShowInviteModal(false);
              clearPendingInviteCode();
              setActiveInviteCode(null);
            }}
          />
        )}
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
    <div className={`min-h-screen bg-slate-100 text-slate-900 font-sans w-full max-w-full overflow-x-hidden ${activeTab === 'chat' ? 'h-screen flex flex-col overflow-hidden' : 'pb-24'}`}>
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -100, x: '-50%' }}
            animate={{ opacity: 1, y: 16, x: '-50%' }}
            exit={{ opacity: 0, y: -100, x: '-50%' }}
            className="fixed top-0 left-1/2 z-[100] w-full max-w-sm px-4"
          >
            <div className="bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-3xl shadow-2xl border border-slate-700/80 flex flex-col gap-1 items-center text-center relative">
              <button 
                onClick={() => setNotification(null)}
                className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X size={14} />
              </button>
              <div className="w-9 h-9 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center mb-1 border border-indigo-500/30">
                <Bell size={18} />
              </div>
              <h4 className="font-black uppercase tracking-tight text-sm text-white">{notification.title}</h4>
              <p className="text-slate-300 text-xs font-medium leading-relaxed max-w-xs">{notification.message}</p>
              <button 
                onClick={() => {
                  if (notification.targetTab) {
                    setActiveTab(notification.targetTab);
                  }
                  setNotification(null);
                }}
                className="mt-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
              >
                {notification.actionLabel || 'View Now'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className={`sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 transition-all duration-300 ${isScrolled ? 'py-2 px-3 sm:px-4 shadow-md' : 'py-3 sm:py-4 px-3 sm:px-6 shadow-sm'}`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 group px-1">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-lg -rotate-3 transition-transform group-hover:rotate-0 duration-300">
                <Trophy size={18} className="text-white rotate-3 group-hover:rotate-0 transition-transform sm:w-5 sm:h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg sm:text-xl font-black uppercase tracking-tighter leading-none">
                  Dad<span className="text-indigo-600">League</span>
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1 h-1 bg-indigo-400 rounded-full"></div>
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Your Crew</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 relative">
            <button 
              onClick={() => setShowLoginScreen(true)} 
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all cursor-pointer shadow-xs"
              title="View Login Screen"
            >
              <LogIn size={14} /> Login Screen
            </button>

            <button 
              onClick={() => setShowLeagueSwitcher(true)}
              className="flex items-center gap-1.5 sm:gap-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl px-2.5 sm:px-3 py-1.5 transition-all cursor-pointer shadow-xs group"
              title="Click to switch or manage leagues"
            >
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-black uppercase tracking-tight text-indigo-900 group-hover:text-indigo-700 max-w-[110px] sm:max-w-[200px] truncate">
                {activeLeague?.name || 'Select League'}
              </span>
              <ChevronDown size={14} className="text-indigo-500 transition-transform group-hover:translate-y-0.5 shrink-0" />
            </button>
            
            <button 
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={`transition-all rounded-full p-0.5 border-2 relative ${showUserMenu ? 'border-indigo-600 scale-105 shadow-sm' : 'border-slate-200 hover:border-indigo-400'}`}
            >
              <img 
                src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                className={`${isScrolled ? 'w-8 h-8' : 'w-9 h-9 sm:w-10 sm:h-10'} rounded-full shadow-md object-cover`} 
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
      <main className={`w-full max-w-4xl mx-auto px-2 sm:px-4 lg:px-8 py-2.5 sm:py-6 transition-all ${activeTab === 'chat' ? 'flex-1 overflow-hidden flex flex-col w-full' : ''}`}>
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

      {showInviteModal && activeInviteCode && (
        <InviteLandingCard
          inviteCode={activeInviteCode}
          currentUser={user}
          onJoinSuccess={(joinedLeague) => {
            setSelectedLeagueId(joinedLeague.id);
            setShowLoginScreen(false);
            setShowInviteModal(false);
            setActiveTab('calendar');
            clearPendingInviteCode();
            setActiveInviteCode(null);
            setNotification({
              title: `🎉 Welcome to ${joinedLeague.name}!`,
              message: "You've successfully joined the league!"
            });
            setTimeout(() => setNotification(null), 6000);
          }}
          onSignInRequired={handleLogin}
          onDismiss={() => {
            setShowInviteModal(false);
            clearPendingInviteCode();
            setActiveInviteCode(null);
          }}
        />
      )}

      <LegalModal
        isOpen={legalModalTab !== null}
        initialTab={legalModalTab || 'privacy'}
        onClose={() => setLegalModalTab(null)}
      />
    </div>
  );
}

