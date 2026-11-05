import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { League } from '../types';
import { 
  fetchLeagueByInviteCode, 
  trackInviteTap, 
  autoJoinLeagueWithCode 
} from '../lib/inviteUtils';
import { 
  Trophy, 
  Users, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  X,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';

interface InviteLandingCardProps {
  inviteCode: string;
  currentUser: User | null;
  onJoinSuccess: (league: League) => void;
  onSignInRequired: () => void;
  onDismiss?: () => void;
}

export default function InviteLandingCard({
  inviteCode,
  currentUser,
  onJoinSuccess,
  onSignInRequired,
  onDismiss
}: InviteLandingCardProps) {
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadLeague() {
      setLoading(true);
      setError(null);
      const found = await fetchLeagueByInviteCode(inviteCode);
      if (!isMounted) return;

      if (found) {
        setLeague(found);
        trackInviteTap(found.id);
      } else {
        setError(`We couldn't find an active league with code "${inviteCode}". It may have expired or been updated.`);
      }
      setLoading(false);
    }

    loadLeague();
    return () => {
      isMounted = false;
    };
  }, [inviteCode]);

  const handleJoinClick = async () => {
    if (!currentUser) {
      onSignInRequired();
      return;
    }

    setIsJoining(true);
    setError(null);
    const result = await autoJoinLeagueWithCode(currentUser, inviteCode);
    setIsJoining(false);

    if (result.success && result.league) {
      onJoinSuccess(result.league);
    } else {
      setError(result.error || "Failed to join league. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden my-8"
      >
        {/* Top Header Glow */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 p-8 text-white relative overflow-hidden text-center">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl -mr-20 -mt-20"></div>

          {onDismiss && (
            <button 
              onClick={onDismiss}
              className="absolute top-4 right-4 p-2 text-white/60 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              title="Close"
            >
              <X size={20} />
            </button>
          )}

          <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 mx-auto flex items-center justify-center text-indigo-300 mb-4 shadow-inner">
            <Trophy size={32} className="text-amber-400 drop-shadow-md" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest border border-indigo-500/30 mb-2">
            <Sparkles size={12} /> Official Invitation
          </div>

          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white leading-tight">
            {loading ? "Checking Invite Link..." : league ? league.name : "Dad League Invitation"}
          </h2>

          {league && (
            <p className="text-indigo-200 text-xs md:text-sm mt-2 max-w-md mx-auto line-clamp-2">
              {league.description || "You've been invited to join this private crew of dads for weekly meetups and zero-hassle planning."}
            </p>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-6">
          {loading && (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Verifying invite code {inviteCode}...</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <span className="font-bold block">Invite Link Notice</span>
                {error}
              </div>
            </div>
          )}

          {league && !loading && (
            <>
              {/* League Highlights */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
                    <Users size={20} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Crew Size</span>
                    <span className="text-sm font-black text-slate-900">{league.memberIds?.length || 0} Dads</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/80">
                  <CheckCircle2 size={16} />
                  <span className="text-xs font-black uppercase tracking-wider">Valid Invite</span>
                </div>
              </div>

              {/* Single Primary Join Button */}
              <div className="space-y-3 pt-2">
                <button
                  onClick={handleJoinClick}
                  disabled={isJoining}
                  className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-wider text-xs md:text-sm shadow-xl shadow-indigo-200 flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  {isJoining ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{currentUser ? `Join ${league.name} Now` : `Sign In & Join ${league.name}`}</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

                <p className="text-center text-[10px] font-bold text-slate-400">
                  {currentUser ? "No typing required · 1-tap instant membership" : "Google or Email sign-in automatically enters you into the league"}
                </p>
              </div>
            </>
          )}

          {error && !loading && (
            <div className="pt-2">
              <button
                onClick={onDismiss || (() => window.location.href = '/')}
                className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black uppercase tracking-wider text-xs transition-colors cursor-pointer"
              >
                Go to Dad League Home
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
