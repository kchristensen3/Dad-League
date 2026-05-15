import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, where, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Member, League } from '../types';
import { Mail, MapPin, Hash, User as UserIcon, Copy, Share2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function Members({ user, leagueId }: { user: User, leagueId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [league, setLeague] = useState<League | null>(null);

  useEffect(() => {
    if (!user || !leagueId) return;

    const q = query(
      collection(db, 'members'), 
      where('leagueIds', 'array-contains', leagueId),
      orderBy('displayName', 'asc')
    );
    const unsubscribeM = onSnapshot(q, (snap) => {
      setMembers(snap.docs.map(d => ({ ...d.data() } as Member)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'members'));

    const unsubscribeL = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      if (snap.exists()) {
        setLeague({ id: snap.id, ...snap.data() } as League);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `leagues/${leagueId}`));

    return () => {
      unsubscribeM();
      unsubscribeL();
    };
  }, [user, leagueId]);

  const copyInviteCode = () => {
    if (league?.inviteCode) {
      navigator.clipboard.writeText(league.inviteCode);
      alert("Invite code copied!");
    }
  };

  return (
    <div className="space-y-8">
      {league && (
        <div className="p-8 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
          <div className="relative z-10 space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-500 text-[10px] font-black uppercase rounded tracking-widest">League Admin</span>
            </div>
            <h2 className="text-3xl font-black">{league.name}</h2>
            <p className="text-indigo-100 font-medium text-sm max-w-md">{league.description || 'A elite gathering of dads.'}</p>
          </div>
          
          <div className="relative z-10 bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 flex flex-col items-center gap-2 min-w-[200px]">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Invite Code</p>
            <div className="text-3xl font-black tracking-[0.2em]">{league.inviteCode}</div>
            <button 
              onClick={copyInviteCode}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-600 rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-50 transition-all active:scale-95"
            >
              <Copy size={12} /> Copy Code
            </button>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {members.map((member, idx) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            key={member.userId}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 hover:border-indigo-300 transition-all group"
          >
            <div className="flex items-center gap-4">
              <img 
                src={member.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.userId}`} 
                className="w-16 h-16 rounded-xl border-4 border-slate-50 object-cover shadow-sm group-hover:scale-105 transition-transform" 
                alt={member.displayName}
                referrerPolicy="no-referrer"
              />
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-800">{member.displayName}</h3>
                <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">
                  <Mail size={10} /> {member.email}
                </div>
              </div>
            </div>

            <div className="grid gap-3 pt-4 border-t border-slate-50">
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-indigo-500 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-600 font-medium">
                  {member.location || 'Location not set'}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Hash size={14} className="text-indigo-500 mt-0.5 shrink-0" />
                <div className="flex flex-wrap gap-1.5">
                  {(member.interests && member.interests.length > 0) ? member.interests.map(i => (
                    <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-bold border border-indigo-100">
                      {i}
                    </span>
                  )) : (
                    <span className="text-sm text-slate-400 font-medium italic">No interests listed</span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Availability</p>
              <p className="text-xs text-slate-500 leading-relaxed italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                "{member.availability || 'Still figuring out the schedule...'}"
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
