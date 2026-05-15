import { useState, useEffect, FormEvent } from 'react';
import { User } from 'firebase/auth';
import Autocomplete from "react-google-autocomplete";
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove, where, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Activity } from '../types';
import { ThumbsUp, Plus, X, MapPin, Calendar, User as UserIcon, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';

export default function Backlog({ user, leagueId }: { user: User, leagueId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [newCat, setNewCat] = useState('Casual Hangout');
  const [newDate, setNewDate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !leagueId) return;
    const q = query(
      collection(db, 'activities'), 
      where('leagueId', '==', leagueId),
      orderBy('votes', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setActivities(snap.docs.map(d => {
        const data = d.data();
        // Defensive: handle legacy 'votes' as number
        const votes = Array.isArray(data.votes) ? data.votes : [];
        return { 
          id: d.id, 
          ...data,
          votes 
        } as Activity;
      }));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'activities'));
    return () => unsubscribe();
  }, [user, leagueId]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'activities'), {
        leagueId,
        title: newTitle,
        description: newDesc,
        location: newLoc,
        category: newCat,
        suggestedBy: user.uid,
        suggestedByName: user.displayName || 'Anonymous Dad',
        suggestedDate: newDate ? new Date(newDate).toISOString() : null,
        votes: [],
        status: 'active',
        createdAt: new Date().toISOString()
      });

      setNewTitle('');
      setNewDesc('');
      setNewLoc('');
      setNewCat('Casual Hangout');
      setNewDate('');
      setIsAdding(false);
    } catch (err) {
      console.error("Error adding idea:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (activity: Activity) => {
    const ref = doc(db, 'activities', activity.id);
    const votesArray = Array.isArray(activity.votes) ? activity.votes : [];
    const hasVoted = votesArray.includes(user.uid);
    
    try {
      await updateDoc(ref, {
        votes: hasVoted ? arrayRemove(user.uid) : arrayUnion(user.uid)
      });
    } catch (err) {
      console.error("Error toggling vote:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this idea?')) return;
    try {
      await deleteDoc(doc(db, 'activities', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'activities');
    }
  };

  const handleStartEdit = (activity: Activity) => {
    setNewTitle(activity.title);
    setNewDesc(activity.description);
    setNewLoc(activity.location);
    setNewCat(activity.category);
    setNewDate(activity.suggestedDate ? activity.suggestedDate.slice(0, 16) : '');
    setEditingId(activity.id);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setNewTitle('');
    setNewDesc('');
    setNewLoc('');
    setNewCat('Casual Hangout');
    setNewDate('');
    setEditingId(null);
    setIsAdding(false);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !editingId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'activities', editingId), {
        title: newTitle,
        description: newDesc,
        location: newLoc,
        category: newCat,
        suggestedDate: newDate ? new Date(newDate).toISOString() : null,
        updatedAt: new Date().toISOString()
      });

      handleCancel();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'activities');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="fixed bottom-24 right-6 md:right-12 z-40">
        <button 
          onClick={() => {
            handleCancel();
            setIsAdding(true);
          }}
          className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center hover:bg-indigo-700 shadow-2xl active:scale-95 shadow-indigo-200 transition-all border-4 border-white"
        >
          <Plus size={24} />
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-6 bg-white rounded-xl border border-slate-200 shadow-2xl space-y-6"
          >
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="font-bold text-xl tracking-tight text-slate-800 uppercase">{editingId ? 'Edit Idea' : 'New Idea'}</h3>
              <button onClick={handleCancel} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20}/></button>
            </div>
            <form onSubmit={editingId ? handleUpdate : handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Idea/Activity</label>
                  <input 
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="e.g. Backyard BBQ or Basketball"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Activity Type</label>
                  <select 
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                  >
                    <option value="Active Sports & Exercise">Active Sports & Exercise</option>
                    <option value="Games / Hobbies">Games / Hobbies</option>
                    <option value="Event (Game, Concert, etc.)">Event (Game, Concert, etc.)</option>
                    <option value="Casual Hangout">Casual Hangout</option>
                    <option value="Helping Out">Helping Out</option>
                    <option value="Food & Beverage">Food & Beverage</option>
                    <option value="Trip / Travel">Trip / Travel</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Location (Optional)</label>
                  <Autocomplete 
                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                    onPlaceSelected={(place) => {
                      setNewLoc(place.formatted_address || place.name || '');
                    }}
                    defaultValue={newLoc}
                    onChange={(e: any) => setNewLoc(e.target.value)}
                    options={{
                      types: ["geocode", "establishment"],
                    }}
                    placeholder="Where should this happen?"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Suggested Date/Time (Optional)</label>
                  <input 
                    type="datetime-local"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Details/Description</label>
                <textarea 
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Tell us more about the idea..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] shadow-sm transition-all"
                />
              </div>
              <button 
                disabled={isSubmitting}
                className="w-full py-4 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                    />
                    Submitting...
                  </>
                ) : (
                  editingId ? 'Update Idea' : 'Submit Idea to Backlog'
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4">
        {activities.map(activity => (
          <motion.div 
            layout
            key={activity.id}
            className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm flex items-start gap-4 hover:border-indigo-200 transition-all cursor-default"
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase bg-slate-900 text-white px-2 py-0.5 rounded tracking-widest">
                    {activity.category}
                  </span>
                </div>
                {activity.suggestedBy === user.uid && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleStartEdit(activity)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit Idea"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(activity.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete Idea"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <h3 className="text-lg font-bold tracking-tight text-slate-800">{activity.title}</h3>
              
              <div className="flex flex-wrap items-center gap-3 mt-1">
                {activity.suggestedByName && (
                  <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                    <UserIcon size={12} className="text-indigo-400" /> {activity.suggestedByName}
                  </div>
                )}
                {activity.suggestedBy && !activity.suggestedByName && (
                   <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                    <UserIcon size={12} className="text-indigo-400" /> Proposed
                  </div>
                )}
                {activity.location && (
                  <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                    <MapPin size={12} className="text-indigo-400" /> {activity.location}
                  </div>
                )}
                {activity.suggestedDate && (
                  <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                    <Calendar size={12} className="text-indigo-400" /> {format(parseISO(activity.suggestedDate), 'MMM d, h:mm a')}
                  </div>
                )}
              </div>
              
              <p className="text-slate-500 text-sm leading-relaxed mt-2">{activity.description}</p>
            </div>
            <button 
              onClick={() => handleVote(activity)}
              className={`group flex flex-col items-center gap-1 p-2 rounded-lg transition-all border min-w-[60px] active:scale-95 ${
                Array.isArray(activity.votes) && activity.votes.includes(user.uid)
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
              }`}
            >
              <ThumbsUp size={18} className={Array.isArray(activity.votes) && activity.votes.includes(user.uid) ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'} />
              <span className={`text-xs font-black ${Array.isArray(activity.votes) && activity.votes.includes(user.uid) ? 'text-white' : 'text-slate-700 group-hover:text-indigo-700'}`}>
                {Array.isArray(activity.votes) ? activity.votes.length : 0}
              </span>
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
