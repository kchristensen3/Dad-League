import { useState, useEffect, FormEvent } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { League } from '../types';
import { autoJoinLeagueWithCode, getStoredInviteCode, getInviteCodeFromUrl, clearPendingInviteCode } from '../lib/inviteUtils';
import { Plus, Users, ArrowRight, Shield, LayoutGrid, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LEAGUE_ROSTER_DEFS } from '../lib/rosterSync';

interface LeagueManagerProps {
  user: User;
  onLeagueSelected: (leagueId: string) => void;
  leagues: League[];
}

export default function LeagueManager({ user, onLeagueSelected, leagues }: LeagueManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [leagueDesc, setLeagueDesc] = useState('');
  const [inviteCode, setInviteCode] = useState(() => getStoredInviteCode() || getInviteCodeFromUrl() || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const pending = getStoredInviteCode() || getInviteCodeFromUrl();
    if (pending) {
      setInviteCode(pending);
      setIsJoining(true);
    }
  }, []);

  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateLeague = async (e: FormEvent) => {
    e.preventDefault();
    if (!leagueName.trim() || loading) return;

    setLoading(true);
    try {
      const newCode = generateInviteCode();
      const leagueData = {
        name: leagueName,
        description: leagueDesc,
        ownerId: user.uid,
        memberIds: [user.uid],
        inviteCode: newCode,
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'leagues'), leagueData);
      
      // Update user's member doc
      try {
        await updateDoc(doc(db, 'members', user.uid), {
          leagueIds: arrayUnion(docRef.id)
        });
      } catch (memErr) {
        handleFirestoreError(memErr, OperationType.UPDATE, `members/${user.uid}`);
      }

      onLeagueSelected(docRef.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'leagues');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLeague = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || loading) return;

    setLoading(true);
    try {
      const res = await autoJoinLeagueWithCode(user, inviteCode.trim());
      if (res.success && res.league) {
        clearPendingInviteCode();
        onLeagueSelected(res.league.id);
      } else {
        alert(res.error || "League not found with that code.");
      }
    } catch (err) {
      console.error("Error joining league:", err);
      alert("Error joining league. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreStarterLeagues = async () => {
    setLoading(true);
    try {
      const createdIds: string[] = [];
      for (const def of LEAGUE_ROSTER_DEFS) {
        const leagueData = {
          name: def.defaultName,
          description: def.defaultDesc,
          ownerId: user.uid,
          memberIds: [user.uid],
          inviteCode: def.inviteCode,
          createdAt: new Date().toISOString(),
          inviteTaps: 0,
          inviteJoins: 1
        };
        const docRef = await addDoc(collection(db, 'leagues'), leagueData);
        createdIds.push(docRef.id);
      }

      await updateDoc(doc(db, 'members', user.uid), {
        leagueIds: arrayUnion(...createdIds)
      });

      if (createdIds.length > 0) {
        onLeagueSelected(createdIds[0]);
      }
    } catch (e) {
      console.error("Error restoring starter leagues:", e);
      alert("Could not restore starter leagues. Please try creating one.");
    } finally {
      setLoading(false);
    }
  };

  if (leagues.length === 0 && !isCreating && !isJoining) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md space-y-8"
        >
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-6">
            <Users size={32} />
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-slate-800 uppercase">No Leagues Found</h2>
            <p className="text-slate-500 font-medium leading-relaxed">
              If your leagues were previously set up or you're starting fresh, click below to restore your circles or create a new league.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 pt-4">
            <button 
              onClick={handleRestoreStarterLeagues}
              disabled={loading}
              className="py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm uppercase tracking-wider shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
            >
              <Sparkles size={18} /> Restore Circles (Detroit Dads, Baseball Crew, Architex)
            </button>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsCreating(true)}
                className="flex-1 py-3.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-800 transition-all"
              >
                <Plus size={16} className="inline mr-1" /> Create League
              </button>
              <button 
                onClick={() => setIsJoining(true)}
                className="flex-1 py-3.5 bg-white text-slate-700 border-2 border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
              >
                <ArrowRight size={16} className="inline mr-1" /> Enter Code
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12 px-6">
      <AnimatePresence mode="wait">
        {isCreating ? (
          <motion.div 
            key="create"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xl space-y-6"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-800 uppercase">New League</h2>
              <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20}/></button>
            </div>
            <form onSubmit={handleCreateLeague} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">League Name</label>
                <input 
                  value={leagueName}
                  onChange={e => setLeagueName(e.target.value)}
                  placeholder="e.g. The Golf Guys"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Description (Optional)</label>
                <textarea 
                  value={leagueDesc}
                  onChange={e => setLeagueDesc(e.target.value)}
                  placeholder="What's the vibe?"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] shadow-inner"
                />
              </div>
              <button 
                disabled={loading}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2 uppercase tracking-tight"
              >
                {loading ? "Establishing League..." : "Create League"}
              </button>
            </form>
          </motion.div>
        ) : isJoining ? (
          <motion.div 
            key="join"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xl space-y-6"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-800 uppercase">Join League</h2>
              <button onClick={() => setIsJoining(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20}/></button>
            </div>
            <form onSubmit={handleJoinLeague} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 font-mono">Invite Code</label>
                <input 
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  placeholder="CODE123"
                  className="w-full p-5 bg-slate-50 border border-slate-200 rounded-xl font-black text-3xl text-center uppercase tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                />
              </div>
              <button 
                disabled={loading}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-100 disabled:opacity-50 transition-all uppercase tracking-tight"
              >
                {loading ? "Connecting..." : "Join the Crew"}
              </button>
            </form>
          </motion.div>
        ) : (
          <div className="space-y-8">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Your Leagues</h1>
              <p className="text-slate-400 font-medium text-sm">Select a league to dive in</p>
            </div>
            
            <div className="grid gap-4">
              {leagues.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onLeagueSelected(l.id)}
                  className="w-full p-6 bg-white border border-slate-200 rounded-xl text-left hover:border-indigo-400 hover:shadow-xl transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -mr-12 -mt-12 group-hover:bg-indigo-100 transition-colors"></div>
                  <div className="relative">
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                      {l.name}
                      {l.ownerId === user.uid && <Shield size={14} className="text-indigo-500" />}
                    </h3>
                    <p className="text-slate-500 text-xs font-medium mt-1 mb-4 leading-relaxed">{l.description || 'A gathering of legends.'}</p>
                    <div className="flex items-center gap-4">
                       <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                        <Users size={12} className="text-indigo-400" /> {l.memberIds.length} Members
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                        <LayoutGrid size={12} className="text-indigo-400" /> Active Board
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-6">
              <button 
                onClick={() => setIsCreating(true)}
                className="py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all"
              >
                New League
              </button>
              <button 
                onClick={() => setIsJoining(true)}
                className="py-3 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-widest hover:border-slate-400 transition-all"
              >
                Join with Code
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
