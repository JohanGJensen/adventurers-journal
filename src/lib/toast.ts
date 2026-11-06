// A tiny global toast queue: call toast() from anywhere, render <Toasts /> once.
export interface ToastMsg {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

let items: ToastMsg[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, tone: ToastMsg['tone'] = 'info', ms = 4000) {
  const id = next++;
  items = [...items, { id, text, tone }];
  emit();
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toastStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => items,
};
