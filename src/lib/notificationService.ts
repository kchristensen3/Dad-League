import { NotificationPreferences } from '../types';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  messages: true,
  boardPosts: true,
  ideas: true,
  events: true,
};

const STORAGE_KEY = 'dadleague_notification_preferences';

/**
 * Get notification preferences from localStorage with fallback to defaults.
 */
export function getStoredPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled ?? true,
      messages: parsed.messages ?? true,
      boardPosts: parsed.boardPosts ?? true,
      ideas: parsed.ideas ?? true,
      events: parsed.events ?? true,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/**
 * Save notification preferences to localStorage.
 */
export function saveStoredPreferences(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save notification preferences to localStorage:', e);
  }
}

/**
 * Check browser support and current permission status.
 */
export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Request notification permission from the browser.
 */
export async function requestDeviceNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Notification permission request error:', err);
    return 'denied';
  }
}

/**
 * Synthesize a gentle, pleasant notification chime via Web Audio API.
 * Does not rely on external MP3/WAV network requests.
 */
export function playNotificationChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Dual-tone chime: First note (D5, 587.33 Hz), Second note (A5, 880 Hz)
    const playTone = (freq: number, start: number, duration: number, gainVal: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(gainVal, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(587.33, now, 0.25, 0.12);
    playTone(880.00, now + 0.12, 0.35, 0.16);

    // Auto-close audio context after sound completes
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch {
    // Ignore audio autoplay restrictions gracefully
  }
}

export type NotificationCategory = 'messages' | 'boardPosts' | 'ideas' | 'events';

export interface SendDeviceNotificationOptions {
  body: string;
  category: NotificationCategory;
  tag?: string;
  url?: string;
  userPrefs?: NotificationPreferences | null;
  playSound?: boolean;
}

/**
 * Dispatches an alert to the user's device if allowed by settings and browser permission.
 * Returns true if notification was dispatched to the system/browser tray.
 */
export function sendDeviceNotification(
  title: string,
  options: SendDeviceNotificationOptions
): boolean {
  const prefs = options.userPrefs || getStoredPreferences();

  // If notifications are globally disabled or disabled for this specific category, bail out
  if (!prefs.enabled) return false;
  if (!prefs[options.category]) return false;

  // Play chime if requested
  if (options.playSound !== false) {
    playNotificationChime();
  }

  // Check if browser notifications are available and granted
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body: options.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: options.tag || options.category,
      });

      n.onclick = () => {
        window.focus();
        if (options.url) {
          window.location.hash = options.url;
        }
        n.close();
      };

      return true;
    } catch (e) {
      console.warn('System Notification dispatch failed:', e);
      return false;
    }
  }

  return false;
}
