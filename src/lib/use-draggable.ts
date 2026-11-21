// Lets a fixed button be carried with a finger or cursor. A small movement still counts as a tap. The spot is kept per
// device as a distance from the bottom-right corner, and is pulled back on screen when the screen or interface size changes.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";

const TAP_SLOP = 6, EDGE = 4;
type Spot = { right: number; bottom: number };

/** The button sits directly on <body>, so only the page's own zoom scales it. */
const pageZoom = () => Number(getComputedStyle(document.documentElement).getPropertyValue("--ui-zoom")) || 1;

const read = (key: string): Spot | null => {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? "null") as Spot | null;
    return s && Number.isFinite(s.right) && Number.isFinite(s.bottom) ? s : null;
  } catch { return null; }
};

export function useDraggable(key: string, onTap: () => void) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const size = useRef({ w: 64, h: 64 });
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const moved = useRef(false);

  const inside = useCallback((s: Spot): Spot => {
    const { w, h } = size.current;
    return {
      right: Math.round(Math.min(Math.max(EDGE, s.right), Math.max(EDGE, window.innerWidth - w - EDGE))),
      bottom: Math.round(Math.min(Math.max(EDGE, s.bottom), Math.max(EDGE, window.innerHeight - h - EDGE))),
    };
  }, []);

  useEffect(() => {
    setSpot(read(key));
    const refit = () => setSpot((s) => (s ? inside(s) : s));
    window.addEventListener("resize", refit);
    window.addEventListener("shopbook-prefs", refit);
    return () => { window.removeEventListener("resize", refit); window.removeEventListener("shopbook-prefs", refit); };
  }, [key, inside]);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    size.current = { w: box.width, h: box.height };
    drag.current = { x: e.clientX, y: e.clientY, left: box.left, top: box.top, moved: false };
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    d.moved = true;
    moved.current = true;
    const { w, h } = size.current;
    setSpot(inside({ right: window.innerWidth - (d.left + dx) - w, bottom: window.innerHeight - (d.top + dy) - h }));
  };
  const finish = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) setSpot((s) => { if (s) { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* the spot just isn't remembered */ } } return s; });
  };
  const onClick = (e: MouseEvent<HTMLElement>) => {
    if (moved.current) { e.preventDefault(); moved.current = false; return; }
    onTap();
  };

  // Stored distances are screen pixels; CSS offsets are multiplied by the page's zoom.
  const style: CSSProperties | undefined = spot ? { right: spot.right / pageZoom(), bottom: spot.bottom / pageZoom() } : undefined;
  return { style, onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onClick };
}
