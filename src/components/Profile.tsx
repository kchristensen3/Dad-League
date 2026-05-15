import { useState, KeyboardEvent, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Member } from '../types';
import { LogOut, MapPin, Clock, Save, Hash, X } from 'lucide-react';
import { motion } from 'motion/react';

export default function Profile({ user, member, onLogout }: { user: User, member: Member | null, onLogout: () => void }) {
  const [location, setLocation] = useState(member?.location || '');
  const [availability, setAvailability] = useState(member?.availability || '');
  const [interests, setInterests] = useState<string[]>(member?.interests || []);
  const [newInterest, setNewInterest] = useState('');
  const [saving, setSaving] = useState(false);
  const [attendedCount, setAttendedCount] = useState(0);
  const [proposedCount, setProposedCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Fetch meetings attended (global across leagues)
    const sessionsQuery = query(
      collection(db, 'sessions'),
      where('attendees', 'array-contains', user.uid)
    );
    const unsubscribeSessions = onSnapshot(sessionsQuery, (snap) => {
      setAttendedCount(snap.size);
    });

    // Fetch ideas proposed (global across leagues)
    const activitiesQuery = query(
      collection(db, 'activities'),
      where('suggestedBy', '==', user.uid)
    );
    const unsubscribeActivities = onSnapshot(activitiesQuery, (snap) => {
      setProposedCount(snap.size);
    });

    return () => {
      unsubscribeSessions();
      unsubscribeActivities();
    };
  }, [user]);

  const handleUpdate = async () => {
    setSaving(true);
    const memberRef = doc(db, 'members', user.uid);
    try {
      await updateDoc(memberRef, { 
        location, 
        availability, 
        interests 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `members/${user.uid}`);
    }
    setSaving(false);
  };

  const addInterest = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && newInterest.trim()) {
      if (!interests.includes(newInterest.trim())) {
        setInterests([...interests, newInterest.trim()]);
      }
      setNewInterest('');
      e.preventDefault();
    }
  };

  const removeInterest = (tag: string) => {
    setInterests(interests.filter(i => i !== tag));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button 
          onClick={onLogout}
          className="p-3 text-red-600 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2 font-black uppercase text-[10px] tracking-widest border border-transparent hover:border-red-100"
        >
          <LogOut size={16} /> Exit League
        </button>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm space-y-8">
        <div className="flex items-center gap-8">
          <div className="relative">
            <img 
              src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
              className="w-24 h-24 rounded-xl border-4 border-slate-50 object-cover shadow-md" 
              alt="Profile" 
              referrerPolicy="no-referrer"
            />
            <div className="absolute -bottom-2 -right-2 w-7 h-7 bg-emerald-500 rounded-lg border-4 border-white shadow-sm"></div>
          </div>
          <div>
            <h3 className="text-2xl font-black tracking-tight text-slate-800">{user.displayName}</h3>
            <p className="text-slate-400 font-bold uppercase text-[9px] tracking-widest mt-1">{user.email}</p>
          </div>
        </div>

        <div className="grid gap-6 pt-8 border-t border-slate-100">
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2 tracking-widest">
              <MapPin size={14} className="text-indigo-500" /> Huddle Location
            </label>
            <input 
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Salt Lake City, UT"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2 tracking-widest">
              <Clock size={14} className="text-indigo-500" /> Availability (Weekly)
            </label>
            <textarea 
              value={availability}
              onChange={e => setAvailability(e.target.value)}
              placeholder="e.g. Evenings are usually free, weekends are best"
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] shadow-inner"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2 tracking-widest">
              <Hash size={14} className="text-indigo-500" /> Interests
            </label>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {interests.map(interest => (
                  <span key={interest} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold flex items-center gap-2 border border-indigo-100 shadow-sm">
                    {interest}
                    <button onClick={() => removeInterest(interest)} className="hover:text-red-500"><X size={12}/></button>
                  </span>
                ))}
                {interests.length === 0 && <span className="text-sm text-slate-400">Add some interests below...</span>}
              </div>
              <input 
                value={newInterest}
                onChange={e => setNewInterest(e.target.value)}
                onKeyDown={addInterest}
                placeholder="Press Enter to add (e.g. Golf, Trivia, BBQ)"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
              />
            </div>
          </div>

          <button 
            onClick={handleUpdate}
            disabled={saving}
            className="w-full py-5 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 disabled:opacity-50 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]"
          >
            {saving ? 'Saving...' : <><Save size={18} /> Update Settings</>}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <h4 className="text-lg font-black uppercase tracking-tight text-white mb-6 relative z-10">Dad Stats</h4>
        <div className="grid grid-cols-2 gap-4 relative z-10">
          <div className="p-6 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-2">Meetings Attended</p>
            <p className="text-3xl font-black text-indigo-400 italic">{attendedCount}</p>
          </div>
          <div className="p-6 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
            <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-2">Ideas Proposed</p>
            <p className="text-3xl font-black text-indigo-400 italic">{proposedCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
