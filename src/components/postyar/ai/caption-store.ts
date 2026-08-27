// =====================================================================
// POSTYAR — Global caption store (Zustand)
// ---------------------------------------------------------------------
// Used by the AI Caption view to hand a freshly generated caption to the
// Content Editor. When the user clicks «درج در محتوا», the Caption view
// writes to this store and navigates to /dashboard/content-editor. The
// editor's mount effect picks up the pending caption (if any), seeds the
// body textarea, and clears the slot.
//
// The store is intentionally minimal — a single slot for the caption,
// with a `consume()` action that atomically reads + clears it.
// =====================================================================
import { create } from "zustand";

export type PendingCaption = {
  text: string;
  hashtags?: string[];
  createdAt: number;
};

interface CaptionStore {
  pending: PendingCaption | null;
  set: (caption: PendingCaption) => void;
  consume: () => PendingCaption | null;
  clear: () => void;
}

export const useCaptionStore = create<CaptionStore>((set, get) => ({
  pending: null,
  set: (caption) => set({ pending: caption }),
  consume: () => {
    const v = get().pending;
    set({ pending: null });
    return v;
  },
  clear: () => set({ pending: null }),
}));
