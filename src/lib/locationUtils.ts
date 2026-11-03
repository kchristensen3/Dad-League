/**
 * Utility functions for Google Maps and venue/establishment location formatting.
 */

/**
 * Formats a Google Maps PlaceResult to always preserve and highlight the establishment/venue name
 * (e.g. bar, restaurant, golf course, park) along with its address, rather than just showing a street address.
 */
export function formatGooglePlaceLocation(place: any): string {
  if (!place) return '';

  const name = typeof place.name === 'string' ? place.name.trim() : '';
  const address = typeof place.formatted_address === 'string' ? place.formatted_address.trim() : '';

  if (name && address) {
    // If the name is merely a street number or already part of the street address start
    const isJustStreetNumber = /^\d+$/.test(name);
    if (isJustStreetNumber || address.toLowerCase().startsWith(name.toLowerCase())) {
      return address;
    }
    // Highlight venue/establishment name first, followed by address
    return `${name} (${address})`;
  }

  return name || address || '';
}

/**
 * Parses any location string into separate venue/place name and street address components.
 * Supports patterns like "Topgolf (1050 N 1000 W)", "HopCat • 4200 Woodward Ave",
 * "Ford Field - 2000 Brush St", raw venue names ("Topgolf"), or raw addresses.
 */
export function parseLocationDisplay(locationStr?: string): { 
  venueName: string; 
  address: string; 
  hasVenue: boolean;
  fullLocation: string;
} {
  if (!locationStr) {
    return { venueName: '', address: '', hasVenue: false, fullLocation: '' };
  }

  const str = locationStr.trim();
  if (!str) {
    return { venueName: '', address: '', hasVenue: false, fullLocation: '' };
  }

  // Format 1: "Venue Name (Address, City, State)"
  const parenMatch = str.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    const venue = parenMatch[1].trim();
    const addr = parenMatch[2].trim();
    const isVenueStreetNum = /^\d+$/.test(venue);
    if (!isVenueStreetNum && venue.length > 0) {
      return { venueName: venue, address: addr, hasVenue: true, fullLocation: str };
    }
    return { venueName: '', address: addr || venue, hasVenue: false, fullLocation: str };
  }

  // Format 2: "Venue Name • Address"
  if (str.includes('•')) {
    const parts = str.split('•');
    const venue = parts[0].trim();
    const addr = parts.slice(1).join('•').trim();
    if (venue && !/^\d+$/.test(venue)) {
      return { venueName: venue, address: addr, hasVenue: true, fullLocation: str };
    }
  }

  // Format 3: "Venue Name - Address" (with at least 2 characters for venue and address)
  const dashMatch = str.match(/^([^-–—]{2,})\s*[-–—]\s*(.{4,})$/);
  if (dashMatch) {
    const venue = dashMatch[1].trim();
    const addr = dashMatch[2].trim();
    if (venue && !/^\d+$/.test(venue)) {
      return { venueName: venue, address: addr, hasVenue: true, fullLocation: str };
    }
  }

  // Check if string begins with street address digits (e.g. "1234 Woodward Ave, Detroit, MI 48226")
  const isPureAddress = /^\d+\s+[A-Za-z0-9\s,.-]+(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|lane|ln|way|ct|court|hwy|highway|cir|circle|pkwy|parkway)/i.test(str);
  if (isPureAddress) {
    return { venueName: '', address: str, hasVenue: false, fullLocation: str };
  }

  // If it does not start with street number keywords, treat it as the venue/place name!
  return { venueName: str, address: '', hasVenue: true, fullLocation: str };
}

/**
 * Combines separate venue name and address into a standardized storage format.
 */
export function formatVenueAndAddress(venueName?: string, address?: string): string {
  const v = (venueName || '').trim();
  const a = (address || '').trim();

  if (v && a) {
    if (a.toLowerCase().startsWith(v.toLowerCase())) {
      return a;
    }
    return `${v} (${a})`;
  }
  return v || a || '';
}

/**
 * Ensures that when selecting an idea from the backlog, if the backlog item had only a street address
 * or if the title contains the venue name, we intelligently combine them so dads know what the place is.
 */
export function formatBacklogLocationForEvent(activityLocation?: string, activityTitle?: string): string {
  const loc = (activityLocation || '').trim();
  const title = (activityTitle || '').trim();

  if (!loc) {
    return '';
  }

  // If already formatted with venue name (e.g., "Topgolf (123 Main St)" or "Topgolf - 123 Main St")
  if (loc.includes('(') || loc.includes(' - ') || loc.includes('•')) {
    return loc;
  }

  // If location starts with a street number (e.g. "1050 S 500 W, Salt Lake City")
  const startsWithNumber = /^\d+\s+/.test(loc);
  if (startsWithNumber && title) {
    // If the activity title isn't a generic description (e.g. it is the venue name like "Red Rock Brewery" or "Topgolf")
    const isGenericTitle = /^(meetup|hangout|event|session|planning|catch up|weekly meetup)/i.test(title);
    if (!isGenericTitle) {
      return `${title} (${loc})`;
    }
  }

  return loc;
}
