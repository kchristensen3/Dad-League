import { useState, useEffect, useMemo, FormEvent } from 'react';
import { User } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Member, League, Session, Activity, Message, Post } from '../types';
import { getUniversalInviteUrl } from '../lib/inviteUtils';
import { matchesDadName, LEAGUE_ROSTER_DEFS, deduplicateRoster } from '../lib/rosterSync';
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
  HelpCircle,
  ShieldCheck,
  Info,
  Pencil,
  Save,
  Link as LinkIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Members({ user, leagueId }: { user: User, leagueId: string }) {
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [league, setLeague] = useState<League | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Active Mini-Section navigation filter
  const [activeMiniSection, setActiveMiniSection] = useState<'all' | 'invite' | 'trophies' | 'roster' | 'about'>('all');

  // League Data for Stats & Trophies
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  // About Section editing state
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [leagueDescInput, setLeagueDescInput] = useState('');
  const [isSavingDesc, setIsSavingDesc] = useState(false);

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
        setLeagueDescInput(lData.description || '');
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

  // Compute members who strictly belong to this league, cleanly deduplicated
  const isBaseballLeague = (league?.name || '').toLowerCase().includes('baseball');
  const rawLeagueMembers = allMembers.filter(m => {
    const isNate = m.userId.includes('nate') || 
                   (m.displayName || '').toLowerCase().includes('nate') || 
                   (m.email || '').toLowerCase().includes('nate');
    if (!isBaseballLeague && isNate) return false;

    if (league?.memberIds && league.memberIds.length > 0) {
      return league.memberIds.includes(m.userId);
    }
    return Boolean(m.leagueIds && m.leagueIds.includes(leagueId));
  });
  const leagueMembers = deduplicateRoster(rawLeagueMembers);

  const inviteUrl = league?.inviteCode ? getUniversalInviteUrl(league.inviteCode) : '';

  const handleInviteDads = async () => {
    if (!league || !inviteUrl) return;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Join ${league.name} on Dad League`,
          text: `You're invited to join ${league.name} on Dad League! Tap to join the crew:`,
          url: inviteUrl
        });
        return;
      } catch {
        // Fallback to clipboard if share sheet dismissed
      }
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleSaveLeagueDescription = async (e: FormEvent) => {
    e.preventDefault();
    if (!league || isSavingDesc) return;
    setIsSavingDesc(true);
    try {
      await updateDoc(doc(db, 'leagues', league.id), {
        description: leagueDescInput.trim()
      });
      setIsEditingAbout(false);
    } catch (err) {
      console.error("Error saving league description:", err);
    } finally {
      setIsSavingDesc(false);
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

    const matchedUids: string[] = [];
    allMembers.forEach(m => {
      const match = matchedDef.targetNames.some(targetName => matchesDadName(targetName, m, user));
      if (match) {
        matchedUids.push(m.userId);
      }
    });

    if (!matchedUids.includes(user.uid)) {
      matchedUids.push(user.uid);
    }

    setSelectedUids(matchedUids);
    setRosterStatus(`Selected standard preset: ${matchedDef.targetNames.join(', ')}`);
    setTimeout(() => setRosterStatus(null), 3000);
  };

  // Save changes to league roster
  const handleSaveRoster = async () => {
    if (!league || isSavingRoster) return;
    setIsSavingRoster(true);

    try {
      await updateDoc(doc(db, 'leagues', league.id), {
        memberIds: selectedUids
      });

      for (const m of allMembers) {
        const docRef = doc(db, 'members', m.userId);
        if (selectedUids.includes(m.userId)) {
          await updateDoc(docRef, {
            leagueIds: arrayUnion(league.id)
          });
        } else {
          await updateDoc(docRef, {
            leagueIds: arrayRemove(league.id)
          });
        }
      }

      setIsManagingRoster(false);
    } catch (err) {
      console.error("Failed to update league roster:", err);
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

    return [
      {
        id: 'gift-of-gab',
        title: 'Gift of Gab',
        emoji: '🎙️',
        icon: MessageCircle,
        color: 'from-amber-500/20 to-orange-500/10 text-amber-900 border-amber-300',
        badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
        winner: maxChat > 0 ? topChatter : null,
        stat: maxChat > 0 ? `${maxChat} chat messages` : null,
        description: 'Most active chatter keeping the guys engaged'
      },
      {
        id: 'ironman',
        title: 'Ironman',
        emoji: '⚡',
        icon: Zap,
        color: 'from-emerald-500/20 to-teal-500/10 text-emerald-900 border-emerald-300',
        badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        winner: maxAttended > 0 ? topAttendee : null,
        stat: maxAttended > 0 ? `${maxAttended} events attended` : null,
        description: 'Never misses a meetup or outing'
      },
      {
        id: 'non-committal',
        title: 'The Non-Committal',
        emoji: '🤷‍♂️',
        icon: HelpCircle,
        color: 'from-violet-500/20 to-purple-500/10 text-violet-900 border-violet-300',
        badgeBg: 'bg-violet-100 text-violet-900 border-violet-300',
        winner: maxDeclined > 0 ? topDecliner : null,
        stat: maxDeclined > 0 ? `${maxDeclined} times passed` : null,
        description: 'Champion of "let me check with the boss"'
      },
      {
        id: 'idea-machine',
        title: 'Idea Machine',
        emoji: '💡',
        icon: Lightbulb,
        color: 'from-blue-500/20 to-indigo-500/10 text-blue-900 border-blue-300',
        badgeBg: 'bg-blue-100 text-blue-900 border-blue-300',
        winner: maxIdeas > 0 ? topIdeator : null,
        stat: maxIdeas > 0 ? `${maxIdeas} ideas contributed` : null,
        description: 'Always bringing new activities to the table'
      },
      {
        id: 'head-coach',
        title: 'Head Coach',
        emoji: '👑',
        icon: Crown,
        color: 'from-rose-500/20 to-pink-500/10 text-rose-900 border-rose-300',
        badgeBg: 'bg-rose-100 text-rose-900 border-rose-300',
        winner: maxHosted > 0 ? topHost : null,
        stat: maxHosted > 0 ? `${maxHosted} events organized` : null,
        description: 'Stepping up to rally the crew and host'
      }
    ];
  }, [leagueMembers, memberStats]);

  // Determine standard preset label if known
  const matchedDef = league ? LEAGUE_ROSTER_DEFS.find(d => league.name.toLowerCase().includes(d.nameMatch)) : null;

  return (
    <div className="space-y-6 pb-12">
      {/* Mini-Sections Quick Navigator */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-bold">
        {[
          { id: 'all', label: 'All Sections' },
          { id: 'invite', label: '1. Invite Dads' },
          { id: 'trophies', label: '2. Trophy Case' },
          { id: 'roster', label: '3. League Roster' },
          { id: 'about', label: '4. About League' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveMiniSection(tab.id as any)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
              activeMiniSection === tab.id
                ? 'bg-indigo-600 text-white shadow-xs font-black'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* MINI SECTION 1: INVITE DADS */}
      {(activeMiniSection === 'all' || activeMiniSection === 'invite') && (
        <section id="section-invite" className="space-y-2.5">
          <div className="flex items-center justify-between pl-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black shadow-2xs">
                1
              </span>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-700">
                Invite Dads
              </h3>
            </div>
            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200/80">
              1-Tap Join
            </span>
          </div>

          <div className="p-5 sm:p-6 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>

            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
              <div className="space-y-1.5 min-w-0">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-indigo-200 text-[10px] font-black uppercase tracking-wider border border-white/15">
                  <Sparkles size={11} /> Invite Crew
                </div>
                <h4 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                  Invite Dads to {league?.name || 'Your League'}
                </h4>
                <p className="text-indigo-200 text-xs sm:text-sm font-medium max-w-md leading-relaxed">
                  Tap to share your invite link. Any dad who clicks it is automatically guided to join <strong>{league?.name}</strong> in one step.
                </p>
              </div>

              <div className="shrink-0 w-full sm:w-auto">
                <button
                  onClick={handleInviteDads}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-950 cursor-pointer"
                  title="Invite dads to join this league"
                >
                  {copiedLink ? <Check size={16} className="text-emerald-300" /> : <Share2 size={16} />}
                  <span>{copiedLink ? "Invite Link Copied!" : "Invite Dads"}</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* MINI SECTION 2: TROPHY CASE */}
      {(activeMiniSection === 'all' || activeMiniSection === 'trophies') && (
        <section id="section-trophies" className="space-y-2.5">
          <div className="flex items-center justify-between pl-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center text-xs font-black shadow-2xs">
                2
              </span>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-700">
                Trophy Case
              </h3>
            </div>
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              Live Honors
            </span>
          </div>

          <p className="text-xs text-slate-500 pl-1">
            Live honors awarded dynamically based on dad activity & participation in {league?.name || 'this league'}.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trophies.map(t => {
              const hasWinner = Boolean(t.winner);
              return (
                <div
                  key={t.id}
                  className={`bg-white rounded-2xl border p-4 shadow-xs flex items-center justify-between gap-3 relative overflow-hidden transition-all hover:shadow-md ${
                    hasWinner ? t.color : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`text-2xl shrink-0 p-2 rounded-xl border shadow-2xs ${hasWinner ? 'bg-white border-slate-100' : 'bg-slate-100 border-slate-200 opacity-60'}`}>
                      {t.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm text-slate-900 flex items-center gap-1.5 truncate">
                        <span>{t.title}</span>
                      </div>
                      {hasWinner && t.winner ? (
                        <>
                          <div className="text-xs font-bold text-indigo-700 truncate mt-0.5">
                            {t.winner.displayName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                            {t.stat}
                          </div>
                        </>
                      ) : (
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                          Up for grabs
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                        {t.description}
                      </div>
                    </div>
                  </div>

                  {hasWinner && t.winner && (
                    <img 
                      src={t.winner.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.winner.userId}`}
                      alt={t.winner.displayName}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-xs shrink-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* MINI SECTION 3: LEAGUE ROSTER */}
      {(activeMiniSection === 'all' || activeMiniSection === 'roster') && (
        <section id="section-roster" className="space-y-2.5">
          <div className="flex items-center justify-between pl-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black shadow-2xs">
                3
              </span>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-700">
                League Roster ({leagueMembers.length})
              </h3>
            </div>
            <button
              onClick={() => {
                setSelectedUids(league?.memberIds || leagueMembers.map(m => m.userId));
                setIsManagingRoster(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Users size={13} />
              <span>Manage Roster</span>
            </button>
          </div>

          <p className="text-xs text-slate-500 pl-1">
            Active roster members, individual participation stats, and profile bios.
          </p>

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

              const memberTrophies = trophies.filter(t => t.winner?.userId === member.userId);

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  key={member.userId}
                  className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 hover:border-indigo-300 transition-all group flex flex-col justify-between"
                >
                  <div>
                    {/* Member Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img 
                          src={member.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.userId}`} 
                          className="w-12 h-12 rounded-2xl border border-slate-200 object-cover shadow-2xs group-hover:scale-105 transition-transform shrink-0" 
                          alt={member.displayName}
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm sm:text-base font-black tracking-tight text-slate-900 truncate">
                              {member.displayName}
                            </h4>
                            {member.userId === user.uid && (
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-400 font-medium text-xs mt-0.5 truncate">
                            {member.email && !member.email.toLowerCase().endsWith('@dadleague.app') ? (
                              <>
                                <Mail size={12} className="shrink-0" /> {member.email}
                              </>
                            ) : (
                              <span className="text-slate-400 font-medium text-[11px]">
                                {member.userId.startsWith('dad_') ? 'Pending Invite' : 'League Member'}
                              </span>
                            )}
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
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-2xs ${t.badgeBg}`}
                          >
                            <span>{t.emoji}</span>
                            <span>{t.title}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Stats Row for this Member */}
                    <div className="grid grid-cols-4 gap-2 bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100 text-center mb-3">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-black text-slate-800 leading-none">
                          {stats.eventsAttended}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                          Attended
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-black text-slate-800 leading-none">
                          {stats.ideasAdded}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                          Ideas
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-black text-slate-800 leading-none">
                          {stats.eventsHosted}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                          Hosted
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-black text-slate-800 leading-none">
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
            <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-slate-300 space-y-2">
              <Users size={30} className="mx-auto text-slate-400" />
              <h4 className="font-black text-slate-700 uppercase text-sm">No Members in This League</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Tap "Manage Roster" above to select friends, or send the invite link.
              </p>
            </div>
          )}
        </section>
      )}

      {/* MINI SECTION 4: ABOUT THIS LEAGUE */}
      {(activeMiniSection === 'all' || activeMiniSection === 'about') && (
        <section id="section-about" className="space-y-2.5">
          <div className="flex items-center justify-between pl-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-slate-800 text-white flex items-center justify-center text-xs font-black shadow-2xs">
                4
              </span>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-700">
                About This League
              </h3>
            </div>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              Overview & Rules
            </span>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-5">
            {/* Header info & description */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                    {league?.name || 'Your League'}
                  </h4>
                  <p className="text-xs text-slate-400 font-medium">
                    Active Dad League community crew
                  </p>
                </div>

                {!isEditingAbout ? (
                  <button
                    onClick={() => setIsEditingAbout(true)}
                    className="flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Pencil size={12} />
                    <span>Edit Info</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsEditingAbout(false)}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {isEditingAbout ? (
                <form onSubmit={handleSaveLeagueDescription} className="space-y-2.5 pt-1">
                  <textarea
                    value={leagueDescInput}
                    onChange={e => setLeagueDescInput(e.target.value)}
                    placeholder="Describe what this league is about..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingAbout(false)}
                      className="px-3.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingDesc}
                      className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-1"
                    >
                      <Save size={12} />
                      <span>{isSavingDesc ? 'Saving...' : 'Save Description'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-slate-600 leading-relaxed bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
                  {league?.description || 'Tools to connect and engage with your community. Zero group-text chaos.'}
                </p>
              )}
            </div>

            {/* Quick Stats Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="bg-indigo-50/60 p-3 rounded-2xl border border-indigo-100">
                <span className="text-base sm:text-lg font-black text-indigo-900 leading-none">
                  {sessions.length}
                </span>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mt-1">
                  Events
                </span>
              </div>
              <div className="bg-indigo-50/60 p-3 rounded-2xl border border-indigo-100">
                <span className="text-base sm:text-lg font-black text-indigo-900 leading-none">
                  {activities.length}
                </span>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mt-1">
                  Ideas
                </span>
              </div>
              <div className="bg-indigo-50/60 p-3 rounded-2xl border border-indigo-100">
                <span className="text-base sm:text-lg font-black text-indigo-900 leading-none">
                  {posts.length}
                </span>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mt-1">
                  Topics
                </span>
              </div>
              <div className="bg-indigo-50/60 p-3 rounded-2xl border border-indigo-100">
                <span className="text-base sm:text-lg font-black text-indigo-900 leading-none">
                  {messages.length}
                </span>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mt-1">
                  Messages
                </span>
              </div>
            </div>

            {/* Ground Rules */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Dad League Ground Rules
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                  <div className="font-black text-xs text-slate-800 flex items-center gap-1">
                    <span>1. Respect the RSVP</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Be in or be out. If life happens, update your status early so the guys can plan.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                  <div className="font-black text-xs text-slate-800 flex items-center gap-1">
                    <span>2. Real Hangouts</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    A 90-minute meetup in person beats 500 texts in a group-chat thread every time.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                  <div className="font-black text-xs text-slate-800 flex items-center gap-1">
                    <span>3. Anyone Can Host</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Suggest an activity in the Ideas tab or pick a day on the calendar to rally the crew.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
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
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-900">
                    Manage League Roster
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select the members who belong in <strong>{league?.name}</strong>
                  </p>
                </div>
                <button
                  onClick={() => setIsManagingRoster(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Preset Button if known */}
              {matchedDef && (
                <div className="p-3.5 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between gap-3">
                  <div className="text-xs text-indigo-900">
                    <span className="font-black uppercase tracking-wider block text-[9px] text-indigo-600">Standard Setup</span>
                    <span className="font-medium text-xs">{matchedDef.targetNames.map(n => n === 'me' ? 'You' : n.charAt(0).toUpperCase() + n.slice(1)).join(', ')}</span>
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
                <div className="px-5 py-2 bg-emerald-50 text-emerald-800 text-xs font-bold border-b border-emerald-100 text-center">
                  {rosterStatus}
                </div>
              )}

              {/* Members Checklist */}
              <div className="p-4 overflow-y-auto space-y-1.5 flex-1 divide-y divide-slate-100">
                {deduplicateRoster(allMembers).map(m => {
                  const isChecked = selectedUids.includes(m.userId);
                  return (
                    <div
                      key={m.userId}
                      onClick={() => toggleUserInRoster(m.userId)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all ${
                        isChecked ? 'bg-indigo-50/60 text-indigo-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={m.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.userId}`}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                          alt=""
                        />
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm truncate">
                            {m.displayName}
                            {m.userId === user.uid && ' (You)'}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{m.email}</div>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all shrink-0 ml-2 ${
                        isChecked 
                          ? 'bg-indigo-600 border-indigo-600 text-white' 
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isChecked && <Check size={12} />}
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
                  className="px-4 py-2 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingRoster}
                  onClick={handleSaveRoster}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-50 cursor-pointer"
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
