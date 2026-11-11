import { useState, useEffect, useRef, FormEvent, useMemo } from 'react';
import { User } from 'firebase/auth';
import Autocomplete from "react-google-autocomplete";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, arrayUnion, arrayRemove, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Session, Activity, Member, League, Message } from '../types';
import { deduplicateRoster } from '../lib/rosterSync';
import { formatGooglePlaceLocation, formatBacklogLocationForEvent, parseLocationDisplay, formatVenueAndAddress } from '../lib/locationUtils';
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  CalendarPlus, 
  Plus, 
  User as UserIcon, 
  XCircle, 
  MessageCircle, 
  Pencil, 
  Save, 
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  ExternalLink,
  Link as LinkIcon,
  Clock,
  Send,
  LayoutGrid,
  List as ListIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval,
  isToday,
  startOfToday,
  parseISO
} from 'date-fns';

function getDefaultEventDateTime() {
  const d = new Date();
  const day = d.getDay();
  const diff = (3 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return {
    date: `${year}-${month}-${date}`,
    time: '18:00'
  };
}

export default function CalendarView({ user, leagueId, sessions, onNavigateToChat }: { 
  user: User, 
  leagueId: string,
  sessions: Session[],
  onNavigateToChat: (threadId: string) => void
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Calendar Grid State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);
  const [eventsTab, setEventsTab] = useState<'upcoming' | 'my-rsvps' | 'past'>('upcoming');
  const [eventViewMode, setEventViewMode] = useState<'compact' | 'cards'>('compact');

  // Selected event to view full details + live chat thread modal
  const [selectedEventForModal, setSelectedEventForModal] = useState<Session | null>(null);
  const [modalInitialEdit, setModalInitialEdit] = useState(false);

  const defaultDT = getDefaultEventDateTime();
  const [eventName, setEventName] = useState('');
  const [activityType, setActivityType] = useState('Casual Hangout');
  const [hostId, setHostId] = useState(user.uid);
  const [eventDate, setEventDate] = useState(defaultDT.date);
  const [eventTime, setEventTime] = useState(defaultDT.time);
  const [venueName, setVenueName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [description, setDescription] = useState('');
  const [eventUrl, setEventUrl] = useState('');

  useEffect(() => {
    if (!user || !leagueId) return;

    const qA = query(
      collection(db, 'activities'), 
      where('leagueId', '==', leagueId)
    );
    const unsubscribeA = onSnapshot(qA, (snap) => {
      const acts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Activity));
      acts.sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
      setActivities(acts);
    }, (err) => {
      console.warn("Activities query warning in CalendarView:", err);
      // Fallback query if league query has filtering quirks
      const unsubsFallback = onSnapshot(collection(db, 'activities'), (fallbackSnap) => {
        const fallbackActs = fallbackSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Activity))
          .filter(a => a.leagueId === leagueId || !a.leagueId || a.leagueId === 'default-league');
        fallbackActs.sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
        setActivities(fallbackActs);
      }, (e) => console.warn("Fallback activities query warning:", e));
      return () => unsubsFallback();
    });

    let currentLeagueDoc: League | null = null;
    let rawMembersList: Member[] = [];

    const syncLeagueMembers = () => {
      const isBaseball = (currentLeagueDoc?.name || '').toLowerCase().includes('baseball');
      const filtered = rawMembersList.filter(m => {
        const isNate = m.userId.includes('nate') || 
                       (m.displayName || '').toLowerCase().includes('nate') || 
                       (m.email || '').toLowerCase().includes('nate');
        if (!isBaseball && isNate) return false;

        if (currentLeagueDoc?.memberIds && currentLeagueDoc.memberIds.length > 0) {
          return currentLeagueDoc.memberIds.includes(m.userId);
        }
        return Boolean(m.leagueIds && m.leagueIds.includes(leagueId));
      });
      const clean = deduplicateRoster(filtered);
      setMembers(clean);
    };

    const unsubscribeL = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      if (snap.exists()) {
        currentLeagueDoc = { id: snap.id, ...snap.data() } as League;
        syncLeagueMembers();
      }
    });

    const unsubscribeM = onSnapshot(collection(db, 'members'), (snap) => {
      rawMembersList = snap.docs.map(d => ({ ...d.data() } as Member));
      syncLeagueMembers();
    }, (err) => handleFirestoreError(err, OperationType.GET, 'members'));

    return () => {
      unsubscribeA();
      unsubscribeL();
      unsubscribeM();
    };
  }, [user, leagueId]);

  const handleCreateSession = async (e: FormEvent) => {
    e.preventDefault();
    if (!eventName.trim() || !eventDate || isCreating) return;

    setIsCreating(true);
    const host = members.find(m => m.userId === hostId);

    try {
      const combinedDate = new Date(`${eventDate}T${eventTime || '18:00'}`).toISOString();
      const combinedLocation = formatVenueAndAddress(venueName, locationAddress);
      const sessionData: any = {
        leagueId,
        date: combinedDate,
        activityName: eventName.trim(),
        activityType: activityType,
        location: combinedLocation,
        description,
        hostId,
        hostName: host?.displayName || 'Host',
        attendees: [hostId],
        declined: [],
        status: 'planned'
      };

      if (eventUrl.trim()) {
        sessionData.url = eventUrl.trim();
      }

      await addDoc(collection(db, 'sessions'), sessionData);

      const resetDT = getDefaultEventDateTime();
      setIsPlanning(false);
      setEventName('');
      setActivityType('Casual Hangout');
      setHostId(user.uid);
      setEventDate(resetDT.date);
      setEventTime(resetDT.time);
      setVenueName('');
      setLocationAddress('');
      setDescription('');
      setEventUrl('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sessions');
    } finally {
      setIsCreating(false);
    }
  };

  const getCalendarLink = (session: Session, activity?: Activity) => {
    const title = activity?.title || session.activityName || 'Dad League Meetup';
    const date = new Date(session.date);
    const start = date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const end = new Date(date.getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&details=${encodeURIComponent(activity?.description || '')}&location=${encodeURIComponent(session.location || '')}`;
  };

  const getMapsLink = (location: string) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  };

  const now = new Date();
  
  const colorMap: Record<string, string> = {
    'Active Sports & Exercise': 'emerald',
    'Games / Hobbies': 'purple',
    'Event (Game, Concert, etc.)': 'sky',
    'Casual Hangout': 'amber',
    'Helping Out': 'orange',
    'Food & Beverage': 'rose',
    'Trip / Travel': 'blue',
    'Other': 'indigo'
  };

  const sessionsOnDay = useMemo(() => {
    if (!selectedDay) return sessions;
    return sessions.filter(s => isSameDay(new Date(s.date), selectedDay));
  }, [sessions, selectedDay]);

  const upcomingSessions = (selectedDay ? sessionsOnDay : sessions).filter(s => new Date(s.date) >= now && s.status === 'planned');
  const pastSessions = (selectedDay ? sessionsOnDay : sessions).filter(s => (new Date(s.date) < now && s.status !== 'cancelled') || s.status === 'completed');
  const cancelledSessions = (selectedDay ? sessionsOnDay : sessions).filter(s => s.status === 'cancelled');

  const myUpcomingSessions = useMemo(() => {
    return upcomingSessions.filter(s => s.attendees.includes(user.uid));
  }, [upcomingSessions, user.uid]);

  const displayedSessions = useMemo(() => {
    if (eventsTab === 'upcoming') return upcomingSessions;
    if (eventsTab === 'my-rsvps') return myUpcomingSessions;
    if (eventsTab === 'past') return [...pastSessions, ...cancelledSessions];
    return upcomingSessions;
  }, [eventsTab, upcomingSessions, myUpcomingSessions, pastSessions, cancelledSessions]);

  const daysWithSessions = useMemo(() => {
    const map = new Map<string, string>(); // date -> dominant activity type
    sessions.forEach(s => {
      if (s.status !== 'cancelled') {
        const key = format(new Date(s.date), 'yyyy-MM-dd');
        if (!map.has(key)) {
          map.set(key, s.activityType || 'General');
        }
      }
    });
    return map;
  }, [sessions]);

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const dateFormat = "MMMM yyyy";
    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, "d");
        const cloneDay = day;
        const dateKey = format(day, 'yyyy-MM-dd');
        const activityType = daysWithSessions.get(dateKey);
        const hasSession = !!activityType;
        const isSel = selectedDay && isSameDay(day, selectedDay);
        const isCurrentMonth = isSameMonth(day, monthStart);
        const color = activityType ? (colorMap[activityType] || 'indigo') : 'slate';

        days.push(
          <div
            key={day.toString()}
            className={`relative h-14 md:h-20 border-t border-l border-slate-100 flex flex-col items-center justify-center cursor-pointer transition-all ${
              !isCurrentMonth ? 'bg-slate-50/50 text-slate-300' : 
              hasSession ? `bg-indigo-600/10 text-indigo-900` : 'bg-white text-slate-800'
            } ${isSel ? 'bg-indigo-600 text-white z-10 scale-105 shadow-md rounded-lg border-none' : 'hover:bg-indigo-50'}`}
            onClick={() => setSelectedDay(isSel ? null : cloneDay)}
          >
            <span className={`text-xs md:text-sm font-black ${isSel ? 'text-white' : isToday(day) ? 'text-indigo-600' : ''}`}>
              {formattedDate}
            </span>
            {hasSession && !isSel && (
              <div className="absolute top-2 right-2 flex gap-0.5">
                <div className={`w-1.5 h-1.5 bg-${color}-500 rounded-full shadow-sm animate-pulse`} />
              </div>
            )}
            {hasSession && !isSel && (
              <div className="mt-1 hidden md:block">
                 <div className={`px-2 py-0.5 bg-${color}-100 text-${color}-700 rounded-full text-[8px] font-black uppercase tracking-tighter truncate max-w-[80%] mx-auto`}>
                   {activityType}
                 </div>
              </div>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    // 7 days for the Week-at-a-Glance Strip (takes only ~48px of vertical height!)
    const today = new Date();
    const weekStripStart = startOfWeek(today, { weekStartsOn: 0 });
    const weekStripDays = Array.from({ length: 7 }, (_, i) => addDays(weekStripStart, i));

    return (
      <motion.div 
        layout
        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
      >
        <div className="p-2.5 sm:p-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
              className="p-1.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer"
              title="Toggle Full Month Calendar"
            >
              <CalendarIcon size={16} />
            </button>
            <div onClick={() => setIsCalendarExpanded(!isCalendarExpanded)} className="cursor-pointer flex items-center gap-1.5">
              <h3 className="text-xs sm:text-sm font-black text-slate-800 tracking-tight leading-none uppercase">
                {format(currentMonth, dateFormat)}
              </h3>
              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-wider hidden sm:inline">
                {isCalendarExpanded ? 'Collapse' : 'Week View'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
              className="px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all cursor-pointer"
            >
              {isCalendarExpanded ? 'Week Strip' : 'Full Month'}
            </button>

            <div className="flex gap-0.5">
              <button 
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
              >
                <ChevronLeft size={15} />
              </button>
              <button 
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* If collapsed: Sleek Week-at-a-Glance Strip (Low vertical footprint) */}
        {!isCalendarExpanded && (
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/40 divide-x divide-slate-100">
            {weekStripDays.map((d) => {
              const dateKey = format(d, 'yyyy-MM-dd');
              const activityType = daysWithSessions.get(dateKey);
              const hasSession = !!activityType;
              const isSel = selectedDay && isSameDay(d, selectedDay);
              const isCurrentDay = isToday(d);

              return (
                <div
                  key={d.toString()}
                  onClick={() => setSelectedDay(isSel ? null : d)}
                  className={`py-2 px-1 flex flex-col items-center justify-center cursor-pointer transition-all ${
                    isSel 
                      ? 'bg-indigo-600 text-white shadow-xs font-black' 
                      : isCurrentDay
                      ? 'bg-indigo-50/80 text-indigo-900 font-bold'
                      : 'hover:bg-slate-100/70 text-slate-700'
                  }`}
                  title={`${format(d, 'EEE, MMM d')}${hasSession ? ` (${activityType})` : ''}`}
                >
                  <span className={`text-[8px] uppercase tracking-wider font-bold ${isSel ? 'text-white/80' : 'text-slate-400'}`}>
                    {format(d, 'EEE').slice(0, 1)}
                  </span>
                  <span className={`text-xs sm:text-sm font-black ${isSel ? 'text-white' : isCurrentDay ? 'text-indigo-600' : ''}`}>
                    {format(d, 'd')}
                  </span>
                  <div className="h-1 mt-0.5 flex items-center justify-center">
                    {hasSession && (
                      <div className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-indigo-600'}`} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* If expanded: Full Month Grid */}
        <AnimatePresence>
          {isCalendarExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-7 bg-slate-50/50 border-b border-slate-100">
                {weekDays.map((d, i) => (
                  <div key={`${d}-${i}`} className="py-2 text-center text-[8px] font-black uppercase text-slate-400 tracking-widest">
                    {d}
                  </div>
                ))}
              </div>
              <div className="border-r border-b border-slate-100">
                {rows}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="fixed bottom-24 right-6 md:right-12 z-40">
        <div className="flex flex-col gap-3">
          {selectedDay && (
            <button 
              onClick={() => setSelectedDay(null)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all border border-slate-200 shadow-xl"
            >
              <Filter size={14} />
              Clear Filter
            </button>
          )}
          <button 
            onClick={() => setIsPlanning(true)}
            className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center hover:bg-indigo-700 shadow-2xl active:scale-95 shadow-indigo-200 transition-all border-4 border-white"
          >
            <CalendarPlus size={24} />
          </button>
        </div>
      </div>

      {!isPlanning && renderCalendar()}

      <AnimatePresence>
        {isPlanning && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="p-6 bg-white rounded-xl border border-slate-200 shadow-2xl space-y-6"
          >
            <h3 className="font-bold text-xl tracking-tight text-slate-800 uppercase">Plan a Session</h3>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Select from Backlog (Optional)</label>
              <select 
                onChange={(e) => {
                  const activity = activities.find(a => a.id === e.target.value);
                  if (activity) {
                    setEventName(activity.title);
                    setActivityType(activity.category || 'Casual Hangout');
                    const formattedLoc = formatBacklogLocationForEvent(activity.location, activity.title);
                    const parsed = parseLocationDisplay(formattedLoc);
                    setVenueName(parsed.venueName || (parsed.hasVenue ? parsed.fullLocation : ''));
                    setLocationAddress(parsed.address || (!parsed.hasVenue ? parsed.fullLocation : ''));
                    if (activity.description) setDescription(activity.description);
                  }
                }}
                className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-900 italic shadow-inner cursor-pointer"
              >
                <option value="">-- Choose an idea from backlog --</option>
                {activities.map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Event Name</label>
                  <input 
                    value={eventName}
                    onChange={e => setEventName(e.target.value)}
                    placeholder="e.g. Weekly Meetup"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Activity Type</label>
                  <select 
                    value={activityType}
                    onChange={e => setActivityType(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Host</label>
                  <select 
                    value={hostId}
                    onChange={e => setHostId(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                  >
                    {members.map(m => (
                      <option key={m.userId} value={m.userId}>{m.displayName}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 flex items-center gap-1">
                    <CalendarIcon size={12} className="text-indigo-500" /> Event Date
                  </label>
                  <input 
                    type="date"
                    value={eventDate}
                    onChange={e => setEventDate(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 flex items-center gap-1">
                    <Clock size={12} className="text-indigo-500" /> Start Time
                  </label>
                  <input 
                    type="time"
                    value={eventTime}
                    onChange={e => setEventTime(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 flex items-center justify-between">
                    <span>Place / Venue Name</span>
                    <span className="text-indigo-600 font-bold lowercase">shown prominently</span>
                  </label>
                  <input
                    value={venueName}
                    onChange={e => setVenueName(e.target.value)}
                    placeholder="e.g. HopCat, Topgolf, Comerica Park"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">
                    Address / Maps Search
                  </label>
                  <Autocomplete
                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                    onPlaceSelected={(place: any) => {
                      const name = typeof place.name === 'string' ? place.name.trim() : '';
                      const addr = typeof place.formatted_address === 'string' ? place.formatted_address.trim() : '';
                      if (name && !/^\d+$/.test(name)) {
                        setVenueName(name);
                      }
                      setLocationAddress(addr || name);
                    }}
                    value={locationAddress}
                    onChange={(e: any) => setLocationAddress(e.target.value)}
                    options={{
                      types: ["geocode", "establishment"],
                    }}
                    placeholder="e.g. 4200 Woodward Ave or search establishment"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 flex items-center gap-1">
                  <LinkIcon size={12} className="text-indigo-500" /> Event URL / Link (Optional)
                </label>
                <input 
                  type="url"
                  value={eventUrl}
                  onChange={e => setEventUrl(e.target.value)}
                  placeholder="https://... (tickets, venue site, reservation)"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Details / Why we should do it</label>
                <textarea 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Plan for three loops around the island... Bring water bottles and lights!"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[120px] shadow-inner leading-relaxed"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsPlanning(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-widest text-[10px]"
                >
                  {isCreating ? (
                    <>
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      Creating...
                    </>
                  ) : (
                    'Create Event'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Segmented Events Toolbar: Tabs + View Mode (Compact vs Cards) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 sm:p-2.5 shadow-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Segmented Sub-Navigation */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setEventsTab('upcoming')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all cursor-pointer ${
                eventsTab === 'upcoming' 
                  ? 'bg-white text-indigo-900 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Upcoming</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                eventsTab === 'upcoming' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {upcomingSessions.length}
              </span>
            </button>

            <button
              onClick={() => setEventsTab('my-rsvps')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all cursor-pointer ${
                eventsTab === 'my-rsvps' 
                  ? 'bg-white text-indigo-900 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>My RSVPs</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                eventsTab === 'my-rsvps' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {myUpcomingSessions.length}
              </span>
            </button>

            <button
              onClick={() => setEventsTab('past')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all cursor-pointer ${
                eventsTab === 'past' 
                  ? 'bg-white text-indigo-900 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Past</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                eventsTab === 'past' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {pastSessions.length}
              </span>
            </button>
          </div>

          {/* Density Toggle: Compact List vs Cards */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setEventViewMode(eventViewMode === 'compact' ? 'cards' : 'compact')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              title={eventViewMode === 'compact' ? 'Switch to detailed cards' : 'Switch to compact list (less scrolling)'}
            >
              {eventViewMode === 'compact' ? (
                <>
                  <LayoutGrid size={13} className="text-indigo-600" />
                  <span className="hidden sm:inline">Cards</span>
                </>
              ) : (
                <>
                  <ListIcon size={13} className="text-indigo-600" />
                  <span className="hidden sm:inline">Compact List</span>
                  <span className="sm:hidden">Compact</span>
                </>
              )}
            </button>

            <button
              onClick={() => setIsPlanning(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-tight hover:bg-indigo-700 transition-all cursor-pointer shadow-xs"
            >
              <Plus size={13} />
              <span>New Event</span>
            </button>
          </div>
        </div>

        {/* Selected Day Filter Banner */}
        {selectedDay && (
          <div className="flex items-center justify-between text-xs bg-indigo-50/80 border border-indigo-200/60 rounded-xl px-3 py-1.5 text-indigo-900 font-medium">
            <span>Filtered by: <strong className="font-black">{format(selectedDay, 'EEEE, MMM d')}</strong></span>
            <button 
              onClick={() => setSelectedDay(null)}
              className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-800 underline ml-2 cursor-pointer"
            >
              Show All Days
            </button>
          </div>
        )}
      </div>

      {/* Events List */}
      <div className={eventViewMode === 'compact' ? 'space-y-1.5' : 'space-y-3'}>
        {displayedSessions.length === 0 ? (
          <div className="text-center py-10 sm:py-14 bg-white rounded-2xl border border-slate-200 shadow-xs border-dashed px-4">
            <CalendarIcon size={32} className="mx-auto text-slate-300 mb-2" />
            <h4 className="text-slate-800 font-bold text-sm">
              {eventsTab === 'upcoming' 
                ? (selectedDay ? 'No events planned for this day' : 'No upcoming events') 
                : eventsTab === 'my-rsvps'
                ? "You haven't RSVP'd 'In' to any upcoming events yet"
                : 'No past events'}
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              {eventsTab === 'upcoming' 
                ? 'Suggest an idea in the Ideas tab or tap below to schedule a hangout!'
                : eventsTab === 'my-rsvps'
                ? 'Tap "I\'m In" on any upcoming event to mark your attendance.'
                : 'Completed events will appear here once past.'}
            </p>
            {eventsTab === 'upcoming' && (
              <button
                onClick={() => setIsPlanning(true)}
                className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
              >
                Plan An Event
              </button>
            )}
          </div>
        ) : (
          displayedSessions.map(session => {
            if (eventViewMode === 'compact') {
              return (
                <CompactSessionRow
                  key={session.id}
                  session={session}
                  user={user}
                  members={members}
                  onSelectEvent={() => {
                    setSelectedEventForModal(session);
                    setModalInitialEdit(false);
                  }}
                  onEditEvent={() => {
                    setSelectedEventForModal(session);
                    setModalInitialEdit(true);
                  }}
                />
              );
            }

            return (
              <SessionCard 
                key={session.id} 
                session={session} 
                activities={activities} 
                getCalendarLink={getCalendarLink} 
                getMapsLink={getMapsLink}
                members={members}
                currentUser={user}
                onChatClick={() => onNavigateToChat(session.id)}
                onSelectEvent={() => {
                  setSelectedEventForModal(session);
                  setModalInitialEdit(false);
                }}
                onEditEvent={() => {
                  setSelectedEventForModal(session);
                  setModalInitialEdit(true);
                }}
              />
            );
          })
        )}
      </div>

      {/* Event Details + Chat Thread Modal */}
      <AnimatePresence>
        {selectedEventForModal && (
          <EventDetailsAndChatModal
            session={sessions.find(s => s.id === selectedEventForModal.id) || selectedEventForModal}
            user={user}
            members={members}
            initialEditMode={modalInitialEdit}
            onClose={() => {
              setSelectedEventForModal(null);
              setModalInitialEdit(false);
            }}
            onNavigateToChat={onNavigateToChat}
            getMapsLink={getMapsLink}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Compact row for glanceable, high-density mobile view
function CompactSessionRow({ 
  session, 
  user, 
  members, 
  onSelectEvent,
  onEditEvent
}: { 
  session: Session, 
  user: User, 
  members: Member[], 
  onSelectEvent: () => void,
  onEditEvent: () => void
}) {
  const date = new Date(session.date);
  const isGoing = session.attendees.includes(user.uid);
  const isDeclined = session.declined?.includes(user.uid);
  const locInfo = parseLocationDisplay(session.location);

  const handleRSVP = async (going: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (session.status === 'cancelled') return;
    const docRef = doc(db, 'sessions', session.id);
    if (going) {
      await updateDoc(docRef, {
        attendees: arrayUnion(user.uid),
        declined: arrayRemove(user.uid)
      });
    } else {
      await updateDoc(docRef, {
        attendees: arrayRemove(user.uid),
        declined: arrayUnion(user.uid)
      });
    }
  };

  return (
    <motion.div
      layout
      onClick={onSelectEvent}
      className={`p-2.5 sm:p-3 bg-white rounded-2xl border transition-all cursor-pointer flex items-center gap-2.5 group hover:border-indigo-300 shadow-xs ${
        session.status === 'cancelled' ? 'opacity-60 bg-slate-50' : ''
      }`}
    >
      {/* Date mini-badge */}
      <div className={`w-11 h-11 rounded-xl border flex flex-col items-center justify-center font-black leading-none shrink-0 transition-colors ${
        session.status === 'cancelled'
          ? 'bg-slate-100 text-slate-400 border-slate-200'
          : isGoing
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-indigo-50 text-indigo-900 border-indigo-100/80 group-hover:bg-indigo-600 group-hover:text-white'
      }`}>
        <span className="text-[8px] uppercase tracking-tighter opacity-70">
          {date.toLocaleDateString('en-US', { month: 'short' })}
        </span>
        <span className="text-base tracking-tight font-black">
          {date.getDate()}
        </span>
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h4 className="font-black text-xs sm:text-sm text-slate-900 tracking-tight truncate group-hover:text-indigo-600 transition-colors">
            {session.activityName}
          </h4>
          {session.status === 'cancelled' && (
            <span className="text-[8px] font-black uppercase bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded-md shrink-0">
              Cancelled
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium truncate mt-0.5">
          <span className="text-slate-600 font-bold">
            {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
          {locInfo.fullLocation && (
            <span className="truncate max-w-[130px] sm:max-w-[200px] text-slate-700">
              • <strong className="font-bold text-slate-900">{locInfo.venueName || locInfo.address}</strong>
              {locInfo.venueName && locInfo.address && (
                <span className="text-slate-400 font-normal ml-1 hidden md:inline">({locInfo.address})</span>
              )}
            </span>
          )}
          <span>• {session.attendees.length} in</span>
          <span className="hidden sm:inline">• Host: {session.hostName}</span>
        </div>
      </div>

      {/* Quick RSVP Pill, Edit, & Chat Details */}
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        <button
          disabled={session.status === 'cancelled'}
          onClick={(e) => handleRSVP(!isGoing, e)}
          className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
            isGoing 
              ? 'bg-emerald-600 text-white shadow-xs' 
              : isDeclined 
              ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' 
              : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={isGoing ? 'Click to change RSVP' : 'RSVP to this event'}
        >
          {isGoing ? '✓ In' : isDeclined ? '✕ Out' : '+ RSVP'}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onEditEvent();
          }}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
          title="Edit Event"
        >
          <Pencil size={13} />
        </button>

        <button
          onClick={onSelectEvent}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
          title="View Details & Chat"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </motion.div>
  );
}

function SessionCard({ session, activities, getCalendarLink, getMapsLink, members, currentUser, onChatClick, onSelectEvent, onEditEvent }: { 
  session: Session, 
  activities: Activity[], 
  getCalendarLink: (s: Session, a?: Activity) => string,
  getMapsLink: (l: string) => string,
  members: Member[],
  currentUser: User,
  onChatClick: () => void,
  onSelectEvent: () => void,
  onEditEvent?: () => void,
  key?: any
}) {
  const activity = activities.find(a => a.id === session.activityId);
  const date = new Date(session.date);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Edit state with separated date & time and url
  const sessionDateObj = new Date(session.date);
  const initialDateStr = !isNaN(sessionDateObj.getTime()) ? sessionDateObj.toISOString().slice(0, 10) : '';
  const initialTimeStr = !isNaN(sessionDateObj.getTime()) ? sessionDateObj.toTimeString().slice(0, 5) : '18:00';

  const [editName, setEditName] = useState(session.activityName);
  const [editType, setEditType] = useState(session.activityType || 'Casual Hangout');
  const [editDatePart, setEditDatePart] = useState(initialDateStr);
  const [editTimePart, setEditTimePart] = useState(initialTimeStr);
  const [editLocation, setEditLocation] = useState(session.location || '');
  const [editDescription, setEditDescription] = useState(session.description || '');
  const [editUrl, setEditUrl] = useState(session.url || '');

  const handleRSVP = async (going: boolean) => {
    if (session.status === 'cancelled') return;
    const docRef = doc(db, 'sessions', session.id);
    if (going) {
      await updateDoc(docRef, {
        attendees: arrayUnion(currentUser.uid),
        declined: arrayRemove(currentUser.uid)
      });
    } else {
      await updateDoc(docRef, {
        attendees: arrayRemove(currentUser.uid),
        declined: arrayUnion(currentUser.uid)
      });
    }
  };

  const handleCancel = async () => {
    const docRef = doc(db, 'sessions', session.id);
    await updateDoc(docRef, { status: 'cancelled' });
    setShowCancelConfirm(false);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    const docRef = doc(db, 'sessions', session.id);
    
    try {
      const combined = new Date(`${editDatePart}T${editTimePart || '18:00'}`).toISOString();
      await updateDoc(docRef, {
        activityName: editName,
        activityType: editType,
        date: combined,
        location: editLocation,
        description: editDescription,
        url: editUrl.trim() || null,
        updatedAt: serverTimestamp()
      });
      
      setIsEditing(false);
    } catch (err) {
      console.error("Error updating session:", err);
    }
  };

  const isGoing = session.attendees.includes(currentUser.uid);
  const isDeclined = session.declined?.includes(currentUser.uid);
  const isHost = session.hostId === currentUser.uid;

  const getMemberData = (uid: string) => members.find(m => m.userId === uid);

  return (
    <motion.div 
      layout
      className={`group relative bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-6 hover:border-indigo-400 transition-all ${session.status === 'cancelled' ? 'opacity-60 grayscale' : ''} ${isEditing ? 'ring-2 ring-indigo-500 ring-offset-2 border-transparent' : ''}`}
    >
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.form 
            key="edit-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onSubmit={handleUpdate} 
            className="space-y-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <Pencil size={20} />
              </div>
              <div>
                <h3 className="font-black text-xl uppercase tracking-tight text-slate-900">Edit Event</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adjust details</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Event Name</label>
                <input 
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Activity Type</label>
                <select 
                  value={editType}
                  onChange={e => setEditType(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 flex items-center gap-1">
                  <CalendarIcon size={12} className="text-indigo-500" /> Date
                </label>
                <input 
                  type="date"
                  value={editDatePart}
                  onChange={e => setEditDatePart(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 flex items-center gap-1">
                  <Clock size={12} className="text-indigo-500" /> Time
                </label>
                <input 
                  type="time"
                  value={editTimePart}
                  onChange={e => setEditTimePart(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Location</label>
                <Autocomplete
                   apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                   onPlaceSelected={(place) => {
                     setEditLocation(formatGooglePlaceLocation(place));
                   }}
                   value={editLocation}
                   onChange={(e: any) => setEditLocation(e.target.value)}
                   options={{
                     types: ["geocode", "establishment"],
                   }}
                   placeholder="e.g. Pine Valley Golf Club"
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2 flex items-center gap-1">
                  <LinkIcon size={12} className="text-indigo-500" /> Event URL / Website (Optional)
                </label>
                <input 
                  type="url"
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  placeholder="https://... (tickets, venue, info)"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Details</label>
              <textarea 
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 uppercase tracking-widest text-[10px] cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] cursor-pointer"
              >
                <Save size={14} />
                Save Changes
              </button>
            </div>
          </motion.form>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            <div 
              onClick={onSelectEvent}
              className={`p-4 rounded-xl flex flex-col items-center justify-center min-w-[80px] border shadow-inner h-fit cursor-pointer hover:scale-105 transition-transform ${session.status === 'cancelled' ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}
              title="Click to view event details and chat"
            >
              <span className="text-[10px] font-black uppercase opacity-60">
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </span>
              <span className="text-3xl font-black italic tracking-tighter">
                {date.getDate()}
              </span>
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    {session.activityType || 'Active'}
                  </span>
                  <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    session.status === 'cancelled' 
                    ? 'bg-rose-100 text-rose-700' 
                    : isGoing ? 'bg-emerald-100 text-emerald-700' : isDeclined ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {session.status === 'cancelled' ? 'Cancelled' : isGoing ? 'Going' : isDeclined ? 'Not Going' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {session.status !== 'cancelled' && (
                    <>
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                        title="Edit Event"
                      >
                        <Pencil size={18} />
                      </button>
                      <div className="relative">
                        <button 
                          onClick={() => setShowCancelConfirm(!showCancelConfirm)}
                          className={`p-2 rounded-lg transition-all cursor-pointer ${showCancelConfirm ? 'bg-rose-100 text-rose-600' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}
                          title="Cancel Event"
                        >
                          <XCircle size={18} />
                        </button>
                        <AnimatePresence>
                          {showCancelConfirm && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: 10 }}
                              className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-64"
                            >
                              <p className="text-xs font-bold text-slate-700 mb-3 text-center">Are you sure you want to cancel this event?</p>
                              <div className="flex gap-2">
                                <button 
                                  onClick={handleCancel}
                                  className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-colors"
                                >
                                  Yes, Cancel
                                </button>
                                <button 
                                  onClick={() => setShowCancelConfirm(false)}
                                  className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
                                >
                                  Back
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </>
                  )}
                  <a 
                    href={getCalendarLink(session, activity)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Add to Google Calendar"
                  >
                    <CalendarPlus size={18} />
                  </a>
                </div>
              </div>
              
              <h3 
                onClick={onSelectEvent} 
                className="text-2xl sm:text-3xl font-black tracking-tight text-slate-800 leading-tight hover:text-indigo-600 transition-colors cursor-pointer"
                title="Click to view details and chat"
              >
                {session.activityName}
              </h3>

              <div className="flex flex-wrap items-center gap-3 text-slate-500 text-sm font-medium">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg border border-slate-100">
                  <UserIcon size={14} className="text-indigo-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Host:</span>
                  <span className="text-slate-700">{session.hostName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock size={15} className="text-indigo-500" />
                  {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
                {session.location && (() => {
                  const loc = parseLocationDisplay(session.location);
                  return (
                    <a 
                      href={getMapsLink(session.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100"
                    >
                      <MapPin size={14} className="text-indigo-500 shrink-0" />
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-slate-900 text-xs leading-tight">
                          {loc.venueName || loc.address}
                        </span>
                        {loc.venueName && loc.address && (
                          <span className="text-[10px] text-slate-500 font-normal leading-tight truncate max-w-[200px]">
                            {loc.address}
                          </span>
                        )}
                      </div>
                    </a>
                  );
                })()}
                {session.url && (
                  <a 
                    href={session.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 hover:bg-indigo-100 px-2.5 py-0.5 rounded-lg border border-indigo-200 transition-colors"
                    title="Open event website or ticket link"
                  >
                    <ExternalLink size={13} />
                    <span>Event Link</span>
                  </a>
                )}
              </div>
              {session.description && (
                <p className="text-slate-600 text-sm leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-slate-100 italic">
                  "{session.description}"
                </p>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      {!isEditing && (
        <div className="mt-8 pt-6 border-t border-slate-100 space-y-6">
          <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div className="space-y-4 flex-1">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Going</span>
                  <span className="h-px bg-emerald-100 flex-1"></span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {session.attendees.map(uid => {
                    const m = getMemberData(uid);
                    return (
                      <div key={uid} className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                        <img src={m?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`} className="w-5 h-5 rounded-full" alt="" />
                        <span className="text-[10px] font-bold text-emerald-700 truncate max-w-[80px]">{m?.displayName || 'User'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {session.declined && session.declined.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-rose-400 tracking-widest">Not Going</span>
                    <span className="h-px bg-rose-100 flex-1"></span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {session.declined.map(uid => {
                      const m = getMemberData(uid);
                      return (
                        <div key={uid} className="flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-100 opacity-60">
                          <img src={m?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`} className="w-5 h-5 rounded-full grayscale" alt="" />
                          <span className="text-[10px] font-bold text-rose-700 truncate max-w-[80px]">{m?.displayName || 'User'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Event Details + Chat Thread Button */}
              <button 
                onClick={onSelectEvent}
                className="flex items-center gap-1.5 px-4 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-2xl font-black text-xs uppercase tracking-wider transition-colors cursor-pointer border border-indigo-200"
                title="View event details and open live chat discussion"
              >
                <MessageCircle size={16} />
                Details & Chat
              </button>

              <button 
                disabled={session.status === 'cancelled'}
                onClick={() => handleRSVP(true)}
                className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer ${
                  isGoing 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' 
                  : 'bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 border border-transparent'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                I'm In
              </button>
              <button 
                disabled={session.status === 'cancelled'}
                onClick={() => handleRSVP(false)}
                className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer ${
                  isDeclined 
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-100' 
                  : 'bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600 border border-transparent'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Can't Make It
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Embedded Event Details, In-Place Editing & Live Chat Thread Modal (Non-scrolling viewport design)
function EventDetailsAndChatModal({
  session,
  user,
  members,
  initialEditMode = false,
  onClose,
  onNavigateToChat,
  getMapsLink
}: {
  session: Session;
  user: User;
  members: Member[];
  initialEditMode?: boolean;
  onClose: () => void;
  onNavigateToChat: (threadId: string) => void;
  getMapsLink: (loc: string) => string;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'chat'>('details');
  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isUpdatingRSVP, setIsUpdatingRSVP] = useState(false);

  // Parse location into Venue Name vs Street Address
  const locInfo = parseLocationDisplay(session.location);

  // Edit form state
  const sessionDateObj = new Date(session.date);
  const initialDateStr = !isNaN(sessionDateObj.getTime()) ? sessionDateObj.toISOString().slice(0, 10) : '';
  const initialTimeStr = !isNaN(sessionDateObj.getTime()) ? sessionDateObj.toTimeString().slice(0, 5) : '18:00';

  const [editName, setEditName] = useState(session.activityName);
  const [editType, setEditType] = useState(session.activityType || 'Casual Hangout');
  const [editHostId, setEditHostId] = useState(session.hostId || user.uid);
  const [editDatePart, setEditDatePart] = useState(initialDateStr);
  const [editTimePart, setEditTimePart] = useState(initialTimeStr);
  const [editVenueName, setEditVenueName] = useState(locInfo.venueName);
  const [editAddress, setEditAddress] = useState(locInfo.address || (!locInfo.hasVenue ? locInfo.fullLocation : ''));
  const [editDescription, setEditDescription] = useState(session.description || '');
  const [editUrl, setEditUrl] = useState(session.url || '');

  // Live Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session.id) return;
    const unsubscribe = onSnapshot(collection(db, 'messages'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      const threadMsgs = all.filter(m => m.threadId === session.id);
      threadMsgs.sort((a, b) => {
        const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return tA - tB;
      });
      setMessages(threadMsgs);
    });
    return () => unsubscribe();
  }, [session.id]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        leagueId: session.leagueId,
        senderId: user.uid,
        senderName: user.displayName || 'Dad',
        text: trimmed,
        threadId: session.id,
        createdAt: serverTimestamp()
      });
      setInputText('');
    } catch (err) {
      console.error("Error sending event chat message:", err);
    } finally {
      setIsSending(false);
    }
  };

  const isGoing = session.attendees.includes(user.uid);
  const isDeclined = session.declined?.includes(user.uid);

  const handleRSVP = async (going: boolean) => {
    if (session.status === 'cancelled' || isUpdatingRSVP) return;
    setIsUpdatingRSVP(true);
    try {
      const docRef = doc(db, 'sessions', session.id);
      if (going) {
        await updateDoc(docRef, {
          attendees: arrayUnion(user.uid),
          declined: arrayRemove(user.uid)
        });
      } else {
        await updateDoc(docRef, {
          attendees: arrayRemove(user.uid),
          declined: arrayUnion(user.uid)
        });
      }
    } catch (err) {
      console.error("RSVP update error:", err);
    } finally {
      setIsUpdatingRSVP(false);
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editDatePart || isSavingEdit) return;

    setIsSavingEdit(true);
    try {
      const hostMember = members.find(m => m.userId === editHostId);
      const combinedDate = new Date(`${editDatePart}T${editTimePart || '18:00'}`).toISOString();
      const combinedLocation = formatVenueAndAddress(editVenueName, editAddress);

      const docRef = doc(db, 'sessions', session.id);
      await updateDoc(docRef, {
        activityName: editName.trim(),
        activityType: editType,
        hostId: editHostId,
        hostName: hostMember?.displayName || session.hostName || 'Host',
        date: combinedDate,
        location: combinedLocation,
        url: editUrl.trim() || null,
        description: editDescription.trim(),
        updatedAt: serverTimestamp()
      });

      setIsEditing(false);
    } catch (err) {
      console.error("Error saving event changes:", err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCancelSession = async () => {
    try {
      const docRef = doc(db, 'sessions', session.id);
      await updateDoc(docRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });
      setShowCancelConfirm(false);
      setIsEditing(false);
    } catch (err) {
      console.error("Error cancelling session:", err);
    }
  };

  const date = new Date(session.date);
  const formattedCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(session.activityName)}&dates=${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${new Date(date.getTime() + 2 * 3600000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z&details=${encodeURIComponent(session.description || '')}&location=${encodeURIComponent(session.location || '')}`;

  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const getMemberData = (uid: string) => members.find(m => m.userId === uid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col h-[88vh] max-h-[640px]"
      >
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
              📅
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase text-indigo-600 tracking-wider">
                  {session.activityType || 'Meetup'}
                </span>
                {session.status === 'cancelled' && (
                  <span className="text-[8px] font-black uppercase bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded-md">
                    Cancelled
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight truncate">
                {session.activityName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-slate-200 shadow-2xs cursor-pointer"
                title="Edit event details"
              >
                <Pencil size={13} />
                <span>Edit</span>
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Back
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Immediate RSVP Bar (Directly below header - change RSVP without scrolling) */}
        {!isEditing && (
          <div className="bg-slate-50/90 border-b border-slate-200/80 px-3.5 sm:px-4 py-2 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider shrink-0">Your RSVP:</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider truncate ${
                isGoing 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : isDeclined 
                  ? 'bg-rose-100 text-rose-700' 
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {isGoing ? "✓ You're In" : isDeclined ? "✕ Can't Make It" : "⏳ Pending"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                disabled={session.status === 'cancelled' || isUpdatingRSVP}
                onClick={() => handleRSVP(true)}
                className={`px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                  isGoing 
                    ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300' 
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <span>✓</span> I'm In
              </button>
              <button
                disabled={session.status === 'cancelled' || isUpdatingRSVP}
                onClick={() => handleRSVP(false)}
                className={`px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                  isDeclined 
                    ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-300' 
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <span>✕</span> Can't Make It
              </button>
            </div>
          </div>
        )}

        {/* Tab Switcher (Details vs Live Chat) */}
        {!isEditing && (
          <div className="flex border-b border-slate-200 bg-white shrink-0 px-2">
            <button
              onClick={() => setActiveTab('details')}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'details'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <CalendarIcon size={14} />
              <span>Event Details</span>
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'chat'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <MessageCircle size={14} />
              <span>Discussion ({messages.length})</span>
            </button>
          </div>
        )}

        {/* Body Container */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* 1. EDIT MODE */}
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 custom-scrollbar">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Edit Event Information</span>
                {session.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(!showCancelConfirm)}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-800 uppercase tracking-wider cursor-pointer"
                  >
                    Cancel Event
                  </button>
                )}
              </div>

              {showCancelConfirm && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-rose-800">Are you sure you want to cancel this event for the group?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCancelSession}
                      className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-rose-700"
                    >
                      Yes, Cancel Event
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider"
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Event Name</label>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Activity Type</label>
                  <select
                    value={editType}
                    onChange={e => setEditType(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Host</label>
                  <select
                    value={editHostId}
                    onChange={e => setEditHostId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {members.map(m => (
                      <option key={m.userId} value={m.userId}>{m.displayName}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Date</label>
                  <input
                    type="date"
                    value={editDatePart}
                    onChange={e => setEditDatePart(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Time</label>
                  <input
                    type="time"
                    value={editTimePart}
                    onChange={e => setEditTimePart(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Location: Place Name + Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1 flex items-center justify-between">
                    <span>Place / Venue Name</span>
                    <span className="text-indigo-600 font-bold lowercase">headline</span>
                  </label>
                  <input
                    value={editVenueName}
                    onChange={e => setEditVenueName(e.target.value)}
                    placeholder="e.g. HopCat, Topgolf, Ford Field"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">
                    Address / Maps
                  </label>
                  <Autocomplete
                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                    onPlaceSelected={(place: any) => {
                      const name = typeof place.name === 'string' ? place.name.trim() : '';
                      const addr = typeof place.formatted_address === 'string' ? place.formatted_address.trim() : '';
                      if (name && !/^\d+$/.test(name)) {
                        setEditVenueName(name);
                      }
                      setEditAddress(addr || name);
                    }}
                    value={editAddress}
                    onChange={(e: any) => setEditAddress(e.target.value)}
                    options={{
                      types: ["geocode", "establishment"],
                    }}
                    placeholder="Search address or venue"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1 flex items-center gap-1">
                  <LinkIcon size={12} className="text-indigo-500" /> Event Link / Website (Optional)
                </label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  placeholder="https://... (tickets, venue info)"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Details & Notes</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="Event details..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[70px]"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Save size={13} />
                  <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          ) : activeTab === 'details' ? (
            /* 2. NON-SCROLLING DETAILS VIEW (Fits within ~350px viewport height!) */
            <div className="p-3.5 sm:p-5 space-y-3.5 flex flex-col justify-between h-full overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {/* Date & Time Row */}
                <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 sm:p-3 rounded-2xl border border-slate-200/70">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-800 font-bold min-w-0">
                    <CalendarIcon size={15} className="text-indigo-600 shrink-0" />
                    <span className="truncate">
                      {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-slate-300">•</span>
                    <Clock size={15} className="text-indigo-600 shrink-0" />
                    <span>
                      {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>

                  <a
                    href={formattedCalendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-tight shrink-0 transition-colors"
                    title="Add to Google Calendar"
                  >
                    <CalendarPlus size={12} />
                    <span>Calendar</span>
                  </a>
                </div>

                {/* Venue Name & Location Card (Prominently displays the Place Name!) */}
                {session.location && (() => {
                  return (
                    <div className="flex items-start gap-2.5 bg-indigo-50/50 p-2.5 sm:p-3 rounded-2xl border border-indigo-100/80">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                        <MapPin size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] font-black uppercase text-indigo-700 tracking-wider">Venue / Place</span>
                          <a
                            href={getMapsLink(session.location)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 shrink-0"
                          >
                            Maps ↗
                          </a>
                        </div>
                        <div className="text-sm font-black text-slate-900 leading-tight mt-0.5">
                          {locInfo.venueName || locInfo.address}
                        </div>
                        {locInfo.venueName && locInfo.address && (
                          <div className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5 truncate">
                            {locInfo.address}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Host & External URL row */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 font-bold">
                    <UserIcon size={12} className="text-indigo-600" />
                    <span>Host: {session.hostName}</span>
                  </div>

                  {session.url && (
                    <a
                      href={session.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg border border-indigo-200 transition-colors truncate max-w-[220px]"
                    >
                      <ExternalLink size={12} className="shrink-0" />
                      <span className="truncate">Event Website / Tickets</span>
                    </a>
                  )}
                </div>

                {/* Attendees Roster Strip */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <span>Who's In ({session.attendees.length})</span>
                    {session.declined && session.declined.length > 0 && (
                      <span>{session.declined.length} Declined</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {session.attendees.map(uid => {
                      const m = getMemberData(uid);
                      return (
                        <div key={uid} className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                          <img
                            src={m?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`}
                            className="w-4 h-4 rounded-full object-cover"
                            alt=""
                          />
                          <span className="text-[10px] font-bold text-emerald-800 truncate max-w-[90px]">
                            {m?.displayName || (uid === user.uid ? 'You' : 'Member')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Description Quote (if provided) */}
                {session.description && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 leading-relaxed italic line-clamp-2">
                    "{session.description}"
                  </p>
                )}
              </div>

              {/* Bottom Quick Jump to Chat Strip */}
              <div 
                onClick={() => setActiveTab('chat')}
                className="bg-indigo-50/70 hover:bg-indigo-100/70 border border-indigo-200/70 rounded-2xl p-2.5 flex items-center justify-between cursor-pointer transition-colors shrink-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageCircle size={15} className="text-indigo-600 shrink-0" />
                  <span className="text-xs text-slate-700 truncate font-medium">
                    {latestMessage 
                      ? `${latestMessage.senderName}: "${latestMessage.text}"` 
                      : 'No chat messages yet. Tap to start thread!'}
                  </span>
                </div>
                <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider shrink-0 ml-2">
                  Chat ({messages.length}) &rarr;
                </span>
              </div>
            </div>
          ) : (
            /* 3. LIVE CHAT TAB */
            <div className="flex-1 flex flex-col min-h-0 p-3 sm:p-4 space-y-2.5">
              <div className="flex-1 overflow-y-auto bg-slate-50 rounded-2xl border border-slate-200 p-3 space-y-2.5 custom-scrollbar min-h-0">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4">
                    <MessageCircle size={24} className="text-slate-300 mb-1" />
                    <p className="text-xs font-bold">No messages in this event chat yet.</p>
                    <p className="text-[11px] text-slate-400">Coordinate rides, timing, tickets, or prep with the guys!</p>
                  </div>
                ) : (
                  messages.map(m => {
                    const isMine = m.senderId === user.uid;
                    return (
                      <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-xs ${
                          isMine ? 'bg-indigo-600 text-white rounded-br-xs' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                        }`}>
                          {!isMine && <div className="font-black text-[10px] text-indigo-600 mb-0.5">{m.senderName}</div>}
                          <div>{m.text}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Message Input Box */}
              <form onSubmit={handleSendMessage} className="flex gap-2 shrink-0">
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="Message the event thread..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
                  className="px-3.5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <Send size={13} />
                  <span>Send</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
