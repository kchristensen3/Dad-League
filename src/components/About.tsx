import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { League } from '../types';

interface AboutProps {
  league?: League;
  onAccept?: () => void;
}

export default function About({ league, onAccept }: AboutProps) {
  const [copied, setCopied] = useState(false);
  const inviteCode = league?.inviteCode || 'WELCOME-TO-DADLEAGUE';

  const handleCopy = () => {
    const inviteUrl = `${window.location.origin}?invite=${inviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const goals = [
    "Make time to have fun and hang with a community",
    "Try new activities and get out of the dad-rut",
    "Help each other out",
    "No pressure. Just dads hanging out."
  ];

  return (
    <div className="space-y-12 max-w-2xl mx-auto pb-12">
      <section className="space-y-4 text-center">
        <h2 className="text-5xl font-black tracking-tight uppercase leading-tight text-slate-800">What is<br/>Dad League?</h2>
        <p className="text-slate-500 text-lg leading-relaxed">
          The Dad League is a simple commitment to getting out once a week. 
          No complicated organization, just a crew of dads making time for themselves.
        </p>
        
        {onAccept && (
          <button 
            onClick={onAccept}
            className="mt-4 px-8 py-3 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
          >
            Enter the League
          </button>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-8 md:p-10 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-32 -mt-32 opacity-60"></div>
        <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 mb-8 relative z-10 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
          How it works
        </h3>
        <ul className="space-y-6 relative z-10">
          {goals.map((goal, i) => (
            <li key={i} className="flex gap-4 items-start">
              <span className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black shrink-0 shadow-md text-xs italic">
                {i+1}
              </span>
              <span className="text-lg font-medium text-slate-600 leading-tight pt-1">{goal}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-6">
        <div className="bg-indigo-600 rounded-2xl p-8 shadow-xl shadow-indigo-100 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex-1">
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Need a recruit?</h3>
            <p className="text-indigo-100 font-medium mt-1">Invite a fellow dad to join the league.</p>
            <div className="mt-4 inline-flex items-center gap-2 bg-indigo-700/50 border border-indigo-500/50 px-4 py-2 rounded-lg text-indigo-100 font-mono text-sm leading-none">
              <span>{inviteCode}</span>
            </div>
          </div>
          <button 
            onClick={handleCopy}
            className={`flex items-center gap-3 px-6 py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all shrink-0 ${
              copied ? 'bg-emerald-500 text-white' : 'bg-white text-indigo-600 hover:bg-slate-50'
            }`}
          >
            {copied ? <Check size={16} /> : <Share2 size={16} />}
            {copied ? 'Link Copied!' : 'Copy Invite Link'}
          </button>
        </div>

        {/* Founder Testimonial */}
        <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200 relative">
          <span className="absolute -top-4 left-8 px-4 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-400">A Message from the founder</span>
          <div className="space-y-4">
            <h4 className="text-xl font-black text-slate-800">Why I started Dad League</h4>
            <div className="space-y-4 text-slate-600 leading-relaxed italic border-l-4 border-indigo-200 pl-6 py-2">
              <p>Hey, I'm Kyle.</p>
              <p>A little while ago, I realized I was stuck in a bit of a funk. I was putting all my energy into being a good manager, a present dad, a supportive husband, and an active member of my community. I loved doing those things, but somewhere in the middle of all those responsibilities, I completely forgot to take time out for myself just to have fun with my friends.</p>
              <p>I came to a realization: if I didn't literally "put it on the calendar," it was never going to happen. I needed a way to force myself to get out there, but I wanted it to be fun, inclusive, and positive for other guys who were in the exact same situation.</p>
              <p>That's what Dad League is. It’s not about escaping our lives; it’s about recharging so we can show up better for the people who depend on us. It's a standing invitation to just hang out.</p>
            </div>
            <div className="pt-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-black">KC</div>
              <div>
                <p className="font-black text-slate-800 leading-none">Kyle Christensen</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Founder, Dad League</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
