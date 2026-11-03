import { useState, useEffect, FormEvent, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Activity } from '../types';
import { 
  ThumbsUp, 
  Plus, 
  X, 
  User as UserIcon, 
  Edit2, 
  Trash2, 
  Lightbulb, 
  Archive, 
  RotateCcw, 
  Search, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  LayoutGrid,
  List as ListIcon,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// 30 days in milliseconds
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function Backlog({ user, leagueId }: { user: User, leagueId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('compact'); // Default to compact on mobile for density
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !leagueId) return;

    const unsubscribe = onSnapshot(collection(db, 'activities'), (snap) => {
      const allActs = snap.docs.map(d => {
        const data = d.data();
        const votes = Array.isArray(data.votes) ? data.votes : [];
        return { 
          id: d.id, 
          ...data,
          votes 
        } as Activity;
      });
      const matched = allActs.filter(a => a.leagueId === leagueId || !a.leagueId || a.leagueId === 'default-league');
      const list = matched.length > 0 ? matched : allActs;
      list.sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
      setActivities(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'activities'));
    return () => unsubscribe();
  }, [user, leagueId]);

  // Helper to determine if an activity is auto-archived (no upvotes in 30 days)
  const isAutoArchived = (activity: Activity): boolean => {
    if (activity.archived === true || activity.status === 'archived') {
      return true;
    }
    // Check most recent vote or creation timestamp
    const refTimestamp = activity.lastUpvotedAt || activity.createdAt;
    if (!refTimestamp) return false;

    const time = new Date(refTimestamp).getTime();
    if (isNaN(time)) return false;

    return (Date.now() - time) > THIRTY_DAYS_MS;
  };

  // Days since last upvote helper
  const getDaysSinceLastActivity = (activity: Activity) => {
    const refTimestamp = activity.lastUpvotedAt || activity.createdAt;
    if (!refTimestamp) return null;
    const time = new Date(refTimestamp).getTime();
    if (isNaN(time)) return null;
    const days = Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  // Partition ideas
  const { activeList, archivedList } = useMemo(() => {
    const active: Activity[] = [];
    const archived: Activity[] = [];

    activities.forEach(act => {
      if (isAutoArchived(act)) {
        archived.push(act);
      } else {
        active.push(act);
      }
    });

    return { activeList: active, archivedList: archived };
  }, [activities]);

  // Filter by search
  const currentList = useMemo(() => {
    const base = tab === 'active' ? activeList : archivedList;
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(a => 
      a.title.toLowerCase().includes(q) || 
      (a.description && a.description.toLowerCase().includes(q)) ||
      (a.suggestedByName && a.suggestedByName.toLowerCase().includes(q))
    );
  }, [tab, activeList, archivedList, searchQuery]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'activities'), {
        leagueId,
        title: newTitle.trim(),
        description: newDesc.trim(),
        category: 'Activity',
        suggestedBy: user.uid,
        suggestedByName: user.displayName || 'Dad',
        votes: [user.uid], // Creator auto-votes
        status: 'active',
        archived: false,
        lastUpvotedAt: now,
        createdAt: now
      });

      setNewTitle('');
      setNewDesc('');
      setIsAdding(false);
      setTab('active');
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
      const updateData: any = {
        votes: hasVoted ? arrayRemove(user.uid) : arrayUnion(user.uid)
      };

      // If user is adding an upvote, update lastUpvotedAt and auto-revive if it was archived
      if (!hasVoted) {
        updateData.lastUpvotedAt = new Date().toISOString();
        updateData.archived = false;
        updateData.status = 'active';
      }

      await updateDoc(ref, updateData);
    } catch (err) {
      console.error("Error toggling vote:", err);
    }
  };

  const handleRevive = async (activity: Activity) => {
    const ref = doc(db, 'activities', activity.id);
    try {
      await updateDoc(ref, {
        archived: false,
        status: 'active',
        lastUpvotedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error reviving idea:", err);
    }
  };

  const handleArchiveManually = async (activity: Activity) => {
    const ref = doc(db, 'activities', activity.id);
    try {
      await updateDoc(ref, {
        archived: true,
        status: 'archived',
        archivedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error archiving idea:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this idea?')) return;
    try {
      await deleteDoc(doc(db, 'activities', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'activities');
    }
  };

  const handleStartEdit = (activity: Activity) => {
    setNewTitle(activity.title);
    setNewDesc(activity.description || '');
    setEditingId(activity.id);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancel = () => {
    setNewTitle('');
    setNewDesc('');
    setEditingId(null);
    setIsAdding(false);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !editingId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'activities', editingId), {
        title: newTitle.trim(),
        description: newDesc.trim(),
        category: 'Activity',
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
    <div className="space-y-3 sm:space-y-5 pb-16">
      {/* Floating Add Idea Button */}
      <div className="fixed bottom-24 right-4 sm:right-8 md:right-12 z-40">
        <button 
          onClick={() => {
            handleCancel();
            setIsAdding(true);
          }}
          className="w-12 h-12 sm:w-14 sm:h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center hover:bg-indigo-700 shadow-xl active:scale-95 shadow-indigo-300 transition-all border-2 sm:border-4 border-white cursor-pointer"
          title="Add New Idea"
        >
          <Plus size={22} />
        </button>
      </div>

      {/* Idea Form Modal / Drawer */}
      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="p-4 sm:p-6 bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xl space-y-4"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Lightbulb size={18} />
                </div>
                <h3 className="font-black text-lg sm:text-xl tracking-tight text-slate-900 uppercase">
                  {editingId ? 'Edit Idea' : 'Add an Idea'}
                </h3>
              </div>
              <button 
                onClick={handleCancel} 
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={editingId ? handleUpdate : handleAdd} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                  Idea / Activity
                </label>
                <input 
                  type="text"
                  autoFocus
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Backyard Smoker BBQ, Topgolf, Morning Coffee & Bagels"
                  className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl font-bold text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white shadow-xs transition-all placeholder:text-slate-400 placeholder:font-normal"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                  Description
                </label>
                <textarea 
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Share a few quick details or what you're thinking..."
                  className="w-full p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl font-medium text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white min-h-[90px] shadow-xs transition-all placeholder:text-slate-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newTitle.trim() || isSubmitting}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-indigo-700 shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingId ? 'Update' : 'Suggest Idea'}</span>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Controls: Segmented Tabs (Active vs Archived) + Density Toggle + Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 sm:p-3 shadow-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Segmented Pill Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setTab('active')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all cursor-pointer ${
                tab === 'active' 
                  ? 'bg-white text-indigo-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Lightbulb size={14} className={tab === 'active' ? 'text-indigo-600' : 'text-slate-400'} />
              <span>Active Ideas</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                tab === 'active' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {activeList.length}
              </span>
            </button>

            <button
              onClick={() => setTab('archived')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all cursor-pointer ${
                tab === 'archived' 
                  ? 'bg-white text-indigo-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Archive size={14} className={tab === 'archived' ? 'text-indigo-600' : 'text-slate-400'} />
              <span>Archived</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                tab === 'archived' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {archivedList.length}
              </span>
            </button>
          </div>

          {/* View Mode (Compact vs Detailed Cards) */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode(viewMode === 'compact' ? 'cards' : 'compact')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              title={viewMode === 'compact' ? 'Switch to detailed card view' : 'Switch to compact row view (less scrolling)'}
            >
              {viewMode === 'compact' ? (
                <>
                  <LayoutGrid size={13} className="text-indigo-600" />
                  <span className="hidden sm:inline">Detailed Cards</span>
                  <span className="sm:hidden">Cards</span>
                </>
              ) : (
                <>
                  <ListIcon size={13} className="text-indigo-600" />
                  <span className="hidden sm:inline">Compact Mode</span>
                  <span className="sm:hidden">Compact</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search Bar + Auto-Archive Subtext */}
        <div className="flex items-center gap-2 pt-1">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={tab === 'active' ? "Filter active ideas..." : "Search archived ideas..."}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium placeholder:text-slate-400"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {tab === 'active' ? (
          <div className="text-[10px] text-slate-400 font-medium flex items-center justify-between px-1">
            <span>⚡ Auto-archives ideas with no upvotes in 30 days</span>
            <span className="hidden sm:inline text-slate-400">Sorted by most votes</span>
          </div>
        ) : (
          <div className="text-[10px] text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-xl p-2 font-medium flex items-center gap-2">
            <Clock size={13} className="shrink-0 text-amber-600" />
            <span>These ideas haven't been upvoted in 30+ days. Upvote or tap "Revive" to bring any idea back!</span>
          </div>
        )}
      </div>

      {/* Ideas Content */}
      <div className={viewMode === 'compact' ? 'space-y-1.5' : 'space-y-3'}>
        {currentList.map(activity => {
          const votesArray = Array.isArray(activity.votes) ? activity.votes : [];
          const hasVoted = votesArray.includes(user.uid);
          const daysAgo = getDaysSinceLastActivity(activity);
          const isStale = isAutoArchived(activity);
          const isExpanded = expandedId === activity.id;

          // Compact Row View (Maximum information density, minimal scrolling!)
          if (viewMode === 'compact') {
            return (
              <motion.div
                layout
                key={activity.id}
                className={`p-2.5 sm:p-3.5 bg-white rounded-2xl border transition-all ${
                  isStale 
                    ? 'border-slate-200 bg-slate-50/60 opacity-80 hover:opacity-100' 
                    : 'border-slate-200 hover:border-indigo-300 shadow-xs'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {/* Upvote Button (Compact) */}
                  <button 
                    onClick={() => handleVote(activity)}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all shrink-0 cursor-pointer active:scale-95 ${
                      hasVoted
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
                    }`}
                    title={hasVoted ? 'Remove upvote' : 'Upvote this idea'}
                  >
                    <ThumbsUp size={13} className={hasVoted ? 'text-white' : 'text-slate-400'} />
                    <span className="text-xs font-black leading-none">{votesArray.length}</span>
                  </button>

                  {/* Title & Meta */}
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-xs sm:text-sm text-slate-900 tracking-tight truncate">
                        {activity.title}
                      </h4>
                      {isStale && (
                        <span className="shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[9px] font-black uppercase tracking-wider">
                          Stale
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                      <span>by {activity.suggestedByName || 'Dad'}</span>
                      {daysAgo !== null && (
                        <span>• {daysAgo === 0 ? 'today' : `${daysAgo}d ago`}</span>
                      )}
                      {activity.description && (
                        <span className="text-indigo-500 font-bold hidden sm:inline">
                          {isExpanded ? 'Hide details' : 'View details'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isStale ? (
                      <button
                        onClick={() => handleRevive(activity)}
                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                        title="Revive back to active list"
                      >
                        <RotateCcw size={11} />
                        <span className="hidden sm:inline">Revive</span>
                      </button>
                    ) : (
                      activity.suggestedBy === user.uid && (
                        <button
                          onClick={() => handleArchiveManually(activity)}
                          className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Archive Idea"
                        >
                          <Archive size={13} />
                        </button>
                      )
                    )}

                    {activity.suggestedBy === user.uid && (
                      <button 
                        onClick={() => handleStartEdit(activity)}
                        className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Edit Idea"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}

                    {activity.description && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Description in Compact Mode */}
                <AnimatePresence>
                  {isExpanded && activity.description && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden pt-2 mt-2 border-t border-slate-100"
                    >
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        {activity.description}
                      </p>
                      {activity.suggestedBy === user.uid && (
                        <div className="flex justify-end pt-2">
                          <button 
                            onClick={() => handleDelete(activity.id)}
                            className="text-[10px] text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          }

          // Detailed Card View
          return (
            <motion.div 
              layout
              key={activity.id}
              className={`p-4 sm:p-5 bg-white rounded-2xl border transition-all ${
                isStale ? 'border-slate-200 bg-slate-50/50 opacity-80 hover:opacity-100' : 'border-slate-200 hover:border-indigo-300 shadow-xs'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm sm:text-base font-black tracking-tight text-slate-900 leading-snug">
                        {activity.title}
                      </h4>
                      {isStale && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[9px] font-black uppercase tracking-wider">
                          Stale (&gt;30d)
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      {isStale ? (
                        <button
                          onClick={() => handleRevive(activity)}
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                          title="Revive back to active list"
                        >
                          <RotateCcw size={12} /> Revive
                        </button>
                      ) : (
                        activity.suggestedBy === user.uid && (
                          <button
                            onClick={() => handleArchiveManually(activity)}
                            className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Archive Idea"
                          >
                            <Archive size={14} />
                          </button>
                        )
                      )}

                      {activity.suggestedBy === user.uid && (
                        <>
                          <button 
                            onClick={() => handleStartEdit(activity)}
                            className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Idea"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => handleDelete(activity.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Idea"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {activity.description && (
                    <p className="text-slate-600 text-xs sm:text-sm leading-relaxed font-medium">
                      {activity.description}
                    </p>
                  )}

                  <div className="pt-1 flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <span className="flex items-center gap-1">
                      <UserIcon size={11} className="text-indigo-400" />
                      <span>{activity.suggestedByName || 'Dad'}</span>
                    </span>
                    {daysAgo !== null && (
                      <span>Last active: {daysAgo === 0 ? 'today' : `${daysAgo}d ago`}</span>
                    )}
                  </div>
                </div>

                {/* Upvote Button */}
                <button 
                  onClick={() => handleVote(activity)}
                  className={`group/vote flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl transition-all border min-w-[54px] active:scale-95 cursor-pointer shrink-0 ${
                    hasVoted
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                      : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
                  }`}
                  title={hasVoted ? 'Remove vote' : 'Vote for this idea'}
                >
                  <ThumbsUp size={16} className={hasVoted ? 'text-white' : 'text-slate-400 group-hover/vote:text-indigo-600 transition-colors'} />
                  <span className={`text-xs font-black ${hasVoted ? 'text-white' : 'text-slate-700 group-hover/vote:text-indigo-700'}`}>
                    {votesArray.length}
                  </span>
                </button>
              </div>
            </motion.div>
          );
        })}

        {currentList.length === 0 && !isAdding && (
          <div className="p-8 sm:p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-2.5">
            {tab === 'active' ? (
              <>
                <Lightbulb size={28} className="mx-auto text-indigo-400" />
                <h4 className="font-black text-slate-700 uppercase tracking-tight text-sm">
                  {searchQuery ? 'No matching active ideas' : 'No active ideas right now'}
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchQuery ? 'Try clearing your search query.' : 'Have an idea for the crew? Suggest it or check the Archived tab for past favorites!'}
                </p>
                <button
                  onClick={() => setIsAdding(true)}
                  className="mt-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  Suggest New Idea
                </button>
              </>
            ) : (
              <>
                <Archive size={28} className="mx-auto text-slate-400" />
                <h4 className="font-black text-slate-700 uppercase tracking-tight text-sm">
                  No archived ideas
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Ideas with no upvotes for over a month are moved here automatically to keep the list clean.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
