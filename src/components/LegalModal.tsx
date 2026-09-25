import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, FileText, ExternalLink } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'privacy' | 'terms';
}

export default function LegalModal({ isOpen, onClose, initialTab = 'privacy' }: LegalModalProps) {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialTab);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden z-10"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md -rotate-2">
                <span className="font-black text-lg">D</span>
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight">Legal & Compliance</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dad League v1.0</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={activeTab === 'privacy' ? '/privacy' : '/terms'}
                target="_blank"
                rel="noreferrer"
                className="p-2 text-slate-400 hover:text-indigo-600 transition-colors rounded-xl hover:bg-white"
                title="Open in new window"
              >
                <ExternalLink size={18} />
              </a>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-xl hover:bg-white"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-slate-100 bg-slate-100/50 p-1.5 gap-1 shrink-0">
            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex-1 py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                activeTab === 'privacy'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldCheck size={16} /> Privacy Policy
            </button>
            <button
              onClick={() => setActiveTab('terms')}
              className={`flex-1 py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                activeTab === 'terms'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText size={16} /> Terms of Service
            </button>
          </div>

          {/* Scrollable Content Body */}
          <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-slate-600 text-sm leading-relaxed">
            {activeTab === 'privacy' ? (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xl font-black text-slate-900 tracking-tight">Privacy Policy</h4>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">
                    Last Updated: September 25, 2026
                  </p>
                </div>

                <p>
                  Dad League ("we," "our," or "us") respects your privacy. We collect minimal personal data solely to coordinate weekly dad hangouts, share event RSVPs, and manage your local league roster.
                </p>

                <div className="space-y-3">
                  <h5 className="font-black text-slate-800 uppercase text-xs tracking-wider">1. Information We Collect</h5>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs">
                    <li><strong>Google Account Data:</strong> Name, email address, and profile photo provided via Google Sign-In.</li>
                    <li><strong>Profile Customization:</strong> Optional huddle location (e.g. city/neighborhood), weekly availability, and interest tags.</li>
                    <li><strong>League Data:</strong> Event suggestions, RSVP confirmations, and community board or chat messages.</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <h5 className="font-black text-slate-800 uppercase text-xs tracking-wider">2. How We Use Data</h5>
                  <p className="text-xs">
                    Data is used exclusively to facilitate your league interactions. We <strong>do not sell, rent, or trade your data</strong> to advertisers, data brokers, or marketing networks.
                  </p>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
                  <h5 className="font-black text-indigo-900 uppercase text-xs tracking-wider">
                    3. Account & Data Deletion (Apple Guideline 5.1.1(v))
                  </h5>
                  <p className="text-xs text-indigo-800">
                    You can permanently erase your entire member record, interest tags, and credentials at any time in <strong>Account Settings → Delete Account</strong> or by emailing <a href="mailto:kylechristensen3@gmail.com" className="font-bold underline">kylechristensen3@gmail.com</a>.
                  </p>
                </div>

                <div className="space-y-3">
                  <h5 className="font-black text-slate-800 uppercase text-xs tracking-wider">4. Third-Party Infrastructure</h5>
                  <p className="text-xs">
                    We utilize Google Cloud and Firebase for enterprise-grade authentication and encrypted Firestore data persistence.
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="text-[11px] text-slate-500">
                    Contact: <strong>Kyle Christensen</strong> (<a href="mailto:kylechristensen3@gmail.com" className="text-indigo-600 underline">kylechristensen3@gmail.com</a>)
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xl font-black text-slate-900 tracking-tight">Terms of Service</h4>
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">
                    Last Updated: September 25, 2026
                  </p>
                </div>

                <p>
                  By joining Dad League and using this application, you agree to these Terms of Service. If you do not agree, please do not use the application.
                </p>

                <div className="space-y-3">
                  <h5 className="font-black text-slate-800 uppercase text-xs tracking-wider">1. Eligibility</h5>
                  <p className="text-xs">
                    Dad League is designed for adult parents and guardians aged 18 and older.
                  </p>
                </div>

                <div className="space-y-3">
                  <h5 className="font-black text-slate-800 uppercase text-xs tracking-wider">2. Code of Conduct</h5>
                  <p className="text-xs">
                    Members must treat everyone with respect. Harassment, abusive language, discriminatory remarks, illegal materials, and commercial spam are strictly prohibited and will result in immediate ban and account deletion.
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2 text-amber-900">
                  <h5 className="font-black uppercase text-xs tracking-wider">
                    3. Safety & Voluntary In-Person Outings
                  </h5>
                  <p className="text-xs leading-relaxed">
                    Participation in any meetup, sporting activity, or event organized through Dad League is 100% voluntary. You assume all personal risk of injury, accident, or damage. Dad League does not provide background checks or on-site supervision.
                  </p>
                </div>

                <div className="space-y-3">
                  <h5 className="font-black text-slate-800 uppercase text-xs tracking-wider">4. Content Ownership</h5>
                  <p className="text-xs">
                    You retain ownership of the messages and ideas you post. You grant Dad League a non-exclusive license to display this content to members of your league.
                  </p>
                </div>

                <div className="space-y-3">
                  <h5 className="font-black text-slate-800 uppercase text-xs tracking-wider">5. Limitation of Liability</h5>
                  <p className="text-xs uppercase text-slate-500 font-medium leading-relaxed">
                    Dad League and its organizers are provided "as is" without warranty. Liability is limited to the fullest extent permitted by applicable law.
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="text-[11px] text-slate-500">
                    Contact: <strong>Kyle Christensen</strong> (<a href="mailto:kylechristensen3@gmail.com" className="text-indigo-600 underline">kylechristensen3@gmail.com</a>)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Close */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Dad League Community Guidelines
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-xs tracking-wider rounded-xl transition-all active:scale-95"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
