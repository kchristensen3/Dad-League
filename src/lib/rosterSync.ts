import { User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDocs, 
  updateDoc, 
  setDoc, 
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

// Ensure all named test users exist in Firestore
export async function ensureMembersExist(
  currentMembers: Member[], 
  currentUser: User
): Promise<{ members: Member[]; memberMap: Map<string, Member> }> {
  const neededDads = [
    { key: 'jeff', name: 'Jeff', email: 'jeff@dadleague.app' },
    { key: 'collin', name: 'Collin', email: 'collin@dadleague.app' },
    { key: 'matt', name: 'Matt', email: 'matt@dadleague.app' },
    { key: 'nate', name: 'Nate', email: 'nate@dadleague.app' },
    { key: 'drew', name: 'Drew', email: 'drew@dadleague.app' }
  ];

  const updatedList = [...currentMembers];
  const memberMap = new Map<string, Member>();

  // Map currentUser
  let kyleMember = updatedList.find(m => m.userId === currentUser.uid || matchesDadName('me', m, currentUser));
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
      updatedList.push(kyleMember);
    } catch (e) {
      console.warn("Notice saving user profile:", e);
    }
  }
  memberMap.set('me', kyleMember);
  memberMap.set('kyle', kyleMember);

  for (const dad of neededDads) {
    let found = updatedList.find(m => matchesDadName(dad.key, m, currentUser));
    if (!found) {
      const generatedUid = `dad_${dad.key}`;
      found = {
        userId: generatedUid,
        displayName: dad.name,
        email: dad.email,
        photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${dad.name}`,
        createdAt: new Date().toISOString(),
        leagueIds: []
      };
      try {
        await setDoc(doc(db, 'members', generatedUid), found);
        updatedList.push(found);
      } catch (e) {
        console.warn(`Notice creating member doc for ${dad.name}:`, e);
      }
    }
    memberMap.set(dad.key, found);
  }

  return { members: updatedList, memberMap };
}

// Main sync routine: guarantees Architex, Baseball Crew, Detroit Dads have exact rosters
let syncInProgress = false;
let lastSyncTimestamp = 0;

export async function syncLeaguesAndRosters(
  existingLeagues: League[],
  existingMembers: Member[],
  currentUser: User
): Promise<void> {
  // Throttle to once every 10 seconds to prevent thrashing
  const now = Date.now();
  if (syncInProgress || (now - lastSyncTimestamp < 10000)) return;
  syncInProgress = true;

  try {
    const { members, memberMap } = await ensureMembersExist(existingMembers, currentUser);

    // Track league docs per def
    const leagueDocMap = new Map<string, League>();

    for (const def of LEAGUE_ROSTER_DEFS) {
      let league = existingLeagues.find(l => l.name.toLowerCase().includes(def.nameMatch));

      if (!league) {
        // Create the league if missing
        const targetUids = def.targetNames
          .map(n => memberMap.get(n)?.userId)
          .filter((uid): uid is string => Boolean(uid));

        const newLeagueData = {
          name: def.defaultName,
          description: def.defaultDesc,
          ownerId: currentUser.uid,
          memberIds: targetUids,
          inviteCode: def.inviteCode,
          createdAt: new Date().toISOString(),
          inviteTaps: 0,
          inviteJoins: targetUids.length
        };

        try {
          const docRef = await addDoc(collection(db, 'leagues'), newLeagueData);
          league = { id: docRef.id, ...newLeagueData };
          console.log(`Created league ${def.defaultName} with ID ${docRef.id}`);
        } catch (e) {
          console.warn(`Notice creating league ${def.defaultName}:`, e);
        }
      }

      if (league) {
        leagueDocMap.set(def.key, league);
      }
    }

    // Now enforce the exact roster on each league
    for (const def of LEAGUE_ROSTER_DEFS) {
      const league = leagueDocMap.get(def.key);
      if (!league) continue;

      const targetUids = def.targetNames
        .map(n => memberMap.get(n)?.userId)
        .filter((uid): uid is string => Boolean(uid));

      // Compare current memberIds vs targetUids
      const currentUidsSorted = [...(league.memberIds || [])].sort();
      const targetUidsSorted = [...targetUids].sort();

      const needsLeagueUpdate = 
        currentUidsSorted.length !== targetUidsSorted.length ||
        currentUidsSorted.some((id, idx) => id !== targetUidsSorted[idx]);

      if (needsLeagueUpdate) {
        console.log(`Aligning roster for ${league.name}:`, targetUids);
        try {
          await updateDoc(doc(db, 'leagues', league.id), {
            memberIds: targetUids
          });
          league.memberIds = targetUids;
        } catch (e) {
          console.warn(`Notice updating memberIds for ${league.name}:`, e);
        }
      }
    }

    // Now enforce member.leagueIds for each known member
    for (const member of members) {
      const targetLeagueIds: string[] = [];

      for (const def of LEAGUE_ROSTER_DEFS) {
        const league = leagueDocMap.get(def.key);
        if (!league) continue;

        const isMemberOfThisLeague = def.targetNames.some(nameKey => {
          const mappedMember = memberMap.get(nameKey);
          return mappedMember && mappedMember.userId === member.userId;
        });

        if (isMemberOfThisLeague) {
          targetLeagueIds.push(league.id);
        }
      }

      // If this member was found in our roster mapping, update their leagueIds
      const isKnownDad = Array.from(memberMap.values()).some(m => m.userId === member.userId);
      if (isKnownDad) {
        const curLeagueIdsSorted = [...(member.leagueIds || [])].sort();
        const targetLeagueIdsSorted = [...targetLeagueIds].sort();

        const needsMemberUpdate = 
          curLeagueIdsSorted.length !== targetLeagueIdsSorted.length ||
          curLeagueIdsSorted.some((id, idx) => id !== targetLeagueIdsSorted[idx]);

        if (needsMemberUpdate) {
          try {
            await updateDoc(doc(db, 'members', member.userId), {
              leagueIds: targetLeagueIds
            });
            member.leagueIds = targetLeagueIds;
          } catch (e) {
            console.warn(`Notice updating leagueIds for ${member.displayName}:`, e);
          }
        }
      }
    }

    lastSyncTimestamp = Date.now();
  } catch (err) {
    console.warn("Notice during league roster sync:", err);
  } finally {
    syncInProgress = false;
  }
}
