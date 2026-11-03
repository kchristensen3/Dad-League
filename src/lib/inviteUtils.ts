import { User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  arrayUnion, 
  increment, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { League } from '../types';

const PENDING_INVITE_KEY = 'pendingInviteCode';
const TESTFLIGHT_PUBLIC_URL = 'https://testflight.apple.com/join/dadleague'; // Default fallback

/**
 * Extracts invite code from URL query params (?invite=CODE or ?code=CODE) or hash
 */
export function getInviteCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('invite') || urlParams.get('code');
    if (code && code.trim()) {
      return code.trim().toUpperCase();
    }

    // Check hash fallback (e.g. #invite=CODE or #/invite/CODE)
    if (window.location.hash) {
      const hash = window.location.hash;
      const hashParams = new URLSearchParams(hash.replace(/^[#/?]+/, '?'));
      const hashCode = hashParams.get('invite') || hashParams.get('code');
      if (hashCode && hashCode.trim()) {
        return hashCode.trim().toUpperCase();
      }
    }
  } catch (e) {
    console.error('Error parsing invite code from URL:', e);
  }

  return null;
}

/**
 * Persists the invite code across page reloads, app launches, and auth redirects
 */
export function storePendingInviteCode(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = code.trim().toUpperCase();
    localStorage.setItem(PENDING_INVITE_KEY, clean);
    sessionStorage.setItem(PENDING_INVITE_KEY, clean);
  } catch (e) {
    console.warn('Could not store pending invite code in storage:', e);
  }
}

/**
 * Retrieves any pending invite code stored in localStorage or sessionStorage
 */
export function getStoredInviteCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const code = localStorage.getItem(PENDING_INVITE_KEY) || sessionStorage.getItem(PENDING_INVITE_KEY);
    return code ? code.trim().toUpperCase() : null;
  } catch (e) {
    return null;
  }
}

/**
 * Clears the pending invite code and cleans the browser address bar
 */
export function clearPendingInviteCode(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
    sessionStorage.removeItem(PENDING_INVITE_KEY);

    // Clean address bar query param without triggering page reload
    const url = new URL(window.location.href);
    if (url.searchParams.has('invite') || url.searchParams.has('code')) {
      url.searchParams.delete('invite');
      url.searchParams.delete('code');
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash);
    }
  } catch (e) {
    console.warn('Error clearing invite code:', e);
  }
}

/**
 * Generates the full universal web invite URL
 */
export function getUniversalInviteUrl(inviteCode: string): string {
  if (typeof window === 'undefined') return `https://dadleague.app/?invite=${inviteCode}`;
  return `${window.location.origin}/?invite=${inviteCode.toUpperCase()}`;
}

/**
 * Generates the native app custom scheme URL
 */
export function getNativeAppInviteUrl(inviteCode: string): string {
  return `dadleague://invite?code=${inviteCode.toUpperCase()}`;
}

/**
 * Fetches league details for a given invite code
 */
export async function fetchLeagueByInviteCode(inviteCode: string): Promise<League | null> {
  const cleanCode = inviteCode.trim().toUpperCase();
  try {
    const q = query(collection(db, 'leagues'), where('inviteCode', '==', cleanCode));
    const snap = await getDocs(q);
    if (snap.empty) {
      return null;
    }
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as League;
  } catch (err) {
    console.error('Error fetching league by invite code:', err);
    return null;
  }
}

/**
 * Records an invite link tap metric for conversion tracking
 */
export async function trackInviteTap(leagueId: string): Promise<void> {
  try {
    const leagueRef = doc(db, 'leagues', leagueId);
    await updateDoc(leagueRef, {
      inviteTaps: increment(1)
    });
  } catch (err) {
    // Fail silently so it never interrupts the user's flow
    console.warn('Unable to record invite tap metric:', err);
  }
}

/**
 * Automatically joins the authenticated user into the league matching the invite code
 */
export async function autoJoinLeagueWithCode(user: User, inviteCode: string): Promise<{ success: boolean; league?: League; alreadyMember?: boolean; error?: string }> {
  const cleanCode = inviteCode.trim().toUpperCase();
  try {
    const league = await fetchLeagueByInviteCode(cleanCode);
    if (!league) {
      return { success: false, error: `No league found for invite code "${cleanCode}".` };
    }

    const isAlreadyMember = league.memberIds.includes(user.uid);
    if (isAlreadyMember) {
      // User is already a member, ensure member doc has it
      try {
        await updateDoc(doc(db, 'members', user.uid), {
          leagueIds: arrayUnion(league.id)
        });
      } catch (e) {
        // Ignore if already set
      }
      return { success: true, league, alreadyMember: true };
    }

    // Add user to league's memberIds and increment inviteJoins conversion counter
    const leagueRef = doc(db, 'leagues', league.id);
    await updateDoc(leagueRef, {
      memberIds: arrayUnion(user.uid),
      inviteJoins: increment(1)
    });

    // Update user's member document
    const memberRef = doc(db, 'members', user.uid);
    await updateDoc(memberRef, {
      leagueIds: arrayUnion(league.id)
    });

    return { 
      success: true, 
      league: { ...league, memberIds: [...league.memberIds, user.uid] },
      alreadyMember: false 
    };
  } catch (err: any) {
    console.error('Error auto-joining league:', err);
    return { success: false, error: err?.message || 'Failed to auto-join league.' };
  }
}

/**
 * Attempts to launch native app via custom URL scheme; falls back to App Store / TestFlight
 */
export function openAppOrStore(inviteCode: string, testFlightUrl = TESTFLIGHT_PUBLIC_URL): void {
  const appUrl = getNativeAppInviteUrl(inviteCode);
  
  // Set a timer: if user doesn't leave page within 1.5 seconds, redirect to store
  const start = Date.now();
  const timeout = setTimeout(() => {
    // If page is still visible and focused, app likely not installed
    if (Date.now() - start < 2500) {
      window.location.href = testFlightUrl;
    }
  }, 1200);

  // Try opening native app
  window.location.href = appUrl;

  // Clear timeout if window blurs (meaning native app opened)
  window.addEventListener('blur', () => clearTimeout(timeout), { once: true });
}
