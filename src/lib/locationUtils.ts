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
  if (loc.includes('(') || loc.includes(' - ')) {
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
