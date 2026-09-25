import { useState, KeyboardEvent, useEffect } from 'react';
import { User, deleteUser } from 'firebase/auth';
import { doc, updateDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { Member } from '../types';
import { LogOut, MapPin, Clock, Save, Hash, X, Trash2, AlertTriangle, ShieldCheck, FileText, Download, Smartphone, Terminal, Check, FolderDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LegalModal from './LegalModal';

export default function Profile({ 
  user, 
  member, 
  onLogout,
  onShowLoginScreen
}: { 
  user: User, 
  member: Member | null, 
  onLogout: () => void,
  onShowLoginScreen?: () => void
}) {
  const [location, setLocation] = useState(member?.location || '');
  const [availability, setAvailability] = useState(member?.availability || '');
  const [interests, setInterests] = useState<string[]>(member?.interests || []);
  const [newInterest, setNewInterest] = useState('');
  const [saving, setSaving] = useState(false);
  const [attendedCount, setAttendedCount] = useState(0);
  const [proposedCount, setProposedCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [legalModalTab, setLegalModalTab] = useState<'privacy' | 'terms' | null>(null);
  const [showExportGuide, setShowExportGuide] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

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

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      // 1. Delete Firestore member record
      await deleteDoc(doc(db, 'members', user.uid));
      // 2. Delete Auth user credentials
      await deleteUser(user);
      setShowDeleteModal(false);
      onLogout();
    } catch (err: any) {
      console.error('Delete account error:', err);
      if (err?.code === 'auth/requires-recent-login') {
        setDeleteError('For your security, deleting your account requires a recent login. Please log out, log back in, and try again.');
      } else {
        setDeleteError(err?.message || 'Failed to delete account. Please try again.');
      }
    } finally {
      setDeleting(false);
    }
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

      {/* Export & Mobile Build Section (Capacitor & GitHub) */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-6 md:p-8 shadow-xl border border-indigo-900/50 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider mb-2 border border-indigo-500/30">
              <Smartphone size={12} /> Mobile & Code Export
            </div>
            <h4 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
              Export App & Build in Capacitor
            </h4>
            <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
              Export the complete codebase (including iOS/Android Capacitor config, legal files, icons, and Firebase logic) to push to GitHub or compile for the Apple App Store and Google Play.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <a
              href="/dad-league-source.zip"
              download="dad-league-source.zip"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black uppercase text-xs tracking-wider rounded-xl shadow-lg shadow-indigo-600/30 transition-all border border-indigo-400/30"
            >
              <Download size={16} /> Download .ZIP
            </a>
            <button
              onClick={() => setShowExportGuide(!showExportGuide)}
              className="px-4 py-3 bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-white/10 text-center"
            >
              {showExportGuide ? 'Hide Guide' : 'Setup Guide'}
            </button>
          </div>
        </div>

        {showExportGuide && (
          <div className="pt-4 border-t border-white/10 space-y-5 text-left">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Step 1: Push to GitHub */}
              <div className="bg-black/30 rounded-xl p-4 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <Terminal size={14} /> 1. Push to GitHub
                  </span>
                  <button
                    onClick={() => copyToClipboard('git init\ngit add .\ngit commit -m "Initial Dad League commit"\ngit branch -M main\ngit remote add origin <YOUR_GITHUB_REPO_URL>\ngit push -u origin main', 'github')}
                    className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {copiedCmd === 'github' ? <Check size={12} className="text-emerald-400" /> : null}
                    {copiedCmd === 'github' ? 'Copied' : 'Copy Commands'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Unzip the downloaded archive on your computer, open your terminal in the folder, and run:
                </p>
                <pre className="p-2.5 bg-black/60 rounded-lg text-[11px] text-indigo-200 font-mono overflow-x-auto leading-relaxed border border-white/5">
                  <code>{`git init
git add .
git commit -m "Initial Dad League commit"
git branch -M main
git remote add origin https://github.com/<user>/dad-league.git
git push -u origin main`}</code>
                </pre>
              </div>

              {/* Step 2: Build with Capacitor */}
              <div className="bg-black/30 rounded-xl p-4 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <Smartphone size={14} /> 2. Build for iOS / Android
                  </span>
                  <button
                    onClick={() => copyToClipboard('npm install\nnpm run build\nnpx cap add ios\nnpx cap sync\nnpx cap open ios', 'cap')}
                    className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    {copiedCmd === 'cap' ? <Check size={12} className="text-emerald-400" /> : null}
                    {copiedCmd === 'cap' ? 'Copied' : 'Copy Commands'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Your project is already configured with <code className="text-white">capacitor.config.json</code>! In your terminal:
                </p>
                <pre className="p-2.5 bg-black/60 rounded-lg text-[11px] text-emerald-200 font-mono overflow-x-auto leading-relaxed border border-white/5">
                  <code>{`npm install
npm run build
npx cap add ios      # (or: npx cap add android)
npx cap sync
npx cap open ios     # opens in Xcode for App Store`}</code>
                </pre>
              </div>
            </div>

            <div className="p-3 bg-indigo-900/30 border border-indigo-500/20 rounded-xl text-xs text-indigo-200 flex items-center justify-between">
              <span>📄 Comprehensive mobile instructions are saved in <strong>CAPACITOR_SETUP.md</strong> inside the zip.</span>
              <a
                href="/dad-league-source.zip"
                download="dad-league-source.zip"
                className="text-[10px] font-black uppercase tracking-widest text-indigo-300 hover:text-white underline ml-3 shrink-0"
              >
                Download Archive (.ZIP)
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Account & Privacy Section (Required by Apple App Store Guideline 5.1.1(v)) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
              <Trash2 size={16} className="text-rose-500" /> Account & Data Privacy
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
              In accordance with Apple App Store guidelines, you can review our legal policies or permanently delete your account, personal profile, and membership records at any time.
            </p>
          </div>
          <button
            onClick={() => {
              setDeleteConfirmText('');
              setDeleteError(null);
              setShowDeleteModal(true);
            }}
            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black uppercase text-[10px] tracking-wider rounded-xl transition-all shrink-0 border border-rose-200 active:scale-95"
          >
            Delete Account
          </button>
        </div>

        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          {onShowLoginScreen && (
            <button
              onClick={onShowLoginScreen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-colors cursor-pointer"
            >
              <LogOut size={14} className="text-indigo-600 rotate-180" /> Preview Login Screen
            </button>
          )}
          <button
            onClick={() => setLegalModalTab('privacy')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs border border-slate-200 transition-colors"
          >
            <ShieldCheck size={14} className="text-indigo-600" /> Privacy Policy
          </button>
          <button
            onClick={() => setLegalModalTab('terms')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs border border-slate-200 transition-colors"
          >
            <FileText size={14} className="text-indigo-600" /> Terms of Service
          </button>
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] uppercase font-black text-slate-400 hover:text-indigo-600 transition-colors ml-auto"
          >
            Open in Browser ↗
          </a>
        </div>
      </div>

      <LegalModal
        isOpen={legalModalTab !== null}
        initialTab={legalModalTab || 'privacy'}
        onClose={() => setLegalModalTab(null)}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-rose-200"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-slate-800">Permanently Delete Account</h3>
                  <p className="text-xs text-slate-400">Irreversible Action</p>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                This will permanently delete your member profile, remove your preferences, and erase your account. This action <strong>cannot be undone</strong>.
              </p>

              {deleteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                  {deleteError}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">
                  Type <span className="text-rose-600 font-mono font-bold">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || deleting}
                  onClick={handleDeleteAccount}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2"
                >
                  {deleting ? 'Deleting...' : 'Delete Forever'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
