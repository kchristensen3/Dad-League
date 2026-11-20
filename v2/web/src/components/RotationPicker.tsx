import { Repeat } from "lucide-react";
import type { Member } from "../../../shared/schemas";
import { Avatar, cx } from "./ui";

/** Choose who takes turns hosting, in order. Tapping toggles someone in or out (added to the end). */
export function RotationPicker({
  members,
  rotate,
  onRotateChange,
  chosen,
  onChosenChange,
  note,
}: {
  members: Member[];
  rotate: boolean;
  onRotateChange: (v: boolean) => void;
  chosen: string[];
  onChosenChange: (ids: string[]) => void;
  note?: string;
}) {
  const toggle = (id: string) => onChosenChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  return (
    <div className="space-y-2 rounded-2xl bg-brand-50 p-3">
      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-brand-800">
        <span className="flex items-center gap-1.5">
          <Repeat size={15} /> Rotate who hosts
        </span>
        <input type="checkbox" checked={rotate} onChange={(e) => onRotateChange(e.target.checked)} className="h-4 w-4 accent-brand-500" />
      </label>
      {rotate ? (
        <>
          <p className="text-xs text-brand-700">{note ?? "Hosts take turns in this order. Tap to include or skip someone."}</p>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const pos = chosen.indexOf(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  aria-pressed={pos >= 0}
                  className={cx(
                    "flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold ring-1 transition",
                    pos >= 0 ? "bg-white text-slate-800 ring-brand-300" : "bg-transparent text-slate-400 ring-slate-200 line-through",
                  )}
                >
                  <Avatar user={m} size={20} />
                  {pos >= 0 && <span className="text-brand-500">{pos + 1}.</span>}
                  {m.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-brand-700">Whoever set it up hosts every time.</p>
      )}
    </div>
  );
}
