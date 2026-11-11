import { User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  updateDoc, 
  setDoc, 
  deleteDoc,
  addDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import { League, Member } from '../types';

export interface LeagueRosterDef {
  key: 'architex' | 'baseball' | 'detroit';
  nameMatch: string;
  defaultName: string;
  defaultDesc: string;
  inviteCode: string;
  targetNames: string[]; // names of dads who belong in this league
}

export const LEAGUE_ROSTER_DEFS: LeagueRosterDef[] = [
  {
    key: 'architex',
    nameMatch: 'architex',
    defaultName: 'Architex',
    defaultDesc: 'Architecture, tech discussions, and side projects.',
    inviteCode: 'ARCHITEX',
    targetNames: ['me', 'jeff']
  },
  {
    key: 'baseball',
    nameMatch: 'baseball',
    defaultName: 'Baseball Crew',
    defaultDesc: 'Ballgames, batting practice, fantasy baseball, and sports hangs.',
    inviteCode: 'BASEBALL',
    targetNames: ['collin', 'me', 'jeff', 'matt', 'nate']
  },
  {
    key: 'detroit',
    nameMatch: 'detroit',
    defaultName: 'Detroit Dads',
    defaultDesc: 'Detroit dad meetups, weekend hangs, and local community.',
    inviteCode: 'DET-DADS',
    targetNames: ['me', 'drew', 'jeff']
  }
];

// Helper to check if a member doc is a placeholder/dummy
export function isDummyMember(member: Member): boolean {
  if (!member) return false;
  return (
    member.userId.startsWith('dad_') ||
    Boolean(member.email && member.email.toLowerCase().endsWith('@dadleague.app'))
  );
}

// Deduplicate leagues by normalized name (keeps canonical league, e.g. custom invite codes)
export function deduplicateLeagues(leagues: League[]): League[] {
  const map = new Map<string, League>();
  const standardCodes = ['DET-DADS', 'ARCHITEX', 'BASEBALL'];

  for (const league of leagues) {
    if (!league || !league.name) continue;
    const norm = league.name.trim().toLowerCase();
    const existing = map.get(norm);

    if (!existing) {
      map.set(norm, league);
    } else {
      const currentIsStandard = standardCodes.includes(league.inviteCode || '');
      const existingIsStandard = standardCodes.includes(existing.inviteCode || '');

      if (currentIsStandard && !existingIsStandard) {
        map.set(norm, league);
      } else if (!existingIsStandard && (league.memberIds?.length || 0) > (existing.memberIds?.length || 0)) {
        map.set(norm, league);
      }
    }
  }

  const orderPriority = (name: string) => {
    const n = (name || '').toLowerCase();
    if (n.includes('detroit')) return 1;
    if (n.includes('baseball')) return 2;
    if (n.includes('architex')) return 3;
    return 4;
  };

  return Array.from(map.values()).sort((a, b) => orderPriority(a.name) - orderPriority(b.name));
}

// Deduplicate roster members: filters out dummy duplicate accounts when a real account exists,
// and ensures each dad appears exactly once with their real name and avatar
export function deduplicateRoster(members: Member[]): Member[] {
  if (!members || members.length === 0) return [];

  const realMembers = members.filter(m => !isDummyMember(m));
  const dummyMembers = members.filter(m => isDummyMember(m));

  const resultMap = new Map<string, Member>();

  const getFirstNameKey = (m: Member): string => {
    const dName = (m.displayName || '').trim().toLowerCase();
    const first = dName.split(' ')[0];
    if (first) return first;
    const emailPrefix = (m.email || '').toLowerCase().split('@')[0];
    return emailPrefix || m.userId;
  };

  // 1. Add all real members first (they take 100% precedence)
  for (const real of realMembers) {
    const key = getFirstNameKey(real);
    // If a different member has the same first name (e.g., two different real people), keep both by user ID
    if (!resultMap.has(key)) {
      resultMap.set(key, real);
    } else {
      resultMap.set(real.userId, real);
    }
  }

  // 2. Add dummy member only if NO real member with that first name exists
  for (const dummy of dummyMembers) {
    const key = getFirstNameKey(dummy);
    if (!resultMap.has(key)) {
      // Clean up dummy email display so it doesn't show fake "@dadleague.app"
      const cleanedDummy: Member = {
        ...dummy,
        email: dummy.email?.endsWith('@dadleague.app') ? '' : dummy.email
      };
      resultMap.set(key, cleanedDummy);
    }
  }

  const list = Array.from(resultMap.values());
  list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  return list;
}

// Helper to match a dad by name
export function matchesDadName(nameKey: string, member: Member, currentUser: User): boolean {
  const normKey = nameKey.toLowerCase().trim();
  const dName = (member.displayName || '').toLowerCase().trim();
  const email = (member.email || '').toLowerCase().trim();

  if (normKey === 'me' || normKey === 'kyle') {
    return member.userId === currentUser.uid || dName.includes('kyle') || email.includes('kyle');
  }
  if (normKey === 'jeff') {
    return dName.includes('jeff') || email.includes('jeff');
  }
  if (normKey === 'collin' || normKey === 'colin') {
    return dName.includes('collin') || dName.includes('colin') || email.includes('collin') || email.includes('colin');
  }
  if (normKey === 'matt' || normKey === 'matthew') {
    return dName.includes('matt') || email.includes('matt');
  }
  if (normKey === 'nate' || normKey === 'nathan') {
    return dName.includes('nate') || email.includes('nate');
  }
  if (normKey === 'drew' || normKey === 'andrew') {
    return dName.includes('drew') || dName.includes('andrew') || email.includes('drew');
  }
  return dName.includes(normKey) || email.includes(normKey);
}

// Clean up duplicate leagues and dummy members directly in Firestore
export async function cleanupDuplicateLeaguesAndMembers(
  leagues: League[],
  members: Member[],
  currentUser: User
): Promise<void> {
  try {
    // 1. DEDUPLICATE LEAGUES IN FIRESTORE
    const leaguesByName = new Map<string, League[]>();
    for (const l of leagues) {
      if (!l.name) continue;
      const norm = l.name.trim().toLowerCase();
      if (!leaguesByName.has(norm)) {
        leaguesByName.set(norm, []);
      }
      leaguesByName.get(norm)!.push(l);
    }

    const standardCodes = ['DET-DADS', 'ARCHITEX', 'BASEBALL'];

    for (const [, group] of leaguesByName.entries()) {
      if (group.length > 1) {
        let primary = group.find(l => standardCodes.includes(l.inviteCode || ''));
        if (!primary) {
          primary = group.reduce((prev, curr) => 
            (curr.memberIds?.length || 0) > (prev.memberIds?.length || 0) ? curr : prev
          );
        }

        const duplicates = group.filter(l => l.id !== primary!.id);
        const mergedMembersSet = new Set(primary.memberIds || []);

        for (const dup of duplicates) {
          (dup.memberIds || []).forEach(uid => mergedMembersSet.add(uid));
          try {
            console.log(`[RosterSync] Deleting duplicate league ${dup.name} (${dup.id})`);
            await deleteDoc(doc(db, 'leagues', dup.id));
          } catch (e) {
            console.warn(`[RosterSync] Notice deleting duplicate league ${dup.id}:`, e);
          }
        }

        const mergedUids = Array.from(mergedMembersSet);
        if (mergedUids.length !== (primary.memberIds || []).length) {
          try {
            await updateDoc(doc(db, 'leagues', primary.id), {
              memberIds: mergedUids
            });
          } catch (e) {
            console.warn(`[RosterSync] Notice merging memberIds for ${primary.name}:`, e);
          }
        }
      }
    }

    // 2. DEDUPLICATE MEMBERS & REMOVE DUMMY DAD_* DOCS WHERE REAL MEMBERS EXIST
    const realMembers = members.filter(m => !isDummyMember(m));
    const dummyMembers = members.filter(m => isDummyMember(m));

    for (const dummy of dummyMembers) {
      const dummyFirst = (dummy.displayName || '').trim().toLowerCase().split(' ')[0];
      const realMatch = realMembers.find(r => {
        const rFirst = (r.displayName || '').trim().toLowerCase().split(' ')[0];
        return (
          rFirst === dummyFirst ||
          (dummyFirst === 'jeff' && (rFirst.includes('jeff') || r.email?.includes('jeff'))) ||
          (dummyFirst === 'drew' && (rFirst.includes('drew') || rFirst.includes('andrew') || r.email?.includes('drew'))) ||
          (dummyFirst === 'collin' && (rFirst.includes('collin') || rFirst.includes('colin') || r.email?.includes('collin'))) ||
          (dummyFirst === 'matt' && (rFirst.includes('matt') || rFirst.includes('matthew') || r.email?.includes('matt'))) ||
          (dummyFirst === 'nate' && (rFirst.includes('nate') || rFirst.includes('nathan') || r.email?.includes('nate'))) ||
          (dummyFirst === 'kyle' && (rFirst.includes('kyle') || r.email?.includes('kyle')))
        );
      });

      if (realMatch) {
        console.log(`[RosterSync] Replacing dummy member ${dummy.displayName} (${dummy.userId}) with real member ${realMatch.displayName} (${realMatch.userId})`);
        
        // Update leagues to replace dummy.userId with realMatch.userId
        for (const l of leagues) {
          if (l.memberIds && l.memberIds.includes(dummy.userId)) {
            const updated = l.memberIds.filter(id => id !== dummy.userId);
            if (!updated.includes(realMatch.userId)) {
              updated.push(realMatch.userId);
            }
            try {
              await updateDoc(doc(db, 'leagues', l.id), { memberIds: updated });
            } catch (e) {
              console.warn(`[RosterSync] Notice updating league ${l.name} roster:`, e);
            }
          }
        }

        // Delete the dummy member doc
        try {
          await deleteDoc(doc(db, 'members', dummy.userId));
          console.log(`[RosterSync] Deleted dummy doc ${dummy.userId}`);
        } catch (e) {
          console.warn(`[RosterSync] Notice deleting dummy member doc ${dummy.userId}:`, e);
        }
      }
    }
  } catch (err) {
    console.warn("[RosterSync] Notice during database cleanup:", err);
  }
}

// Main sync routine: ensures canonical leagues have accurate real rosters without creating dummy duplicates
let syncInProgress = false;
let lastSyncTimestamp = 0;

export async function syncLeaguesAndRosters(
  existingLeagues: League[],
  existingMembers: Member[],
  currentUser: User
): Promise<void> {
  const now = Date.now();
  if (syncInProgress || (now - lastSyncTimestamp < 10000)) return;
  syncInProgress = true;

  try {
    // 1. Run automatic database cleanup of duplicates first
    await cleanupDuplicateLeaguesAndMembers(existingLeagues, existingMembers, currentUser);

    // 2. Ensure current user member doc is up to date
    let kyleMember = existingMembers.find(m => m.userId === currentUser.uid || matchesDadName('me', m, currentUser));
    if (!kyleMember) {
      kyleMember = {
        userId: currentUser.uid,
        displayName: currentUser.displayName || 'Kyle',
        email: currentUser.email || 'kylechristensen3@gmail.com',
        photoURL: currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.uid}`,
        createdAt: new Date().toISOString(),
        leagueIds: []
      };
      try {
        await setDoc(doc(db, 'members', currentUser.uid), kyleMember);
      } catch (e) {
        console.warn("Notice saving user profile:", e);
      }
    }

    // 3. Map real dads
    const memberMap = new Map<string, Member>();
    memberMap.set('me', kyleMember);
    memberMap.set('kyle', kyleMember);

    const neededDads = ['jeff', 'collin', 'matt', 'nate', 'drew'];
    for (const key of neededDads) {
      // Find real member first!
      const real = existingMembers.find(m => !isDummyMember(m) && matchesDadName(key, m, currentUser));
      if (real) {
        memberMap.set(key, real);
      } else {
        // Fallback to any existing member (e.g. Nate if pending)
        const anyMember = existingMembers.find(m => matchesDadName(key, m, currentUser));
        if (anyMember) {
          memberMap.set(key, anyMember);
        }
      }
    }

    // 4. Align canonical leagues
    const cleanLeagues = deduplicateLeagues(existingLeagues);
    const baseballLeague = cleanLeagues.find(l => l.name.toLowerCase().includes('baseball'));

    for (const def of LEAGUE_ROSTER_DEFS) {
      const league = cleanLeagues.find(l => l.name.toLowerCase().includes(def.nameMatch));
      if (!league) continue;

      const isBaseball = def.key === 'baseball' || league.name.toLowerCase().includes('baseball');

      const targetUids = def.targetNames
        .map(n => memberMap.get(n)?.userId)
        .filter((uid): uid is string => Boolean(uid));

      const currentUids = new Set(league.memberIds || []);

      // Ensure all targetUids for this league are present
      for (const uid of targetUids) {
        currentUids.add(uid);
      }

      // If NOT baseball crew, strictly remove Nate!
      if (!isBaseball) {
        for (const uid of Array.from(currentUids)) {
          const m = existingMembers.find(mem => mem.userId === uid);
          const isNate = uid.includes('nate') || 
                         (m && ((m.displayName || '').toLowerCase().includes('nate') || (m.email || '').toLowerCase().includes('nate')));
          if (isNate) {
            console.log(`[RosterSync] Strictly removing Nate (${uid}) from non-baseball league ${league.name}`);
            currentUids.delete(uid);
          }
        }
      }

      // Remove dummy IDs if the real user ID is already present
      for (const id of Array.from(currentUids)) {
        if (id.startsWith('dad_')) {
          const dadKey = id.replace('dad_', '');
          const realDad = memberMap.get(dadKey);
          if (realDad && realDad.userId !== id && currentUids.has(realDad.userId)) {
            currentUids.delete(id);
          }
        }
      }

      const finalUids = Array.from(currentUids);
      const isChanged = 
        finalUids.length !== (league.memberIds || []).length ||
        finalUids.some((id, idx) => id !== (league.memberIds || [])[idx]);

      if (isChanged) {
        try {
          await updateDoc(doc(db, 'leagues', league.id), {
            memberIds: finalUids
          });
          league.memberIds = finalUids;
          console.log(`[RosterSync] Updated roster for ${league.name}:`, finalUids);
        } catch (e) {
          console.warn(`[RosterSync] Notice updating memberIds for ${league.name}:`, e);
        }
      }
    }

    // 5. Explicitly ensure Nate's member document ONLY contains the Baseball league in leagueIds
    const nateMembers = existingMembers.filter(m => 
      m.userId.includes('nate') ||
      (m.displayName || '').toLowerCase().includes('nate') ||
      (m.email || '').toLowerCase().includes('nate')
    );

    for (const nate of nateMembers) {
      const correctLeagueIds = baseballLeague ? [baseballLeague.id] : [];
      const currentIdsSorted = [...(nate.leagueIds || [])].sort();
      const correctIdsSorted = [...correctLeagueIds].sort();

      const needsNateUpdate = 
        currentIdsSorted.length !== correctIdsSorted.length ||
        currentIdsSorted.some((id, idx) => id !== correctIdsSorted[idx]);

      if (needsNateUpdate) {
        try {
          console.log(`[RosterSync] Setting Nate's leagueIds to ONLY Baseball:`, correctLeagueIds);
          await updateDoc(doc(db, 'members', nate.userId), {
            leagueIds: correctLeagueIds
          });
          nate.leagueIds = correctLeagueIds;
        } catch (e) {
          console.warn(`[RosterSync] Notice updating Nate's leagueIds:`, e);
        }
      }
    }

    lastSyncTimestamp = Date.now();
  } catch (err) {
    console.warn("[RosterSync] Notice during league roster sync:", err);
  } finally {
    syncInProgress = false;
  }
}
