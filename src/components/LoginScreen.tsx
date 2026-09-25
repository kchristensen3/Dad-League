import { useState } from 'react';
import { User } from 'firebase/auth';
import { 
  Trophy, 
  Calendar, 
  ListTodo, 
  MessageSquare, 
  ShieldCheck, 
  ArrowRight, 
  Users, 
  Sparkles, 
  CheckCircle2, 
  Flame, 
  LogOut,
  ChevronRight,
  Award,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';

interface LoginScreenProps {
  user: User | null;
  onLogin: () => Promise<void>;
  onEnterDashboard?: () => void;
  onLogout?: () => void;
  isLoading?: boolean;
}

export default function LoginScreen({
  user,
  onLogin,
  onEnterDashboard,
  onLogout,
  isLoading = false
}: LoginScreenProps) {
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignInClick = async () => {
    setLoginError(null);
    setIsSigningIn(true);
    try {
      await onLogin();
      if (onEnterDashboard) {
        onEnterDashboard();
      }
    } catch (err: any) {
      console.error("Sign-in error:", err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setLoginError("Sign-in window was closed. Click again when ready.");
      } else if (err?.code === 'auth/popup-blocked') {
        setLoginError("Sign-in popup was blocked by your browser. Please allow popups for this page.");
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setLoginError("Only one popup request allowed at a time. Please try again.");
      } else {
        setLoginError(err?.message || "Failed to sign in. Please try again.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const features = [
    {
      icon: Calendar,
      title: "Weekly Hangout Calendar",
      desc: "Lock in dates, venue locations, and time slots. Real-time RSVP tracking so you know who's in.",
      badge: "No More Group-Text Chaos"
    },
    {
      icon: ListTodo,
      title: "Shared Activity Backlog",
      desc: "Vote on what to do next: Topgolf, brisket smoke-offs, poker tournaments, go-karting, or board games.",
      badge: "Upvote Your Favorites"
    },
    {
      icon: MessageSquare,
      title: "Locker Room & Chat",
      desc: "Event-specific coordination threads and a community message board for links, advice, and banter.",
      badge: "Live Real-Time"
    },
    {
      icon: Award,
      title: "Dad Stats & Leaderboard",
      desc: "Track meetings attended, hangouts hosted, and activity ideas proposed. Bragging rights included.",
      badge: "Zero Flake Policy"
    }
  ];

  const testimonials = [
    {
      quote: "Before Dad League, we'd spend 3 weeks in a 14-person iMessage thread trying to pick a restaurant. Now we vote on ideas and it's booked.",
      author: "Marcus T.",
      role: "Father of 3 · Salt Lake City League"
    },
    {
      quote: "The calendar alone saved our sanity. Everyone's busy, but having a set recurring league night makes sure we actually get together.",
      author: "David K.",
      role: "Father of 2 · Austin Chapter"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white relative overflow-x-hidden">
      {/* Background Gradients & Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px]" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-blue-500/15 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 left-1/4 w-[500px] h-[500px] bg-slate-800/40 rounded-full blur-[160px]" />
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      {/* Top Header */}
      <header className="relative z-20 max-w-6xl mx-auto px-6 py-6 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30 -rotate-3 transition-transform hover:rotate-0">
            <Trophy size={20} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black uppercase tracking-tight text-white leading-none">
              DAD<span className="text-indigo-400">LEAGUE</span>
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mt-0.5">
              The Hangout Platform For Dads
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full pl-2 pr-3 py-1.5 shadow-sm">
              <img 
                src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                alt="" 
                className="w-7 h-7 rounded-full border border-slate-700 object-cover"
                referrerPolicy="no-referrer"
              />
              <span className="text-xs font-bold text-slate-200 hidden sm:inline max-w-[120px] truncate">
                {user.displayName || user.email}
              </span>
              <button
                onClick={onEnterDashboard}
                className="ml-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
              >
                Dashboard <ArrowRight size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignInClick}
              disabled={isSigningIn}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-white/10 active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Signed-in preview banner if active session exists */}
      {user && (
        <div className="relative z-20 bg-indigo-950/80 border-b border-indigo-800/60 px-4 py-2.5 text-center text-xs text-indigo-200 flex flex-wrap items-center justify-center gap-3 backdrop-blur-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Currently viewing Login Screen. You are signed in as <strong>{user.displayName || user.email}</strong>.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onEnterDashboard}
              className="font-bold underline hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              Return to League Dashboard <ChevronRight size={14} />
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="text-slate-400 hover:text-rose-400 ml-2 font-medium flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <LogOut size={12} /> Sign Out
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12 lg:py-20 flex flex-col items-center text-center">
        
        {/* League Pill */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-950/90 border border-indigo-500/30 text-indigo-300 text-xs font-black uppercase tracking-wider mb-8 shadow-inner"
        >
          <Sparkles size={14} className="text-indigo-400" />
          <span>The Official Anti-Flake System for Dads</span>
        </motion.div>

        {/* Main Headline */}
        <motion.h1 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-black uppercase tracking-tight text-white max-w-4xl leading-[1.05]"
        >
          Never Lose Touch With <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-indigo-200">
            The Crew Again.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl font-medium leading-relaxed"
        >
          Dad League gives your squad a recurring calendar, an activity backlog with upvotes, locker room banter, and crystal-clear RSVPs.
        </motion.p>

        {/* Login Action Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-10 w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/50"
        >
          {user ? (
            <div className="space-y-5 text-left">
              <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60">
                <img 
                  src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                  alt="" 
                  className="w-12 h-12 rounded-xl border-2 border-indigo-500 object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase font-black text-indigo-400 tracking-wider">Signed In</p>
                  <p className="text-base font-bold text-white truncate">{user.displayName || 'Dad'}</p>
                  <p className="text-xs text-slate-400 truncate">{user.email}</p>
                </div>
              </div>

              <button
                onClick={onEnterDashboard}
                className="w-full py-4 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white rounded-2xl font-black text-base uppercase tracking-wider transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 active:scale-[0.98] cursor-pointer"
              >
                Go to League Dashboard <ArrowRight size={18} />
              </button>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                <button
                  onClick={handleSignInClick}
                  disabled={isSigningIn}
                  className="text-slate-400 hover:text-indigo-300 font-bold transition-colors cursor-pointer"
                >
                  Switch Google Account
                </button>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="text-rose-400 hover:text-rose-300 font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <LogOut size={12} /> Sign Out
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                  Join or Sign In
                </h3>
                <p className="text-xs text-slate-400">
                  Sign in with Google to enter your league or create a new one.
                </p>
              </div>

              {loginError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-medium text-left flex items-start gap-2">
                  <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Google Sign-In Button */}
              <button
                onClick={handleSignInClick}
                disabled={isSigningIn || isLoading}
                className="w-full py-4 px-6 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 shadow-xl shadow-black/40 active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {isSigningIn ? (
                  <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              {/* Guarantees */}
              <div className="pt-3 flex items-center justify-center gap-4 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <ShieldCheck size={14} className="text-emerald-400" /> Private & Secure
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 size={14} className="text-indigo-400" /> Free to Use
                </span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Feature Grid */}
        <section className="mt-20 w-full text-left">
          <div className="text-center max-w-xl mx-auto mb-12">
            <h2 className="text-xs font-black uppercase tracking-[0.25em] text-indigo-400 mb-2">
              Everything Your Squad Needs
            </h2>
            <p className="text-2xl sm:text-3xl font-black uppercase text-white tracking-tight">
              Built Specifically For Dad Hangs
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {features.map((feat, idx) => (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * idx }}
                className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 hover:border-indigo-500/40 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-950/80 border border-indigo-700/40 flex items-center justify-center text-indigo-400 group-hover:scale-105 group-hover:text-indigo-300 transition-all">
                      <feat.icon size={22} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      {feat.badge}
                    </span>
                  </div>
                  <h3 className="text-lg font-black uppercase text-white tracking-tight mb-2">
                    {feat.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed font-medium">
                    {feat.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Dad League Creed / Rules Box */}
        <section className="mt-16 w-full max-w-3xl bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-slate-800 rounded-3xl p-8 sm:p-10 text-left relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Flame size={18} />
            </div>
            <h3 className="text-lg font-black uppercase tracking-tight text-white">
              The Dad League Creed
            </h3>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 text-sm">
            <div className="space-y-1">
              <span className="text-indigo-400 font-mono font-black text-xs">#01</span>
              <h4 className="font-bold text-white text-sm">Clear RSVPs</h4>
              <p className="text-xs text-slate-400">If you say you're coming, show up. If you can't make it, decline early so bookings stay accurate.</p>
            </div>
            <div className="space-y-1">
              <span className="text-indigo-400 font-mono font-black text-xs">#02</span>
              <h4 className="font-bold text-white text-sm">Zero Work Talk</h4>
              <p className="text-xs text-slate-400">The first 15 minutes are for catching up; after that, career talk is strictly benched.</p>
            </div>
            <div className="space-y-1">
              <span className="text-indigo-400 font-mono font-black text-xs">#03</span>
              <h4 className="font-bold text-white text-sm">Rotate The Host</h4>
              <p className="text-xs text-slate-400">Every dad takes turns proposing an activity and picking the meeting point.</p>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mt-16 w-full max-w-4xl grid sm:grid-cols-2 gap-6 text-left">
          {testimonials.map((t, idx) => (
            <div 
              key={idx}
              className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 flex flex-col justify-between"
            >
              <p className="text-sm text-slate-300 italic leading-relaxed mb-4">
                "{t.quote}"
              </p>
              <div>
                <p className="text-xs font-black text-white uppercase tracking-wider">{t.author}</p>
                <p className="text-[11px] text-indigo-400 font-medium">{t.role}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Bottom CTA */}
        <section className="mt-16 text-center space-y-4">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
            Ready to organize your dad crew?
          </p>
          <button
            onClick={user ? onEnterDashboard : handleSignInClick}
            disabled={isSigningIn}
            className="px-8 py-4 bg-white text-slate-900 rounded-2xl font-black text-base hover:bg-slate-100 transition-all shadow-2xl shadow-indigo-950/60 active:scale-95 inline-flex items-center gap-2 cursor-pointer"
          >
            {user ? "Enter Dad League" : "Sign In with Google"}
            <ArrowRight size={18} />
          </button>
        </section>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 mt-20 py-8 px-6 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-indigo-400" />
            <span className="font-bold text-slate-400">DAD LEAGUE</span>
            <span>— The premier hangout organizer</span>
          </div>
          <p className="text-[11px] text-slate-600">
            Built for dads who need a break. Real friends, real meetups.
          </p>
        </div>
      </footer>
    </div>
  );
}
