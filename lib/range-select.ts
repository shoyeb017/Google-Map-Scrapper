import { useRef } from "react";

/**
 * Ids between anchor and target (inclusive) following list order.
 * Falls back to just the target when there is no usable anchor.
 */
export function rangeBetween(ids: string[], anchorId: string | null, targetId: string): string[] {
  if (!anchorId || anchorId === targetId) return [targetId];
  const a = ids.indexOf(anchorId);
  const b = ids.indexOf(targetId);
  if (a === -1 || b === -1) return [targetId];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return ids.slice(lo, hi + 1);
}

const RANGE_TITLE = "Select — Shift+click to select a range";
export { RANGE_TITLE as rangeSelectTitle };

/** Live Shift state from the underlying DOM event, when it carries one. */
function liveShift(e: { nativeEvent?: unknown }): boolean | undefined {
  const ne = e?.nativeEvent as { shiftKey?: unknown } | null | undefined;
  return typeof ne?.shiftKey === "boolean" ? ne.shiftKey : undefined;
}

/**
 * Shift+click range selection over an ordered id list backed by a Set.
 *
 * Plain click toggles the single row. Shift+click adds/removes the whole
 * anchor..target range (following the clicked row's toggle direction),
 * then moves the anchor to the clicked row — the same shortcut as Gmail
 * and file explorers.
 *
 * Checkbox wiring note: React dispatches a checkbox's onChange before its
 * onClick (both derive from the same native click), so reading Shift in
 * onClick is always too late. Instead the Shift state is captured on
 * pointer/keydown (which strictly precede the click) AND read live from
 * the change event's nativeEvent when available. Wire row checkboxes with
 * the `box()` spread so every site behaves identically:
 *
 *   <input type="checkbox" checked={...} aria-label={...} className={...}
 *     {...range.box(id, orderedIds, selected, setSelected)} />
 */
export function useRangeSelect() {
  const anchor = useRef<string | null>(null);
  const shift = useRef(false);

  function captureShift(e: { shiftKey: boolean }) {
    shift.current = e.shiftKey;
  }

  function reset() {
    anchor.current = null;
    shift.current = false;
  }

  function toggle(
    id: string,
    orderedIds: string[],
    selected: Set<string>,
    setSelected: (next: Set<string>) => void,
    e?: { nativeEvent?: unknown }
  ) {
    // Live modifier wins; captured pointer/key state is the fallback.
    const useRange = (e ? liveShift(e) : undefined) ?? shift.current;
    shift.current = false;
    if (
      useRange &&
      anchor.current &&
      anchor.current !== id &&
      orderedIds.includes(anchor.current) &&
      orderedIds.includes(id)
    ) {
      const range = rangeBetween(orderedIds, anchor.current, id);
      const next = new Set(selected);
      if (selected.has(id)) range.forEach((r) => next.delete(r));
      else range.forEach((r) => next.add(r));
      setSelected(next);
    } else {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelected(next);
    }
    anchor.current = id;
  }

  /** Props spread for a range-selectable row checkbox. */
  function box(
    id: string,
    orderedIds: string[],
    selected: Set<string>,
    setSelected: (next: Set<string>) => void
  ) {
    return {
      onMouseDown: captureShift,
      onKeyDown: captureShift,
      onClick: captureShift,
      onChange: (e: { nativeEvent?: unknown }) => toggle(id, orderedIds, selected, setSelected, e),
      title: RANGE_TITLE,
    };
  }

  return { captureShift, reset, toggle, box };
}
