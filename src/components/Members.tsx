import { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Member, League, Session, Activity, Message, Post } from '../types';
import { getUniversalInviteUrl } from '../lib/inviteUtils';
import { matchesDadName, LEAGUE_ROSTER_DEFS } from '../lib/rosterSync';
import { 
  Mail, 
  MapPin, 
  Hash, 
  Copy, 
  Share2, 
  Check, 
  Sparkles,
  Users,
  X,
  Trophy,
  Zap,
  MessageCircle,
  Lightbulb,
  Crown,
  Calendar,
  MessageSquare,
  Award,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Members({ user, leagueId }: { user: User, leagueId: string }) {
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [league, setLeague] = useState<League | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // League Data for Stats & Trophies
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  // Roster Management State
  const [isManagingRoster, setIsManagingRoster] = useState(false);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [isSavingRoster, setIsSavingRoster] = useState(false);
  const [rosterStatus, setRosterStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !leagueId) return;

    // 1. Members
    const unsubscribeM = onSnapshot(collection(db, 'members'), (snap) => {
      const list = snap.docs.map(d => ({ ...d.data() } as Member));
      list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      setAllMembers(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'members'));

    // 2. League
    const unsubscribeL = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      if (snap.exists()) {
        const lData = { id: snap.id, ...snap.data() } as League;
        setLeague(lData);
        if (!isManagingRoster) {
          setSelectedUids(lData.memberIds || []);
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `leagues/${leagueId}`));

    // 3. Sessions (Events)
    const qS = query(collection(db, 'sessions'), where('leagueId', '==', leagueId));
    const unsubscribeS = onSnapshot(qS, (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
    }, (err) => console.warn('Could not read sessions for stats:', err));

    // 4. Activities (Ideas)
    const qA = query(collection(db, 'activities'), where('leagueId', '==', leagueId));
    const unsubscribeA = onSnapshot(qA, (snap) => {
      setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() } as Activity)));
    }, (err) => console.warn('Could not read activities for stats:', err));

    // 5. Messages (Chat)
    const qMsg = query(collection(db, 'messages'), where('leagueId', '==', leagueId));
    const unsubscribeMsg = onSnapshot(qMsg, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    }, (err) => console.warn('Could not read messages for stats:', err));

    // 6. Posts (Board topics)
    const qP = query(collection(db, 'posts'), where('leagueId', '==', leagueId));
    const unsubscribeP = onSnapshot(qP, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Post)));
    }, (err) => console.warn('Could not read posts for stats:', err));

    return () => {
      unsubscribeM();
      unsubscribeL();
      unsubscribeS();
      unsubscribeA();
      unsubscribeMsg();
      unsubscribeP();
    };
  }, [user, leagueId, isManagingRoster]);

  // Compute members who strictly belong to this league
  const leagueMembers = allMembers.filter(m => 
    (league?.memberIds && league.memberIds.includes(m.userId)) ||
    (m.leagueIds && m.leagueIds.includes(leagueId))
  );

  const inviteUrl = league?.inviteCode ? getUniversalInviteUrl(league.inviteCode) : '';

  const handleShareLink = async () => {
    if (!league || !inviteUrl) return;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Join ${league.name} on Dad League`,
          text: `You're invited to join ${league.name} on Dad League! Tap to auto-join the crew:`,
          url: inviteUrl
        });
        return;
      } catch (err) {
        // Fallback to clipboard if user dismissed share dialog
      }
    }

    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyCode = () => {
    if (league?.inviteCode) {
      navigator.clipboard.writeText(league.inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  // Toggle user in roster
  const toggleUserInRoster = (uid: string) => {
    setSelectedUids(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  // Apply standard roster preset based on league name
  const handleApplyPreset = () => {
    if (!league) return;
    const lName = league.name.toLowerCase();
    const matchedDef = LEAGUE_ROSTER_DEFS.find(d => lName.includes(d.nameMatch));

    if (!matchedDef) return;

    const presetUids = allMembers
      .filter(m => matchedDef.targetNames.some(targetName => matchesDadName(targetName, m, user)))
      .map(m => m.userId);

    // Always ensure current user is preserved if appropriate
    if (matchedDef.targetNames.includes('me') && !presetUids.includes(user.uid)) {
      presetUids.push(user.uid);
    }

    setSelectedUids(presetUids);
    setRosterStatus(`Applied standard roster for ${matchedDef.defaultName}`);
    setTimeout(() => setRosterStatus(null), 3000);
  };

  // Save updated roster to Firestore
  const handleSaveRoster = async () => {
    if (!leagueId) return;
    setIsSavingRoster(true);
    setRosterStatus(null);

    try {
      // 1. Update league memberIds
      await updateDoc(doc(db, 'leagues', leagueId), {
        memberIds: selectedUids
      });

      // 2. Synchronize member docs
      for (const m of allMembers) {
        const shouldBeInLeague = selectedUids.includes(m.userId);
        const isCurrentlyIn = m.leagueIds && m.leagueIds.includes(leagueId);

        if (shouldBeInLeague && !isCurrentlyIn) {
          try {
            await updateDoc(doc(db, 'members', m.userId), {
              leagueIds: arrayUnion(leagueId)
            });
          } catch (e) {
            console.warn(`Notice syncing leagueId on member ${m.displayName}:`, e);
          }
        } else if (!shouldBeInLeague && isCurrentlyIn) {
          try {
            await updateDoc(doc(db, 'members', m.userId), {
              leagueIds: arrayRemove(leagueId)
            });
          } catch (e) {
            console.warn(`Notice removing leagueId on member ${m.displayName}:`, e);
          }
        }
      }

      setRosterStatus("Roster updated successfully!");
      setTimeout(() => {
        setIsManagingRoster(false);
        setRosterStatus(null);
      }, 1000);
    } catch (err) {
      console.error("Error saving roster:", err);
      setRosterStatus("Could not update roster. Please check permissions.");
    } finally {
      setIsSavingRoster(false);
    }
  };

  // Compute individual stats for each member in this league
  const memberStats = useMemo(() => {
    const stats: Record<string, {
      eventsAttended: number;
      ideasAdded: number;
      eventsHosted: number;
      boardTopics: number;
      chatMessages: number;
      eventsDeclined: number;
    }> = {};

    leagueMembers.forEach(m => {
      stats[m.userId] = {
        eventsAttended: 0,
        ideasAdded: 0,
        eventsHosted: 0,
        boardTopics: 0,
        chatMessages: 0,
        eventsDeclined: 0
      };
    });

    sessions.forEach(s => {
      if (s.status === 'cancelled') return;
      if (s.hostId && stats[s.hostId]) {
        stats[s.hostId].eventsHosted += 1;
      }
      (s.attendees || []).forEach(uid => {
        if (stats[uid]) stats[uid].eventsAttended += 1;
      });
      (s.declined || []).forEach(uid => {
        if (stats[uid]) stats[uid].eventsDeclined += 1;
      });
    });

    activities.forEach(a => {
      if (a.suggestedBy && stats[a.suggestedBy]) {
        stats[a.suggestedBy].ideasAdded += 1;
      }
    });

    messages.forEach(msg => {
      if (msg.senderId && stats[msg.senderId]) {
        stats[msg.senderId].chatMessages += 1;
      }
    });

    posts.forEach(p => {
      if (p.authorId && stats[p.authorId]) {
        stats[p.authorId].boardTopics += 1;
      }
    });

    return stats;
  }, [leagueMembers, sessions, activities, messages, posts]);

  // Compute fun Trophies across league members
  const trophies = useMemo(() => {
    if (leagueMembers.length === 0) return [];

    let topChatter: Member | null = null;
    let maxChat = 0;

    let topAttendee: Member | null = null;
    let maxAttended = 0;

    let topDecliner: Member | null = null;
    let maxDeclined = 0;

    let topIdeator: Member | null = null;
    let maxIdeas = 0;

    let topHost: Member | null = null;
    let maxHosted = 0;

    leagueMembers.forEach(m => {
      const s = memberStats[m.userId] || {
        eventsAttended: 0,
        ideasAdded: 0,
        eventsHosted: 0,
        boardTopics: 0,
        chatMessages: 0,
        eventsDeclined: 0
      };

      if (s.chatMessages > maxChat) {
        maxChat = s.chatMessages;
        topChatter = m;
      }
      if (s.eventsAttended > maxAttended) {
        maxAttended = s.eventsAttended;
        topAttendee = m;
      }
      if (s.eventsDeclined > maxDeclined) {
        maxDeclined = s.eventsDeclined;
        topDecliner = m;
      }
      if (s.ideasAdded > maxIdeas) {
        maxIdeas = s.ideasAdded;
        topIdeator = m;
      }
      if (s.eventsHosted > maxHosted) {
        maxHosted = s.eventsHosted;
        topHost = m;
      }
    });

    const list = [];

    // 1. Gift of Gab (Most chat messages)
    if (topChatter && maxChat > 0) {
      list.push({
        id: 'gift-of-gab',
        title: 'Gift of Gab',
        emoji: '🎙️',
        icon: MessageCircle,
        color: 'from-amber-500/20 to-orange-500/10 text-amber-900 border-amber-200',
        badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
        winner: topChatter,
        stat: `${maxChat} messages sent`,
        description: 'Most active chatter keeping the guys engaged'
      });
    }

    // 2. Ironman (Most events attended)
    if (topAttendee && maxAttended > 0) {
      list.push({
        id: 'ironman',
        title: 'Ironman',
        emoji: '⚡',
        icon: Zap,
        color: 'from-emerald-500/20 to-teal-500/10 text-emerald-900 border-emerald-200',
        badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        winner: topAttendee,
        stat: `${maxAttended} events attended`,
        description: 'Never misses a meetup or outing'
      });
    }

    // 3. The Non-Committal (Most declined / passes)
    if (topDecliner && maxDeclined > 0) {
      list.push({
        id: 'non-committal',
        title: 'The Non-Committal',
        emoji: '🤷‍♂️',
        icon: HelpCircle,
        color: 'from-violet-500/20 to-purple-500/10 text-violet-900 border-violet-200',
        badgeBg: 'bg-violet-100 text-violet-900 border-violet-300',
        winner: topDecliner,
        stat: `${maxDeclined} times passed`,
        description: 'Champion of "let me check with the boss"'
      });
    }

    // 4. Idea Machine (Most backlog ideas suggested)
    if (topIdeator && maxIdeas > 0) {
      list.push({
        id: 'idea-machine',
        title: 'Idea Machine',
        emoji: '💡',
        icon: Lightbulb,
        color: 'from-blue-500/20 to-indigo-500/10 text-blue-900 border-blue-200',
        badgeBg: 'bg-blue-100 text-blue-900 border-blue-300',
        winner: topIdeator,
        stat: `${maxIdeas} ideas contributed`,
        description: 'Always bringing new activities to the table'
      });
    }

    // 5. Head Coach (Most events hosted)
    if (topHost && maxHosted > 0) {
      list.push({
        id: 'head-coach',
        title: 'Head Coach',
        emoji: '👑',
        icon: Crown,
        color: 'from-rose-500/20 to-pink-500/10 text-rose-900 border-rose-200',
        badgeBg: 'bg-rose-100 text-rose-900 border-rose-300',
        winner: topHost,
        stat: `${maxHosted} events organized`,
        description: 'Stepping up to rally the crew and host'
      });
    }

    return list;
  }, [leagueMembers, memberStats]);

  // Determine standard preset label if known
  const matchedDef = league ? LEAGUE_ROSTER_DEFS.find(d => league.name.toLowerCase().includes(d.nameMatch)) : null;

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {league && (
        <div className="space-y-4 sm:space-y-6">
          {/* Main League Header with Simple Invite Code Button (Invite Analytics removed per user request) */}
          <div className="p-4 sm:p-6 md:p-8 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-2xl sm:rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="relative z-10 space-y-1.5 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest border border-indigo-500/30">
                <Sparkles size={12} /> Active League
              </div>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">{league.name}</h2>
              <p className="text-indigo-200 font-medium text-xs md:text-sm max-w-md">
                {league.description || 'Tools to connect and engage with your community. Zero group-text chaos.'}
              </p>
            </div>
            
            {/* Simple Invite Code Button at Top */}
            <div className="relative z-10 bg-white/10 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-white/20 flex flex-col items-center gap-3 min-w-[220px]">
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">League Invite Code</p>
                <div className="text-2xl font-black font-mono tracking-[0.2em] text-white mt-0.5">{league.inviteCode}</div>
              </div>
              <div className="flex gap-2 w-full">
                <button 
                  onClick={handleShareLink}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-indigo-900/40 cursor-pointer"
                  title="Share invite link"
                >
                  {copiedLink ? <Check size={14} className="text-emerald-300" /> : <Share2 size={14} />}
                  <span>{copiedLink ? "Copied!" : "Share Link"}</span>
                </button>
                <button 
                  onClick={handleCopyCode}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 border border-white/20 cursor-pointer"
                  title="Copy invite code"
                >
                  {copiedCode ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Fun League Trophies Section */}
          {trophies.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pl-2">
                <Trophy size={16} className="text-amber-500" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                  League Trophies & Honors
                </h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {trophies.map(t => (
                  <div
                    key={t.id}
                    className={`bg-white rounded-2xl border p-4 shadow-xs flex items-center justify-between gap-3 relative overflow-hidden transition-all hover:shadow-md ${t.color}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-2xl shrink-0 p-2 bg-white rounded-xl border border-slate-100 shadow-2xs">
                        {t.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-sm text-slate-900 flex items-center gap-1.5 truncate">
                          <span>{t.title}</span>
                        </div>
                        <div className="text-xs font-bold text-indigo-700 truncate mt-0.5">
                          {t.winner.displayName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                          {t.stat}
                        </div>
                      </div>
                    </div>
                    <img 
                      src={t.winner.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.winner.userId}`}
                      alt={t.winner.displayName}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-xs shrink-0"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Members Grid Header & Manage Roster Button */}
      <div className="flex items-center justify-between pl-2">
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            League Roster ({leagueMembers.length})
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Member activity stats and profiles</p>
        </div>
        <button
          onClick={() => {
            setSelectedUids(league?.memberIds || leagueMembers.map(m => m.userId));
            setIsManagingRoster(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs active:scale-95"
        >
          <Users size={14} />
          <span>Manage Roster</span>
        </button>
      </div>

      {/* Members Grid with Individual Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {leagueMembers.map((member, idx) => {
          const stats = memberStats[member.userId] || {
            eventsAttended: 0,
            ideasAdded: 0,
            eventsHosted: 0,
            boardTopics: 0,
            chatMessages: 0,
            eventsDeclined: 0
          };

          const memberTrophies = trophies.filter(t => t.winner.userId === member.userId);

          return (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              key={member.userId}
              className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 hover:border-indigo-300 transition-all group flex flex-col justify-between"
            >
              <div>
                {/* Member Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img 
                      src={member.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.userId}`} 
                      className="w-13 h-13 rounded-2xl border border-slate-200 object-cover shadow-2xs group-hover:scale-105 transition-transform shrink-0" 
                      alt={member.displayName}
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-900 truncate">
                          {member.displayName}
                        </h3>
                        {member.userId === user.uid && (
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 font-medium text-xs mt-0.5 truncate">
                        <Mail size={12} className="shrink-0" /> {member.email}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Trophies Held by this Member */}
                {memberTrophies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {memberTrophies.map(t => (
                      <span
                        key={t.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-2xs ${t.badgeBg}`}
                      >
                        <span>{t.emoji}</span>
                        <span>{t.title}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats Row for this Member */}
                <div className="grid grid-cols-4 gap-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-100 text-center mb-3">
                  <div className="flex flex-col items-center">
                    <span className="text-base font-black text-slate-800 leading-none">
                      {stats.eventsAttended}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                      Attended
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-base font-black text-slate-800 leading-none">
                      {stats.ideasAdded}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                      Ideas
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-base font-black text-slate-800 leading-none">
                      {stats.eventsHosted}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                      Hosted
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-base font-black text-slate-800 leading-none">
                      {stats.boardTopics}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                      Board
                    </span>
                  </div>
                </div>

                {/* Location & Interests */}
                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  {member.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-indigo-500 shrink-0" />
                      <span className="truncate">{member.location}</span>
                    </div>
                  )}

                  {member.interests && member.interests.length > 0 && (
                    <div className="flex items-start gap-1.5">
                      <Hash size={13} className="text-indigo-500 shrink-0 mt-0.5" />
                      <div className="flex flex-wrap gap-1">
                        {member.interests.map(i => (
                          <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold">
                            {i}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Availability Note */}
              {member.availability && (
                <div className="mt-3 pt-2 border-t border-slate-100 text-slate-500 text-xs italic bg-slate-50/50 p-2.5 rounded-xl">
                  "{member.availability}"
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {leagueMembers.length === 0 && (
        <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-300 space-y-3">
          <Users size={32} className="mx-auto text-slate-400" />
          <h4 className="font-black text-slate-700 uppercase">No Members in This League</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Click "Manage Roster" above to add friends, or use the invite code to invite fellow dads.
          </p>
        </div>
      )}

      {/* Manage Roster Modal */}
      <AnimatePresence>
        {isManagingRoster && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagingRoster(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">
                    Manage League Roster
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select the members who belong in <strong>{league?.name}</strong>
                  </p>
                </div>
                <button
                  onClick={() => setIsManagingRoster(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Preset Button if known */}
              {matchedDef && (
                <div className="p-4 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between gap-3">
                  <div className="text-xs text-indigo-900">
                    <span className="font-black uppercase tracking-wider block text-[10px] text-indigo-600">Standard Setup</span>
                    <span>{matchedDef.targetNames.map(n => n === 'me' ? 'You' : n.charAt(0).toUpperCase() + n.slice(1)).join(', ')}</span>
                  </div>
                  <button
                    onClick={handleApplyPreset}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-xs active:scale-95"
                  >
                    Set Preset
                  </button>
                </div>
              )}

              {/* Status Notice */}
              {rosterStatus && (
                <div className="px-6 py-2.5 bg-emerald-50 text-emerald-800 text-xs font-bold border-b border-emerald-100 text-center">
                  {rosterStatus}
                </div>
              )}

              {/* Members Checklist */}
              <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100">
                {allMembers.map(m => {
                  const isChecked = selectedUids.includes(m.userId);
                  return (
                    <div
                      key={m.userId}
                      onClick={() => toggleUserInRoster(m.userId)}
                      className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all pt-3 ${
                        isChecked ? 'bg-indigo-50/60 text-indigo-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={m.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.userId}`}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                          alt=""
                        />
                        <div className="min-w-0">
                          <div className="text-sm truncate">
                            {m.displayName}
                            {m.userId === user.uid && ' (You)'}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{m.email}</div>
                        </div>
                      </div>

                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all shrink-0 ml-2 ${
                        isChecked 
                          ? 'bg-indigo-600 border-indigo-600 text-white' 
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isChecked && <Check size={14} />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsManagingRoster(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingRoster}
                  onClick={handleSaveRoster}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingRoster ? "Saving..." : "Save Roster"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
