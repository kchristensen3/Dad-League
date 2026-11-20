import { Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import type { UserSummary } from "../../../shared/schemas";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm",
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70", className)}>{children}</div>;
}

const AVATAR_COLORS = ["bg-brand-500", "bg-amber-500", "bg-emerald-600", "bg-rose-500", "bg-violet-500", "bg-sky-600"];
export function Avatar({ user, size = 32 }: { user: Pick<UserSummary, "name" | "avatarUrl" | "id">; size?: number }) {
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const color = AVATAR_COLORS[[...user.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-full object-cover ring-2 ring-white"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white", color)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ users, max = 5 }: { users: UserSummary[]; max?: number }) {
  return (
    <div className="flex -space-x-2">
      {users.slice(0, max).map((u) => (
        <Avatar key={u.id} user={u} size={28} />
      ))}
      {users.length > max && (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 ring-2 ring-white">
          +{users.length - max}
        </span>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cx("flex justify-center py-10 text-brand-500", className)}>
      <Loader2 className="animate-spin" />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl bg-white px-6 py-12 text-center ring-1 ring-slate-200/70"
    >
      <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-brand-100 blur-3xl" aria-hidden />
      <motion.div
        className="relative mb-1 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-500"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {icon}
      </motion.div>
      <p className="relative text-lg font-black tracking-tight text-slate-800">{title}</p>
      {children && <div className="relative max-w-xs text-sm text-slate-500">{children}</div>}
    </motion.div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

/** Bottom sheet on phones, centered dialog on wider screens. Springs in, fades out. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  // Portaled to <body> so page-transition transforms can't trap the fixed overlay.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="pb-safe relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-3xl"
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="mx-auto -mt-2 mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tight">{title}</h2>
              <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const inputCls =
  "w-full rounded-xl border-0 bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none";

/**
 * A labeled form field. Pass `group` for composite controls (e.g. a search box with a suggestion
 * list): those get a div with aria-labelledby instead of a wrapping <label>.
 */
export function Field({ label, hint, children, group }: { label: string; hint?: string; children: ReactNode; group?: boolean }) {
  const id = useId();
  const Wrapper = group ? "div" : "label";
  return (
    <Wrapper className="block space-y-1" {...(group ? { role: "group", "aria-labelledby": id } : {})}>
      <span id={id} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </Wrapper>
  );
}

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} {...p} className={cx(inputCls, "resize-none", p.className)} />
);
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600", className)}>
      {children}
    </span>
  );
}

/** Renders text with links, @mentions and #topics highlighted. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|@[\p{L}][\p{L}'-]*(?: [\p{Lu}][\p{L}'-]*)?|#[\w-]+)/gu);
  return (
    <span className={cx("whitespace-pre-wrap break-words", className)}>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {p}
          </a>
        ) : p.startsWith("@") || p.startsWith("#") ? (
          <span key={i} className="font-semibold text-brand-600">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </span>
  );
}
