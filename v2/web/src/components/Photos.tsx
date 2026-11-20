import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Photo } from "../../../shared/schemas";
import { api } from "../api";
import { celebrate } from "../fx";
import { useLeague, useMe } from "../hooks";
import { Avatar, ErrorNote, Spinner, cx } from "./ui";

/** Full-screen viewer with swipe/arrow navigation. */
export function Lightbox({ photos, index, onClose, onDelete }: { photos: Photo[]; index: number; onClose: () => void; onDelete?: (p: Photo) => void }) {
  const [i, setI] = useState(index);
  const photo = photos[i];
  const go = (d: number) => setI((x) => (x + d + photos.length) % photos.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });
  if (!photo) return null;
  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Photo viewer"
    >
      <div className="pt-safe flex items-center gap-3 px-4 py-3">
        <Avatar user={photo.uploader} size={28} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-semibold">{photo.uploader.name}</p>
          <p className="truncate text-xs text-white/60">{photo.eventTitle}</p>
        </div>
        {onDelete && (
          <button onClick={() => onDelete(photo)} className="rounded-full p-2 text-white/70 hover:bg-white/10" aria-label="Delete photo">
            <Trash2 size={18} />
          </button>
        )}
        <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
          <X size={22} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.img
            key={photo.id}
            src={photo.fullUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            drag={photos.length > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => Math.abs(info.offset.x) > 80 && go(info.offset.x < 0 ? 1 : -1)}
          />
        </AnimatePresence>
        {photos.length > 1 && (
          <>
            <button onClick={() => go(-1)} className="absolute left-2 hidden rounded-full bg-white/10 p-2 hover:bg-white/20 sm:block" aria-label="Previous">
              <ChevronLeft />
            </button>
            <button onClick={() => go(1)} className="absolute right-2 hidden rounded-full bg-white/10 p-2 hover:bg-white/20 sm:block" aria-label="Next">
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      <p className="pb-safe py-3 text-center text-xs text-white/50">
        {i + 1} / {photos.length}
      </p>
    </motion.div>,
    document.body,
  );
}

export function PhotoSection({ leagueId, eventId, eventStarted }: { leagueId: string; eventId: string; eventStarted: boolean }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const league = useLeague(leagueId);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const key = ["photos", leagueId, eventId];
  const q = useQuery({ queryKey: key, queryFn: () => api.photos(leagueId, eventId) });
  const upload = useMutation({
    mutationFn: (files: File[]) => api.uploadPhotos(leagueId, eventId, files),
    onSuccess: (photos) => {
      qc.setQueryData(key, { photos, enabled: true });
      void qc.invalidateQueries({ queryKey: ["event", leagueId, eventId] });
      celebrate(input.current?.parentElement, "small");
    },
  });
  const remove = useMutation({
    mutationFn: (p: Photo) => api.deletePhoto(leagueId, p.id),
    onSuccess: () => {
      setOpen(null);
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  if (q.isLoading) return <Spinner className="py-4" />;
  const photos = q.data?.photos ?? [];
  if (!q.data?.enabled && photos.length === 0) return null;
  const canDelete = (p: Photo) => p.uploader.id === me?.id || league.data?.role === "owner";

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Photos{photos.length ? ` · ${photos.length}` : ""}</h2>
        {q.data?.enabled && (
          <button
            onClick={() => input.current?.click()}
            disabled={upload.isPending}
            className="flex items-center gap-1 text-sm font-semibold text-brand-600 disabled:opacity-50"
          >
            <ImagePlus size={16} /> {upload.isPending ? "Uploading…" : "Add photos"}
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])].slice(0, 10);
            if (files.length) upload.mutate(files);
            e.target.value = "";
          }}
        />
      </div>
      <ErrorNote error={upload.error ?? remove.error} />
      {photos.length === 0 ? (
        <button
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-slate-200 bg-white py-6 text-sm text-slate-500 hover:border-brand-300"
        >
          <Camera className="text-brand-400" />
          {eventStarted ? "How'd it go? Add a few photos for the season recap." : "Photos from the day will show up here."}
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p, idx) => (
            <motion.button
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(idx, 9) * 0.03 }}
              onClick={() => setOpen(idx)}
              className={cx("aspect-square overflow-hidden rounded-xl bg-slate-200", idx === 0 && photos.length > 4 && "col-span-2 row-span-2")}
            >
              <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover transition hover:scale-105" />
            </motion.button>
          ))}
        </div>
      )}
      <AnimatePresence>
        {open !== null && (
          <Lightbox
            photos={photos}
            index={open}
            onClose={() => setOpen(null)}
            onDelete={(p) => canDelete(p) && confirm("Delete this photo?") && remove.mutate(p)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
