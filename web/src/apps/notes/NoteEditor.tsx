import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Image as ImageIcon,
  PenLine,
  Share,
  Trash2,
  X,
} from "lucide-react";

import { useIosPush } from "@/hooks/useIosPush";
import { AlertDialog } from "@/ui/AlertDialog";
import { ShareSheet } from "@/shared/ShareSheet";
import { MediaPickerSheet } from "@/shared/MediaPickerSheet";
import { formatLastEdited, joinTitle, splitTitle, shareNote } from "./data";
import type { Note } from "./data";
import { SketchCanvas } from "./SketchCanvas";
import { t } from "@/i18n";
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

interface Props {
  note: Note;
  onBack: () => void;
  onChange: (next: Note) => void;
  onDelete: () => void;
  animateIn?: boolean;
}

export function NoteEditor({
  note,
  onBack,
  onChange,
  onDelete,
  animateIn = true,
}: Props) {
  const { goBack, pageStyle } = useIosPush(onBack, animateIn);

  const [body, setBody] = useState(note.body);
  const [sketches, setSketches] = useState<string[]>(note.sketches);
  const [images, setImages] = useState<string[]>(note.images ?? []);
  const [sketchIdx, setSketchIdx] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{
    kind: "photo" | "drawing";
    index: number;
  } | null>(null);
  const [preview, setPreview] = useState<{
    src: string;
    kind: "photo" | "drawing";
    index: number;
  } | null>(null);

  const { title, rest } = splitTitle(body);

  const lastBody = useRef(note.body);
  const lastSketches = useRef<string[]>(note.sketches);
  const lastImages = useRef<string[]>(note.images ?? []);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [rest]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (
        body === lastBody.current &&
        sameArray(sketches, lastSketches.current) &&
        sameArray(images, lastImages.current)
      )
        return;
      lastBody.current = body;
      lastSketches.current = sketches;
      lastImages.current = images;
      onChange({
        ...note,
        body,
        sketches,
        images,
        updatedAt: new Date().toISOString(),
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [body, sketches, images, note, onChange]);

  const live = useRef({ body, sketches, images });
  live.current = { body, sketches, images };
  useEffect(
    () => () => {
      const cur = live.current;
      if (
        cur.body === lastBody.current &&
        sameArray(cur.sketches, lastSketches.current) &&
        sameArray(cur.images, lastImages.current)
      )
        return;
      onChange({
        ...note,
        body: cur.body,
        sketches: cur.sketches,
        images: cur.images,
        updatedAt: new Date().toISOString(),
      });
      // Mount-only: refs hold the latest values, so the closure staleness is intentional.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const editingSketch =
    sketchIdx != null && sketchIdx >= 0 ? sketches[sketchIdx] : undefined;
  const isEmpty =
    body.length === 0 && sketches.length === 0 && images.length === 0;

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col bg-base text-black dark:text-white"
      style={pageStyle}
    >
      <StatusBarSpacer />

      <div className="flex items-center gap-2 px-2 pb-0.5 pt-4">
        <button
          type="button"
          onClick={goBack}
          className="flex shrink-0 items-center gap-0.5 text-ios-blue active:opacity-60"
        >
          <ChevronLeft className="h-[26px] w-[26px]" strokeWidth={2.5} />
          <span className="text-[19px]">{t("notes.appTitle", "Notes")}</span>
        </button>

        <input
          value={title}
          onChange={(e) =>
            setBody(joinTitle(e.target.value.replace(/\n/g, ""), rest))
          }
          placeholder={t("notes.newNote", "New Note")}
          aria-label={t("notes.noteTitleAria", "Note title")}
          className="min-w-0 flex-1 truncate bg-transparent text-center text-[19px] font-bold outline-none placeholder:font-semibold placeholder:text-ios-gray"
        />

        <div className="flex shrink-0 items-center gap-3 pr-1.5 text-ios-blue">
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={t("notes.attachPhoto", "Attach photo")}
            className="active:opacity-60"
          >
            <ImageIcon className="h-[24px] w-[24px]" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setSketchIdx(-1)}
            aria-label={t("notes.addSketch", "Add sketch")}
            className="active:opacity-60"
          >
            <PenLine className="h-[24px] w-[24px]" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
        <textarea
          ref={bodyRef}
          value={rest}
          onChange={(e) => setBody(joinTitle(title, e.target.value))}
          placeholder={t("notes.startWriting", "Start writing…")}
          className="mt-6 min-h-[200px] w-full resize-none bg-transparent text-[17px] leading-snug outline-none placeholder:text-ios-gray"
        />

        {images.length > 0 && (
          <div className="mt-1">
            <div className="pb-1 text-[12px] uppercase tracking-wider text-ios-gray">
              {t("notes.photos", "Photos")}
            </div>
            <div className="flex flex-wrap gap-2">
              {images.map((src, i) => (
                <div key={`${src}-${i}`} className="relative">
                  <button
                    type="button"
                    onClick={() => setPreview({ src, kind: "photo", index: i })}
                    aria-label={t("notes.viewPhoto", "View photo {n}", {
                      n: i + 1,
                    })}
                    className="block overflow-hidden rounded-[10px] active:opacity-80"
                    style={{ border: "0.5px solid rgba(0,0,0,0.18)" }}
                  >
                    <img
                      src={src}
                      alt={t("notes.attachmentAlt", "Attachment {n}", {
                        n: i + 1,
                      })}
                      className="block h-[110px] w-[110px] object-cover"
                      draggable={false}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingRemove({ kind: "photo", index: i })
                    }
                    aria-label={t("notes.removePhoto", "Remove photo")}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ios-red text-white shadow-md active:opacity-70"
                  >
                    <X className="h-[14px] w-[14px]" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {sketches.length > 0 && (
          <div className="mt-3">
            <div className="pb-1 text-[12px] uppercase tracking-wider text-ios-gray">
              {t("notes.drawings", "Drawings")}
            </div>
            <div className="flex flex-wrap gap-2">
              {sketches.map((src, i) => (
                <div key={i} className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setPreview({ src, kind: "drawing", index: i })
                    }
                    aria-label={t("notes.viewDrawing", "View drawing {n}", {
                      n: i + 1,
                    })}
                    className="block overflow-hidden rounded-[10px] active:opacity-70"
                    style={{ border: "0.5px solid rgba(0,0,0,0.18)" }}
                  >
                    <img
                      src={src}
                      alt={t("notes.drawingAlt", "Drawing {n}", { n: i + 1 })}
                      className="block h-[110px] w-[110px] object-cover"
                      style={{ background: "#fff" }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingRemove({ kind: "drawing", index: i })
                    }
                    aria-label={t("notes.removeDrawing", "Remove drawing")}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ios-red text-white shadow-md active:opacity-70"
                  >
                    <X className="h-[14px] w-[14px]" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isEmpty && (
          <div className="flex items-center justify-center gap-2 py-4 text-[13px] text-ios-gray">
            <Trash2 className="h-[14px] w-[14px]" />
            {t(
              "notes.emptyAutoRemove",
              "Empty notes are removed automatically when you leave.",
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between px-7 pb-14 pt-2">
        <button
          type="button"
          onClick={() => setConfirmDel(true)}
          aria-label={t("notes.deleteNote", "Delete note")}
          className="text-ios-blue active:opacity-60"
        >
          <Trash2 className="h-[31px] w-[31px]" strokeWidth={2} />
        </button>

        <span className="text-[17px] font-medium text-ios-gray">
          {t("notes.lastEdited", "Edited {date}", {
            date: formatLastEdited(note.updatedAt),
          })}
        </span>

        <button
          type="button"
          onClick={() => setSharing(true)}
          aria-label={t("notes.shareNote", "Share note")}
          className="text-ios-blue active:opacity-60"
        >
          <Share className="h-[31px] w-[31px]" strokeWidth={2} />
        </button>
      </div>

      {sketchIdx !== null && (
        <SketchCanvas
          initial={editingSketch}
          onSave={(png) => {
            if (sketchIdx === -1) {
              setSketches((s) => [...s, png]);
            } else {
              setSketches((s) => s.map((v, j) => (j === sketchIdx ? png : v)));
            }
            setSketchIdx(null);
          }}
          onCancel={() => setSketchIdx(null)}
        />
      )}

      {picking && (
        <MediaPickerSheet
          onSelect={(p) => {
            setImages((im) => [...im, p.url]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {sharing && (
        <ShareSheet
          onClose={() => setSharing(false)}
          onShare={(t) => shareNote({ body, sketches, images }, t.id)}
        />
      )}

      {preview && (
        <div
          className="absolute inset-0 z-[60] flex flex-col items-center justify-center px-4"
          style={{
            background: "rgba(0,0,0,0.92)",
            animation: "ios-sheet-backdrop-in 0.2s ease-out",
          }}
          onClick={() => setPreview(null)}
        >
          <img
            src={preview.src}
            alt=""
            className="max-h-[80%] max-w-full rounded-[8px] object-contain"
            style={
              preview.kind === "drawing" ? { background: "#fff" } : undefined
            }
          />
          {preview.kind === "drawing" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSketchIdx(preview.index);
                setPreview(null);
              }}
              className="mt-6 text-[15px] text-white/85 active:opacity-60"
            >
              {t("notes.editDrawing", "Edit Drawing")}
            </button>
          )}
        </div>
      )}

      {pendingRemove && (
        <AlertDialog
          title={
            pendingRemove.kind === "photo"
              ? t("notes.removePhotoTitle", "Remove Photo?")
              : t("notes.removeDrawingTitle", "Remove Drawing?")
          }
          message={t(
            "notes.removeAttachmentBody",
            "This {kind} will be removed from the note.",
            { kind: pendingRemove.kind },
          )}
          confirmLabel={t("notes.remove", "Remove")}
          cancelLabel={t("notes.cancel", "Cancel")}
          destructive
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            const { kind, index } = pendingRemove;
            if (kind === "photo")
              setImages((im) => im.filter((_, j) => j !== index));
            else setSketches((s) => s.filter((_, j) => j !== index));
            setPendingRemove(null);
          }}
        />
      )}

      {confirmDel && (
        <AlertDialog
          title={t("notes.deleteNoteTitle", "Delete Note?")}
          message={t(
            "notes.deleteNoteBody",
            "This note will be permanently deleted.",
          )}
          confirmLabel={t("notes.delete", "Delete")}
          cancelLabel={t("notes.cancel", "Cancel")}
          destructive
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            setConfirmDel(false);
            onDelete();
          }}
        />
      )}
    </div>
  );
}

function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
