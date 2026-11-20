import { Trophy } from "lucide-react";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow"
      style={{ width: size, height: size }}
    >
      <Trophy size={size * 0.5} className="rotate-3" />
    </span>
  );
}
