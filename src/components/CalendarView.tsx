import { useState, useEffect, FormEvent, useMemo } from 'react';
import { User } from 'firebase/auth';
import Autocomplete from "react-google-autocomplete";
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, arrayUnion, arrayRemove, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Session, Activity, Member } from '../types';
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
  Filter
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

function getNextWednesdayAt6PM() {
  const d = new Date();
  const day = d.getDay();
  const diff = (3 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(18, 0, 0, 0);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${date}T${hours}:${minutes}`;
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

  const [eventName, setEventName] = useState('');
  const [activityType, setActivityType] = useState('Casual Hangout');
  const [hostId, setHostId] = useState(user.uid);
  const [selectedDate, setSelectedDate] = useState(getNextWednesdayAt6PM());
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!user || !leagueId) return;

    const qA = query(
      collection(db, 'activities'), 
      where('leagueId', '==', leagueId),
      orderBy('votes', 'desc')
    );
    const unsubscribeA = onSnapshot(qA, (snap) => {
      setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() } as Activity)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'activities'));

    const qM = query(
      collection(db, 'members'), 
      where('leagueIds', 'array-contains', leagueId),
      orderBy('displayName', 'asc')
    );
    const unsubscribeM = onSnapshot(qM, (snap) => {
      setMembers(snap.docs.map(d => ({ ...d.data() } as Member)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'members'));

    return () => {
      unsubscribeA();
      unsubscribeM();
    };
  }, [user, leagueId]);

  const handleCreateSession = async (e: FormEvent) => {
    e.preventDefault();
    if (!eventName.trim() || !selectedDate || isCreating) return;

    setIsCreating(true);
    const host = members.find(m => m.userId === hostId);

    try {
      const sessionData = {
        leagueId,
        date: new Date(selectedDate).toISOString(),
        activityName: eventName,
        activityType: activityType,
        location,
        description,
        hostId,
        hostName: host?.displayName || 'Host',
        attendees: [hostId],
        declined: [],
        status: 'planned'
      };

      const docRef = await addDoc(collection(db, 'sessions'), sessionData);

      // Automated Chat Message
      try {
        await addDoc(collection(db, 'messages'), {
          leagueId,
          senderId: 'SYSTEM',
          senderName: 'Dad League (Announcement)',
          text: `NEW EVENT: ${eventName}! Hosted by ${host?.displayName || 'Host'} on ${new Date(selectedDate).toLocaleDateString()}. Check the Schedule to RSVP!`,
          createdAt: serverTimestamp()
        });
      } catch (msgErr) {
        // Log but don't fail the whole session creation if just the message fails
        console.error("Error creating announcement message:", msgErr);
      }

      setIsPlanning(false);
      setEventName('');
      setActivityType('Casual Hangout');
      setHostId(user.uid);
      setSelectedDate(getNextWednesdayAt6PM());
      setLocation('');
      setDescription('');
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

    return (
      <motion.div 
        layout
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-4 md:p-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
              className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
            >
              <CalendarIcon size={18} />
            </button>
            <div onClick={() => setIsCalendarExpanded(!isCalendarExpanded)} className="cursor-pointer">
              <h3 className="text-sm font-black text-slate-800 tracking-tight leading-none uppercase">{format(currentMonth, dateFormat)}</h3>
            </div>
          </div>
          <div className="flex gap-1">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

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
                    setActivityType(activity.category);
                    setLocation(activity.location || '');
                    setDescription(activity.description);
                  }
                }}
                className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-900 italic shadow-inner"
              >
                <option value="">-- Choose an idea --</option>
                {activities.map(a => (
                  <option key={a.id} value={a.id}>{a.title} ({a.category})</option>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Date & Time</label>
                  <input 
                    type="datetime-local"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Location/Address</label>
                <Autocomplete
                  apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                  onPlaceSelected={(place) => {
                    setLocation(place.formatted_address || place.name || '');
                  }}
                  defaultValue={location}
                  onChange={(e: any) => setLocation(e.target.value)}
                  options={{
                    types: ["geocode", "establishment"],
                  }}
                  placeholder="e.g. Pine Valley Golf Club"
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
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

      <div className="space-y-12">
        <section className="space-y-6">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 pl-2">Upcoming Events</h3>
          <div className="grid gap-6">
            {upcomingSessions.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-[2rem] border border-slate-200 shadow-sm border-dashed">
                <CalendarIcon size={40} className="mx-auto text-slate-200 mb-3" />
                <p className="text-slate-500 font-bold">No upcoming trips.</p>
                <p className="text-slate-400 text-xs mt-1">Time to rally the boys.</p>
              </div>
            ) : (
              upcomingSessions.map(session => (
                <SessionCard 
                  key={session.id} 
                  session={session} 
                  activities={activities} 
                  getCalendarLink={getCalendarLink} 
                  getMapsLink={getMapsLink}
                  members={members}
                  currentUser={user}
                  onChatClick={() => onNavigateToChat(session.id)}
                />
              ))
            )}
          </div>
        </section>

        {pastSessions.length > 0 && (
          <section className="space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 pl-2">Past Events</h3>
            <div className="grid gap-4">
              {pastSessions.map(session => (
                <div key={session.id} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200 flex items-center justify-between opacity-70 grayscale">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center font-black italic text-slate-400 leading-none">
                      <span className="text-[8px] uppercase">{new Date(session.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="text-lg">{new Date(session.date).getDate()}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{session.activityName}</h4>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{session.location || 'Local'}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase bg-slate-200 text-slate-500 px-3 py-1 rounded-full tracking-widest">
                    {session.status === 'completed' || new Date(session.date) < now ? 'Completed' : session.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {cancelledSessions.length > 0 && (
          <section className="space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-rose-400 pl-2">Cancelled Events</h3>
            <div className="grid gap-4">
              {cancelledSessions.map(session => (
                <div key={session.id} className="p-6 bg-rose-50/30 rounded-[2rem] border border-rose-100 flex items-center justify-between grayscale">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl border border-rose-100 flex flex-col items-center justify-center font-black italic text-rose-300 leading-none">
                      <span className="text-[8px] uppercase">{new Date(session.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="text-lg">{new Date(session.date).getDate()}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-400 line-through decoration-slate-300 decoration-2">{session.activityName}</h4>
                      <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Host: {session.hostName}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase bg-rose-100 text-rose-500 px-3 py-1 rounded-full tracking-widest italic">Cancelled</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SessionCard({ session, activities, getCalendarLink, getMapsLink, members, currentUser, onChatClick }: { 
  session: Session, 
  activities: Activity[], 
  getCalendarLink: (s: Session, a?: Activity) => string,
  getMapsLink: (l: string) => string,
  members: Member[],
  currentUser: User,
  onChatClick: () => void,
  key?: any
}) {
  const activity = activities.find(a => a.id === session.activityId);
  const date = new Date(session.date);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Edit state
  const [editName, setEditName] = useState(session.activityName);
  const [editType, setEditType] = useState(session.activityType || 'Casual Hangout');
  const [editDate, setEditDate] = useState(new Date(session.date).toISOString().slice(0, 16));
  const [editLocation, setEditLocation] = useState(session.location || '');
  const [editDescription, setEditDescription] = useState(session.description || '');

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
    
    // Announce cancellation in chat
    await addDoc(collection(db, 'messages'), {
      leagueId: session.leagueId,
      senderId: 'SYSTEM',
      senderName: 'Dad League (Announcement)',
      text: `CANCELLED: ${session.activityName} has been cancelled by the host.`,
      createdAt: serverTimestamp(),
      threadId: 'general'
    });
    setShowCancelConfirm(false);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    const docRef = doc(db, 'sessions', session.id);
    
    try {
      await updateDoc(docRef, {
        activityName: editName,
        activityType: editType,
        date: new Date(editDate).toISOString(),
        location: editLocation,
        description: editDescription,
        updatedAt: serverTimestamp()
      });
      
      setIsEditing(false);
      
      // Announce update in chat
      await addDoc(collection(db, 'messages'), {
        leagueId: session.leagueId,
        senderId: 'SYSTEM',
        senderName: 'Dad League (Announcement)',
        text: `UPDATED: "${editName}" on ${new Date(editDate).toLocaleDateString()}. Check the schedule for details!`,
        createdAt: serverTimestamp(),
        threadId: 'general'
      });
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
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adjust the mission details</p>
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
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Date & Time</label>
                <input 
                  type="datetime-local"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Location</label>
                <Autocomplete
                   apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                   onPlaceSelected={(place) => {
                     setEditLocation(place.formatted_address || place.name || '');
                   }}
                   defaultValue={editLocation}
                   onChange={(e: any) => setEditLocation(e.target.value)}
                   options={{
                     types: ["geocode", "establishment"],
                   }}
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
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 uppercase tracking-widest text-[10px]"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px]"
              >
                <Save size={14} />
                Save Changes
              </button>
            </div>
          </motion.form>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            <div className={`p-4 rounded-xl flex flex-col items-center justify-center min-w-[80px] border shadow-inner h-fit ${session.status === 'cancelled' ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
              <span className="text-[10px] font-black uppercase opacity-60">
                {date.toLocaleDateString('en-US', { month: 'short' })}
              </span>
              <span className="text-3xl font-black italic tracking-tighter">
                {date.getDate()}
              </span>
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
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
                  {isHost && session.status !== 'cancelled' && (
                    <>
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Edit Event"
                      >
                        <Pencil size={20} />
                      </button>
                      <div className="relative">
                        <button 
                          onClick={() => setShowCancelConfirm(!showCancelConfirm)}
                          className={`p-2 rounded-lg transition-all ${showCancelConfirm ? 'bg-rose-100 text-rose-600' : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                          title="Cancel Event"
                        >
                          <XCircle size={20} />
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
                    <CalendarPlus size={20} />
                  </a>
                </div>
              </div>
              <h3 className="text-3xl font-black tracking-tight text-slate-800 leading-tight">{session.activityName}</h3>
              <div className="flex flex-wrap items-center gap-4 text-slate-500 text-sm font-medium">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-lg border border-slate-100">
                  <UserIcon size={14} className="text-indigo-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Host:</span>
                  <span className="text-slate-700">{session.hostName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <CalendarIcon size={16} />
                  {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
                {session.location && (
                  <a 
                    href={getMapsLink(session.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
                  >
                    <MapPin size={16} />
                    {session.location}
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

            <div className="flex items-center gap-2 shrink-0">
              {isGoing && session.status !== 'cancelled' && (
                <button 
                  onClick={onChatClick}
                  className="flex items-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-100 transition-colors"
                  title="Event chat"
                >
                  <MessageCircle size={16} />
                  Chat
                </button>
              )}
              <button 
                disabled={session.status === 'cancelled'}
                onClick={() => handleRSVP(true)}
                className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
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
                className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
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
