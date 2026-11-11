import { useState, useEffect, useRef, useMemo, FormEvent, ChangeEvent, KeyboardEvent } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Session, Message, Member, League } from '../types';
import { deduplicateRoster } from '../lib/rosterSync';
import { 
  Send, 
  AtSign, 
  Hash, 
  ChevronDown, 
  Check, 
  Calendar as CalendarIcon, 
  Users, 
  Sparkles,
  X,
  Flame,
  Clock,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatProps {
  user: User;
  leagueId: string;
  sessions: Session[];
  selectedThreadId: string;
  setSelectedThreadId: (id: string) => void;
}

const DEFAULT_TOPIC_SUGGESTIONS = [
  'pistons',
  'parenting',
  'detroit',
  'sports',
  'grilling',
  'beer',
  'golf',
  'dadjokes'
];

export default function Chat({
  user,
  leagueId,
  sessions,
  selectedThreadId,
  setSelectedThreadId
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeLeague, setActiveLeague] = useState<League | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  // Channel switcher dropdown state
  const [showChannelMenu, setShowChannelMenu] = useState(false);
  const channelDropdownRef = useRef<HTMLDivElement>(null);

  // Active topic hashtag filter
  const [activeTopicFilter, setActiveTopicFilter] = useState<string | null>(null);

  // @ Mention states (Full name support)
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  // # Topic suggestions states
  const [showTopics, setShowTopics] = useState(false);
  const [topicFilter, setTopicFilter] = useState('');
  const [selectedTopicIndex, setSelectedTopicIndex] = useState(0);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch messages and league info
  useEffect(() => {
    if (!user || !leagueId) return;

    const unsubscribeM = onSnapshot(collection(db, 'messages'), (snap) => {
      const allMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      const matched = allMsgs.filter(m => m.leagueId === leagueId || !m.leagueId || m.leagueId === 'default-league');
      const list = matched.length > 0 ? matched : allMsgs;
      
      // Sort chronologically
      list.sort((a, b) => {
        const getMs = (val: any) => {
          if (!val) return 0;
          if (val.seconds) return val.seconds * 1000;
          return new Date(val).getTime() || 0;
        };
        return getMs(a.createdAt) - getMs(b.createdAt);
      });
      setMessages(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'messages'));

    let activeLeagueDoc: League | null = null;
    let rawMembersList: Member[] = [];

    const syncChatMembers = () => {
      const isBaseball = (activeLeagueDoc?.name || '').toLowerCase().includes('baseball');
      const filtered = rawMembersList.filter(m => {
        const isNate = m.userId.includes('nate') || 
                       (m.displayName || '').toLowerCase().includes('nate') || 
                       (m.email || '').toLowerCase().includes('nate');
        if (!isBaseball && isNate) return false;

        if (activeLeagueDoc?.memberIds && activeLeagueDoc.memberIds.length > 0) {
          return activeLeagueDoc.memberIds.includes(m.userId);
        }
        return Boolean(m.leagueIds && m.leagueIds.includes(leagueId));
      });
      setMembers(deduplicateRoster(filtered));
    };

    const unsubscribeL = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      if (snap.exists()) {
        activeLeagueDoc = { id: snap.id, ...snap.data() } as League;
        setActiveLeague(activeLeagueDoc);
        syncChatMembers();
      }
    });

    const unsubscribeU = onSnapshot(collection(db, 'members'), (snap) => {
      rawMembersList = snap.docs.map(d => ({ ...d.data() } as Member));
      syncChatMembers();
    }, (err) => handleFirestoreError(err, OperationType.GET, 'members'));

    return () => {
      unsubscribeM();
      unsubscribeL();
      unsubscribeU();
    };
  }, [user, leagueId]);

  // Close channel menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (channelDropdownRef.current && !channelDropdownRef.current.contains(event.target as Node)) {
        setShowChannelMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll on new messages or thread change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, selectedThreadId, activeTopicFilter]);

  // Reset thread to 'general' if selected event is cancelled
  useEffect(() => {
    if (selectedThreadId !== 'general') {
      const currentSession = sessions.find(s => s.id === selectedThreadId);
      if (currentSession && currentSession.status === 'cancelled') {
        setSelectedThreadId('general');
      }
    }
  }, [sessions, selectedThreadId, setSelectedThreadId]);

  // Separate upcoming and past events for this league
  const now = new Date();
  const leagueEvents = sessions.filter(s => s.leagueId === leagueId && s.status !== 'cancelled');
  
  const upcomingEvents = leagueEvents
    .filter(s => new Date(s.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
  const pastEvents = leagueEvents
    .filter(s => new Date(s.date) < now || s.status === 'completed')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const isGeneral = selectedThreadId === 'general';
  const activeEvent = leagueEvents.find(s => s.id === selectedThreadId);
  const currentChannelTitle = isGeneral ? 'General Chat' : (activeEvent?.activityName || 'Event Chat');

  // Extract and rank the most popular #topics from league messages
  const popularTopics = useMemo(() => {
    const counts: Record<string, number> = {};
    DEFAULT_TOPIC_SUGGESTIONS.forEach(t => { counts[`#${t}`] = 0; });

    messages.forEach(msg => {
      const text = msg.text || '';
      const tags = text.match(/#[A-Za-z0-9_-]+/g);
      if (tags) {
        tags.forEach(t => {
          const lower = t.toLowerCase();
          counts[lower] = (counts[lower] || 0) + 1;
        });
      }
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }))
      .slice(0, 8);
  }, [messages]);

  // Filter messages: remove all automated announcements, filter by thread, and apply topic filter if active
  const cleanMessages = messages.filter(msg => {
    const text = msg.text || '';
    const sender = (msg.senderName || '').toLowerCase();
    
    // Discard any legacy automated announcement clutter
    const isAnnouncement = 
      msg.senderId === 'SYSTEM' ||
      sender.includes('announcement') ||
      sender.includes('hq') ||
      sender.includes('dad league') ||
      text.startsWith('NEW EVENT:') ||
      text.startsWith('CANCELLED:') ||
      text.startsWith('UPDATED:') ||
      text.startsWith('👋 ') ||
      text.startsWith('📢 ');

    if (isAnnouncement) return false;

    // Thread matching
    const inThread = selectedThreadId === 'general'
      ? (!msg.threadId || msg.threadId === 'general')
      : msg.threadId === selectedThreadId;

    if (!inThread) return false;

    // Topic hashtag filter
    if (activeTopicFilter) {
      const lowerText = text.toLowerCase();
      const target = activeTopicFilter.toLowerCase();
      return lowerText.includes(target);
    }

    return true;
  });

  // Filter members for full name @mentions
  const filteredMentionMembers = members.filter(m => {
    const fullName = (m.displayName || '').toLowerCase();
    const query = mentionFilter.toLowerCase();
    return fullName.includes(query);
  });

  // Filter topic suggestions
  const filteredTopicSuggestions = useMemo(() => {
    const query = topicFilter.toLowerCase().replace(/^#/, '');
    const set = new Set<string>();

    popularTopics.forEach(p => set.add(p.tag.replace(/^#/, '')));
    DEFAULT_TOPIC_SUGGESTIONS.forEach(t => set.add(t));

    return Array.from(set)
      .filter(t => t.toLowerCase().includes(query))
      .slice(0, 6);
  }, [topicFilter, popularTopics]);

  // Handle typing in chat input (detects @ for mentions and # for topics)
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputText(value);

    const cursor = e.target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursor);

    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    const lastHashSymbol = textBeforeCursor.lastIndexOf('#');

    // Handle @ mentions
    if (lastAtSymbol !== -1 && (lastAtSymbol === 0 || textBeforeCursor[lastAtSymbol - 1] === ' ')) {
      const filter = textBeforeCursor.slice(lastAtSymbol + 1);
      setMentionFilter(filter);
      setShowMentions(true);
      setShowTopics(false);
      setSelectedMentionIndex(0);
      return;
    } else {
      setShowMentions(false);
    }

    // Handle # topics
    if (lastHashSymbol !== -1 && (lastHashSymbol === 0 || textBeforeCursor[lastHashSymbol - 1] === ' ')) {
      const filter = textBeforeCursor.slice(lastHashSymbol + 1);
      setTopicFilter(filter);
      setShowTopics(true);
      setShowMentions(false);
      setSelectedTopicIndex(0);
      return;
    } else {
      setShowTopics(false);
    }
  };

  // Insert FULL NAME @mention
  const insertMention = (member: Member) => {
    const fullName = (member.displayName || 'Dad').trim();
    const mentionTag = `@${fullName}`;

    const cursor = inputRef.current?.selectionStart ?? inputText.length;
    const textBefore = inputText.slice(0, cursor);
    const textAfter = inputText.slice(cursor);
    const lastAt = textBefore.lastIndexOf('@');

    let updated = '';
    if (lastAt !== -1) {
      updated = textBefore.slice(0, lastAt) + mentionTag + ' ' + textAfter;
    } else {
      updated = inputText + (inputText.endsWith(' ') || !inputText ? '' : ' ') + mentionTag + ' ';
    }

    setInputText(updated);
    setShowMentions(false);
    setMentionFilter('');
    inputRef.current?.focus();
  };

  // Insert #topic
  const insertTopic = (topic: string) => {
    const cleanTopic = topic.startsWith('#') ? topic : `#${topic}`;

    const cursor = inputRef.current?.selectionStart ?? inputText.length;
    const textBefore = inputText.slice(0, cursor);
    const textAfter = inputText.slice(cursor);
    const lastHash = textBefore.lastIndexOf('#');

    let updated = '';
    if (lastHash !== -1) {
      updated = textBefore.slice(0, lastHash) + cleanTopic + ' ' + textAfter;
    } else {
      updated = inputText + (inputText.endsWith(' ') || !inputText ? '' : ' ') + cleanTopic + ' ';
    }

    setInputText(updated);
    setShowTopics(false);
    setTopicFilter('');
    inputRef.current?.focus();
  };

  // Keyboard navigation for mention or topic suggestions
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showMentions && filteredMentionMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev + 1) % filteredMentionMembers.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev - 1 + filteredMentionMembers.length) % filteredMentionMembers.length);
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filteredMentionMembers[selectedMentionIndex];
        if (target) insertMention(target);
        return;
      } else if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    if (showTopics && filteredTopicSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedTopicIndex(prev => (prev + 1) % filteredTopicSuggestions.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedTopicIndex(prev => (prev - 1 + filteredTopicSuggestions.length) % filteredTopicSuggestions.length);
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filteredTopicSuggestions[selectedTopicIndex];
        if (target) insertTopic(target);
        return;
      } else if (e.key === 'Escape') {
        setShowTopics(false);
        return;
      }
    }
  };

  // Send message
  const handleSend = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        leagueId,
        senderId: user.uid,
        senderName: user.displayName || 'Dad',
        text: trimmed,
        threadId: selectedThreadId,
        createdAt: serverTimestamp()
      });
      setInputText('');
      setShowMentions(false);
      setShowTopics(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'messages');
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // Format message time
  const formatTime = (createdAt: any) => {
    if (!createdAt) return 'Just now';
    let date: Date;
    if (createdAt?.toDate && typeof createdAt.toDate === 'function') {
      date = createdAt.toDate();
    } else if (createdAt?.seconds) {
      date = new Date(createdAt.seconds * 1000);
    } else if (typeof createdAt === 'string' || typeof createdAt === 'number') {
      date = new Date(createdAt);
    } else {
      return '';
    }
    if (isNaN(date.getTime())) return '';

    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    
    if (isToday) return timeStr;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${timeStr}`;
  };

  // Render message text with highlighted @Full Names and #topics
  const renderMessageContent = (text: string) => {
    // Collect full names sorted descending by length to match multi-word names first
    const fullNames = members
      .map(m => m.displayName?.trim())
      .filter(Boolean) as string[];
    fullNames.sort((a, b) => b.length - a.length);

    // Escape regex
    const escapeRegex = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // Pattern matching either known @Full Names or @word, or #topics
    const namePatterns = fullNames.map(n => `@${escapeRegex(n)}`);
    const allTokensPattern = new RegExp(`(${namePatterns.concat(['@[A-Za-z0-9_-]+', '#[A-Za-z0-9_-]+']).join('|')})`, 'g');

    const parts = text.split(allTokensPattern);
    const myFullName = (user.displayName || '').trim().toLowerCase();

    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const handle = part.slice(1).trim().toLowerCase();
        const isMe = myFullName && (handle === myFullName || myFullName.includes(handle));
        
        return (
          <span
            key={i}
            className={`inline-flex items-center px-1.5 py-0.5 rounded font-black text-xs mx-0.5 shadow-2xs ${
              isMe 
                ? 'bg-amber-200 text-amber-950 ring-1 ring-amber-400' 
                : 'bg-indigo-100 text-indigo-900 ring-1 ring-indigo-200'
            }`}
          >
            {part}
          </span>
        );
      }

      if (part.startsWith('#')) {
        const isCurrentTopic = activeTopicFilter && activeTopicFilter.toLowerCase() === part.toLowerCase();
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTopicFilter(isCurrentTopic ? null : part);
            }}
            className={`inline-flex items-center px-1.5 py-0.5 rounded font-black text-xs mx-0.5 transition-colors cursor-pointer ${
              isCurrentTopic
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 ring-1 ring-emerald-300'
            }`}
            title={`Filter chat by ${part}`}
          >
            {part}
          </button>
        );
      }

      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-165px)] md:h-[calc(100vh-190px)] max-w-4xl mx-auto w-full px-2 sm:px-4">
      {/* Rebuilt Top Bar: Prominent Channel Switcher with Popular Topics & Separated Events */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3 md:p-4 mb-3 flex items-center justify-between gap-3 shrink-0">
        {/* Large, Intuitive Channel Dropdown Button */}
        <div className="relative" ref={channelDropdownRef}>
          <button
            type="button"
            onClick={() => setShowChannelMenu(!showChannelMenu)}
            className="flex items-center gap-3 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white rounded-2xl shadow-sm transition-all text-left cursor-pointer group"
            title="Click to switch chat channel, topics, or events"
          >
            <div className="w-8 h-8 rounded-xl bg-indigo-600/30 text-indigo-300 flex items-center justify-center font-black text-sm shrink-0">
              {isGeneral ? '#' : '📅'}
            </div>
            <div className="min-w-0 pr-1">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                Channel {activeTopicFilter ? `• ${activeTopicFilter}` : ''}
              </div>
              <div className="text-sm md:text-base font-black text-white truncate flex items-center gap-2">
                {currentChannelTitle}
                <ChevronDown 
                  size={16} 
                  className={`text-slate-400 group-hover:text-white transition-transform duration-200 shrink-0 ${showChannelMenu ? 'rotate-180' : ''}`} 
                />
              </div>
            </div>
          </button>

          {/* Expanded Channel Picker Menu (Shows Topics, Upcoming Events, Past Events) */}
          <AnimatePresence>
            {showChannelMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full mt-2 w-80 md:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden py-2"
              >
                <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                    Channels & Topics
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {upcomingEvents.length + pastEvents.length + 1} channels
                  </span>
                </div>

                <div className="max-h-96 overflow-y-auto p-2 space-y-3 custom-scrollbar">
                  {/* 1. Main General Chat */}
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedThreadId('general');
                        setActiveTopicFilter(null);
                        setShowChannelMenu(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-colors cursor-pointer ${
                        isGeneral && !activeTopicFilter
                          ? 'bg-indigo-50 border border-indigo-200 text-indigo-950 font-bold' 
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-base shrink-0 ${
                          isGeneral ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          #
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm truncate">General Chat</div>
                          <div className="text-xs text-slate-400 truncate">
                            Main hangout for all {members.length} members
                          </div>
                        </div>
                      </div>
                      {isGeneral && !activeTopicFilter && <Check size={18} className="text-indigo-600 shrink-0 ml-2" />}
                    </button>
                  </div>

                  {/* 2. Most Popular # Topics */}
                  <div className="pt-1 border-t border-slate-100">
                    <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <Flame size={12} className="text-amber-500" /> Popular # Topics
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-1">
                      {popularTopics.map(({ tag, count }) => {
                        const isSelectedTopic = activeTopicFilter?.toLowerCase() === tag.toLowerCase();
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setSelectedThreadId('general');
                              setActiveTopicFilter(isSelectedTopic ? null : tag);
                              setShowChannelMenu(false);
                            }}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                              isSelectedTopic
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            <span>{tag}</span>
                            {count > 0 && (
                              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelectedTopic ? 'bg-white/20 text-white' : 'bg-emerald-200/60 text-emerald-900'}`}>
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Upcoming Events */}
                  <div className="pt-1 border-t border-slate-100">
                    <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <CalendarIcon size={12} /> Upcoming Events ({upcomingEvents.length})
                      </span>
                    </div>

                    {upcomingEvents.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-400 italic">No upcoming events planned</div>
                    ) : (
                      upcomingEvents.map(event => {
                        const isEventActive = selectedThreadId === event.id;
                        const eventDateStr = new Date(event.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => {
                              setSelectedThreadId(event.id);
                              setActiveTopicFilter(null);
                              setShowChannelMenu(false);
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                              isEventActive 
                                ? 'bg-indigo-50 border border-indigo-200 text-indigo-950 font-bold' 
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isEventActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'
                              }`}>
                                <CalendarIcon size={14} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-xs truncate">{event.activityName}</div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {eventDateStr} • {event.attendees?.length || 0} attending
                                </div>
                              </div>
                            </div>
                            {isEventActive && <Check size={16} className="text-indigo-600 shrink-0 ml-2" />}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* 4. Past Events */}
                  {pastEvents.length > 0 && (
                    <div className="pt-1 border-t border-slate-100">
                      <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                        <Clock size={12} /> Past Events ({pastEvents.length})
                      </div>
                      {pastEvents.map(event => {
                        const isEventActive = selectedThreadId === event.id;
                        const eventDateStr = new Date(event.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => {
                              setSelectedThreadId(event.id);
                              setActiveTopicFilter(null);
                              setShowChannelMenu(false);
                            }}
                            className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-colors cursor-pointer opacity-70 hover:opacity-100 ${
                              isEventActive 
                                ? 'bg-slate-100 text-slate-900 font-bold' 
                                : 'hover:bg-slate-50 text-slate-600'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[10px] font-bold text-slate-400 shrink-0">{eventDateStr}</span>
                              <span className="font-medium text-xs truncate">{event.activityName}</span>
                            </div>
                            {isEventActive && <Check size={14} className="text-slate-600 shrink-0 ml-2" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* League Dads Member Stack */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex -space-x-2 overflow-hidden items-center py-1">
            {members.slice(0, 4).map(m => (
              <img
                key={m.userId}
                src={m.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.userId}`}
                alt={m.displayName}
                title={m.displayName}
                className="w-7 h-7 rounded-full ring-2 ring-white object-cover shadow-xs"
              />
            ))}
            {members.length > 4 && (
              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black ring-2 ring-white flex items-center justify-center">
                +{members.length - 4}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
            <Users size={14} className="text-slate-400" />
            <span>{members.length}</span>
          </div>
        </div>
      </div>

      {/* Filter Banner when a topic is selected */}
      <AnimatePresence>
        {activeTopicFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-emerald-900"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold">Filtering messages by:</span>
              <span className="font-black px-2 py-0.5 bg-emerald-200/60 rounded-md text-emerald-900">
                {activeTopicFilter}
              </span>
              <span className="text-emerald-700">({cleanMessages.length} results)</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTopicFilter(null)}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
            >
              <X size={14} /> Clear Filter
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Message Stream Container */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden mb-20 md:mb-2">
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3.5 custom-scrollbar min-h-0"
        >
          {cleanMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 my-auto">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-3 shadow-xs">
                <Sparkles size={28} />
              </div>
              <h4 className="font-black text-slate-800 text-base mb-1">
                {activeTopicFilter ? `No messages tagged with ${activeTopicFilter}` : `Welcome to ${currentChannelTitle}!`}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mb-4">
                {activeTopicFilter
                  ? `Be the first to post using ${activeTopicFilter} in ${currentChannelTitle}!`
                  : isGeneral 
                    ? `Say what's up to the dads in ${activeLeague?.name || 'the league'}, use @ to mention someone with their full name, or tag topics with # (like #pistons or #parenting).` 
                    : `Dedicated chat for coordinating "${activeEvent?.activityName}".`}
              </p>
              
              {/* Quick Icebreaker Prompts */}
              {!activeTopicFilter && (
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  <button
                    type="button"
                    onClick={() => {
                      setInputText("What's everyone up to this week? #detroit");
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full text-xs font-medium text-slate-600 transition-colors cursor-pointer"
                  >
                    "What's everyone up to? #detroit"
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInputText("Anyone catch the game? #pistons");
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full text-xs font-medium text-slate-600 transition-colors cursor-pointer"
                  >
                    "Anyone catch the game? #pistons"
                  </button>
                </div>
              )}
            </div>
          ) : (
            cleanMessages.map((msg, index) => {
              const isMe = msg.senderId === user.uid;
              const prevMsg = index > 0 ? cleanMessages[index - 1] : null;
              const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId;

              return (
                <div 
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isConsecutive ? 'mt-1' : 'mt-3'}`}
                >
                  <div className={`flex items-end gap-2 max-w-[88%] sm:max-w-[75%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Other Dad Avatar */}
                    {!isMe && (
                      <div className="shrink-0 mb-0.5">
                        {!isConsecutive ? (
                          <img 
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`} 
                            alt={msg.senderName} 
                            className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-200"
                          />
                        ) : (
                          <div className="w-7" />
                        )}
                      </div>
                    )}

                    <div>
                      {/* Sender Name & Timestamp Header */}
                      {!isConsecutive && (
                        <div className={`flex items-center gap-2 mb-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <span className={`text-xs font-black ${isMe ? 'text-indigo-600' : 'text-slate-700'}`}>
                            {isMe ? 'You' : msg.senderName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      )}

                      {/* Clean Message Bubble with Full Name @Mentions and #Topics */}
                      <div className={`px-4 py-2.5 rounded-2xl shadow-xs text-sm leading-relaxed ${
                        isMe
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-slate-50 text-slate-900 border border-slate-200/80 rounded-bl-xs'
                      }`}>
                        {renderMessageContent(msg.text)}
                      </div>

                      {/* Small Time on Hover/Consecutive */}
                      {isConsecutive && (
                        <div className={`text-[9px] text-slate-400 mt-0.5 px-1 ${isMe ? 'text-right' : 'text-left'}`}>
                          {formatTime(msg.createdAt)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input Bar with @ Mention and # Topic Pickers */}
        <div className="border-t border-slate-200 p-2.5 sm:p-3 bg-slate-50/70 relative">
          {/* Autocomplete / Full Name Mention Suggestion Popover */}
          <AnimatePresence>
            {showMentions && filteredMentionMembers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-2 right-2 sm:left-4 sm:right-auto sm:w-80 mb-2 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50"
              >
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <AtSign size={12} className="text-indigo-600" />
                    Mention a Dad (Full Name)
                  </div>
                  <span className="text-[9px] text-slate-400">Esc to cancel</span>
                </div>
                <div className="max-h-48 overflow-y-auto p-1.5">
                  {filteredMentionMembers.map((m, idx) => {
                    const isSelected = idx === selectedMentionIndex;
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => insertMention(m)}
                        onMouseEnter={() => setSelectedMentionIndex(idx)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                          isSelected ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <img
                          src={m.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.userId}`}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-200"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-black truncate">{m.displayName}</div>
                          {m.email && <div className="text-[10px] text-slate-400 truncate">{m.email}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Autocomplete / # Topic Suggestions Popover */}
          <AnimatePresence>
            {showTopics && filteredTopicSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-2 right-2 sm:left-14 sm:right-auto sm:w-72 mb-2 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50"
              >
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    <Hash size={12} className="text-emerald-600" />
                    Add a Topic
                  </div>
                  <span className="text-[9px] text-slate-400">Esc to cancel</span>
                </div>
                <div className="max-h-48 overflow-y-auto p-1.5 space-y-1">
                  {filteredTopicSuggestions.map((t, idx) => {
                    const isSelected = idx === selectedTopicIndex;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => insertTopic(t)}
                        onMouseEnter={() => setSelectedTopicIndex(idx)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                          isSelected ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span className="text-xs font-black text-emerald-800">#{t}</span>
                        <span className="text-[10px] text-slate-400">Insert tag</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSend} className="flex items-center gap-2">
            {/* Quick @ Mention Button (Inserts Full Name) */}
            <button
              type="button"
              onClick={() => {
                setShowMentions(!showMentions);
                setShowTopics(false);
                setMentionFilter('');
                inputRef.current?.focus();
              }}
              className={`p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                showMentions 
                  ? 'bg-indigo-600 border-indigo-600 text-white' 
                  : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200'
              }`}
              title="Mention a dad by full name (@)"
            >
              <AtSign size={18} />
            </button>

            {/* Quick # Topic Button */}
            <button
              type="button"
              onClick={() => {
                setShowTopics(!showTopics);
                setShowMentions(false);
                setTopicFilter('');
                inputRef.current?.focus();
              }}
              className={`p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                showTopics 
                  ? 'bg-emerald-600 border-emerald-600 text-white' 
                  : 'bg-white border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200'
              }`}
              title="Add a topic hashtag (#pistons, #parenting, #detroit)"
            >
              <Hash size={18} />
            </button>

            {/* Message Input Field */}
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message #${currentChannelTitle}... (type @ or #)`}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-sm cursor-pointer shrink-0"
              title="Send message"
            >
              {isSending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
