import confetti from "canvas-confetti";
import type { Category } from "../../shared/schemas";

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A short confetti burst from an element (or the middle of the screen). Skipped for reduced motion. */
export function celebrate(from?: Element | null, intensity: "small" | "big" = "small") {
  if (reducedMotion()) return;
  const rect = from?.getBoundingClientRect();
  const origin = rect
    ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight }
    : { x: 0.5, y: 0.6 };
  const colors = ["#326273", "#65a1b7", "#e8913a", "#f6b352", "#10b981"];
  void confetti({
    particleCount: intensity === "big" ? 140 : 45,
    spread: intensity === "big" ? 100 : 60,
    startVelocity: intensity === "big" ? 45 : 28,
    scalar: 0.9,
    ticks: 120,
    origin,
    colors,
    disableForReducedMotion: true,
  });
}

/** Per-category emoji and colors, so events and ideas are recognizable at a glance. */
export const CATEGORY_STYLE: Record<Category, { emoji: string; chip: string; tile: string }> = {
  "Sports & Fitness": { emoji: "🏀", chip: "bg-orange-50 text-orange-700", tile: "from-orange-400 to-rose-500" },
  "Watch a Game": { emoji: "🏟️", chip: "bg-sky-50 text-sky-700", tile: "from-sky-500 to-brand-600" },
  "Food & Drink": { emoji: "🍔", chip: "bg-amber-50 text-amber-800", tile: "from-amber-400 to-orange-500" },
  Outdoors: { emoji: "🥾", chip: "bg-emerald-50 text-emerald-700", tile: "from-emerald-500 to-teal-600" },
  "Games & Trivia": { emoji: "🎲", chip: "bg-violet-50 text-violet-700", tile: "from-violet-500 to-indigo-600" },
  "Family Outing": { emoji: "🎡", chip: "bg-pink-50 text-pink-700", tile: "from-pink-400 to-rose-500" },
  "Helping Out": { emoji: "🛠️", chip: "bg-lime-50 text-lime-800", tile: "from-lime-500 to-emerald-600" },
  "Casual Hangout": { emoji: "🍻", chip: "bg-brand-50 text-brand-700", tile: "from-brand-400 to-brand-600" },
};

/** Shared entrance animation for list items: fade up, staggered by index. */
export const listItem = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: 0.25, delay: Math.min(i, 8) * 0.04 },
});
