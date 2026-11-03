export interface League {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  inviteTaps?: number;
  inviteJoins?: number;
}

export interface NotificationPreferences {
  enabled: boolean;
  messages: boolean;
  boardPosts: boolean;
  ideas: boolean;
  events: boolean;
}

export interface Member {
  userId: string;
  displayName: string;
  email: string;
  photoURL?: string;
  availability?: string;
  location?: string;
  interests?: string[];
  createdAt: string;
  leagueIds?: string[]; // Groups the user belongs to
  notificationPreferences?: NotificationPreferences;
}

export interface Activity {
  id: string;
  leagueId: string;
  title: string;
  description: string;
  category: string;
  location?: string;
  suggestedBy: string;
  suggestedByName?: string;
  suggestedDate?: string;
  votes: string[]; // User IDs
  createdAt: string;
  lastUpvotedAt?: string;
  archived?: boolean;
  archivedAt?: string;
  status?: 'active' | 'archived';
}

export interface Session {
  id: string;
  leagueId: string;
  date: string;
  activityId?: string;
  activityName: string;
  activityType: string;
  location?: string;
  description?: string;
  hostId: string;
  hostName: string;
  attendees: string[];
  declined: string[];
  status: 'planned' | 'completed' | 'cancelled';
  url?: string;
}

export interface Message {
  id: string;
  leagueId: string;
  senderId: string;
  senderName: string;
  text: string;
  threadId?: string; // empty or 'general' for main chat, else sessionId
  createdAt: any; // Firestore timestamp
}

export interface Post {
  id: string;
  leagueId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  title: string;
  content: string;
  imageUrl?: string;
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
  };
  createdAt: any;
  likes: string[]; // User IDs
}

export interface Comment {
  id: string;
  postId: string;
  leagueId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  createdAt: any;
}
