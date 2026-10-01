/** Browser chrome preferences only. Never serialize into the document. */
export const DIKW_PINS_KEY = 'dikw:toolbar-pins:v1';
export const PINNABLE_TOOLS = ['frame', 'link', 'brush', 'eraser', 'mindmap', 'media', 'template'] as const;
export function normalizePins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && (PINNABLE_TOOLS as readonly string[]).includes(id)))];
}
export function readPins(storage: Pick<Storage, 'getItem'>): string[] {
  try { const value = JSON.parse(storage.getItem(DIKW_PINS_KEY) ?? 'null'); return value?.version === 1 ? normalizePins(value.tools) : []; } catch { return []; }
}
export function movePin(pins: string[], id: string, before?: string): string[] {
  if (!(PINNABLE_TOOLS as readonly string[]).includes(id)) return pins;
  if (before === id) return pins;
  const next = pins.filter(p => p !== id);
  const index = before ? next.indexOf(before) : -1;
  next.splice(index < 0 ? next.length : index, 0, id);
  return next;
}
