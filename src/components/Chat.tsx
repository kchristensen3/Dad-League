import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Session, Message, Member } from '../types';
import { Send, AtSign, MessageCircle, Globe, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Chat({ user, leagueId, sessions, selectedThreadId, setSelectedThreadId }: { 
  user: User, 
  leagueId: string,
  sessions: Session[],
  selectedThreadId: string,
  setSelectedThreadId: (id: string) => void
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !leagueId) return;

    const qM = query(
      collection(db, 'messages'), 
      where('leagueId', '==', leagueId),
      orderBy('createdAt', 'asc')
    );
    const unsubscribeM = onSnapshot(qM, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'messages'));

    const qU = query(
      collection(db, 'members'), 
      where('leagueIds', 'array-contains', leagueId),
      orderBy('displayName', 'asc')
    );
    const unsubscribeU = onSnapshot(qU, (snap) => {
      setMembers(snap.docs.map(d => ({ ...d.data() } as Member)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'members'));

    return () => {
      unsubscribeM();
      unsubscribeU();
    };
  }, [user, leagueId]);

  // Reset to general if the selected thread becomes cancelled
  useEffect(() => {
    if (selectedThreadId !== 'general') {
      const currentSession = sessions.find(s => s.id === selectedThreadId);
      if (currentSession && (currentSession.status === 'cancelled' || !currentSession.attendees.includes(user.uid))) {
        setSelectedThreadId('general');
      }
    }
  }, [sessions, selectedThreadId, user.uid, setSelectedThreadId]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, selectedThreadId]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputText(value);

    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol !== -1 && (lastAtSymbol === 0 || textBeforeCursor[lastAtSymbol - 1] === ' ')) {
      const filter = textBeforeCursor.slice(lastAtSymbol + 1);
      setMentionFilter(filter);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (member: Member) => {
    const lastAtSymbol = inputText.lastIndexOf('@');
    const newText = inputText.slice(0, lastAtSymbol) + '@' + member.displayName + ' ' + inputText.slice(lastAtSymbol + mentionFilter.length + 1);
    setInputText(newText);
    setShowMentions(false);
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;

    setIsSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        leagueId,
        senderId: user.uid,
        senderName: user.displayName || 'Anon Dad',
        text: inputText,
        threadId: selectedThreadId,
        createdAt: serverTimestamp()
      });
      setInputText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'messages');
    } finally {
      setIsSending(false);
    }
  };

  const filteredMembers = members.filter(m => 
    m.displayName.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const renderMessageText = (text: string) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return <span key={i} className="font-black text-indigo-300 underline decoration-indigo-400 decoration-2 underline-offset-2">{part}</span>;
      }
      return part;
    });
  };

  // Filter messages based on thread
  // Map 'general' to both 'general' and undefined/empty threadId for backward compatibility
  const threadMessages = messages.filter(msg => {
    if (selectedThreadId === 'general') {
      return !msg.threadId || msg.threadId === 'general';
    }
    return msg.threadId === selectedThreadId;
  });

  // Threads list: General + Active events the user is attending
  const myEvents = sessions.filter(s => s.attendees.includes(user.uid) && s.status !== 'completed' && s.status !== 'cancelled');
  const activeSessionThread = sessions.find(s => s.id === selectedThreadId);

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] md:h-[calc(100vh-210px)] overflow-hidden">
      <div className="flex-1 flex flex-col bg-white rounded-xl md:rounded-2xl border border-slate-200 shadow-xl overflow-hidden p-2 md:p-4 mb-20 md:mb-0">
        <div className="mb-2 md:mb-3 border-b border-slate-100 pb-2 md:pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 shrink-0">
              {selectedThreadId === 'general' ? <Globe size={16} /> : <MessageCircle size={16} />}
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-slate-800 leading-none text-xs md:text-sm truncate">
                {selectedThreadId === 'general' ? 'General Broadcast' : activeSessionThread?.activityName}
              </h3>
              <p className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 tracking-[0.1em] mt-0.5">
                {selectedThreadId === 'general' ? `${members.length} members` : `${activeSessionThread?.attendees.length} attending`}
              </p>
            </div>
          </div>

          <div className="flex items-center">
            <select 
              value={selectedThreadId}
              onChange={(e) => setSelectedThreadId(e.target.value)}
              className="bg-slate-100 border-none rounded-xl px-3 py-1.5 text-[10px] md:text-xs font-black uppercase tracking-wider text-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-auto appearance-none cursor-pointer pr-8 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:1em_1em] bg-[right_0.5rem_center] bg-no-repeat"
            >
              <option value="general">🌍 General Broadcast</option>
              {myEvents.length > 0 && (
                <optgroup label="YOUR EVENTS">
                  {myEvents.map(s => (
                    <option key={s.id} value={s.id}>
                      📅 {s.activityName}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto space-y-1.5 md:space-y-2 pr-1 custom-scrollbar min-h-0 px-1 scroll-smooth"
        >
          {threadMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <MessageSquare size={32} className="mb-2 opacity-20" />
              <p className="font-bold text-xs uppercase tracking-widest">Quiet in here...</p>
            </div>
          ) : (
            threadMessages.map((msg) => (
              <div 
                key={msg.id}
                className={`flex flex-col ${msg.senderId === user.uid ? 'items-end' : 'items-start'}`}
              >
                <div className={`max-w-[90%] md:max-w-[70%] p-2.5 md:p-3 rounded-xl md:rounded-2xl shadow-sm ${
                  msg.senderId === user.uid 
                    ? 'bg-indigo-600 text-white rounded-br-none shadow-indigo-50/50' 
                    : msg.senderId === 'SYSTEM'
                      ? 'bg-slate-50 text-slate-400 border border-slate-100 rounded-lg italic mx-auto text-center w-full max-w-xs'
                      : 'bg-white text-slate-900 rounded-bl-none border border-slate-200'
                }`}>
                  <p className={`text-[7px] md:text-[8px] font-black uppercase mb-0.5 tracking-[0.1em] ${
                    msg.senderId === user.uid ? 'text-indigo-200' : 'text-slate-400'
                  }`}>
                    {msg.senderName}
                  </p>
                  <p className="text-[11px] md:text-[13px] font-medium leading-normal">
                    {renderMessageText(msg.text)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={scrollRef} />
        </div>

        <div className="relative mt-3 px-1 pb-1 flex-shrink-0">
          <AnimatePresence>
            {showMentions && filteredMembers.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden z-50"
              >
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                  <AtSign size={14} className="text-indigo-500" />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Mention Someone</span>
                </div>
                <div className="max-h-48 overflow-y-auto p-2">
                  {filteredMembers.map(m => (
                    <button
                      key={m.userId}
                      onClick={() => insertMention(m)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors group text-left"
                    >
                      <img 
                        src={m.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.userId}`} 
                        className="w-8 h-8 rounded-lg group-hover:scale-105 transition-transform" 
                        alt=""
                      />
                      <span className="text-sm font-bold text-slate-700">{m.displayName}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSend} className="flex gap-2 md:gap-3">
            <input 
              value={inputText}
              onChange={handleInputChange}
              placeholder="Talk shop..."
              className="flex-1 p-3 md:p-4 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            <button 
              type="submit"
              disabled={isSending}
              className="p-3 md:p-4 bg-indigo-600 text-white rounded-xl md:rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50"
            >
              {isSending ? (
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
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
