// Drag a card or group by its grip (⠿) to another place in the list. Pointer events, so finger, mouse
// and pen work alike. While dragging, the item follows the pointer, the others slide aside to show the
// gap, and the page scrolls when the pointer is near the top or bottom edge. On release the new order
// of the visible items is handed to `onDrop`; game.ts saves it and redraws.

export type DragKind = 'facility' | 'cargo';

/** How close to the edge (px) the page starts to scroll, and how fast (px per frame). */
const EDGE = 90;
const SPEED = 14;
/** room for the fixed bottom navigation */
const NAV = 72;

export function enableDrag(root: HTMLElement, onDrop: (kind: DragKind, ids: string[]) => void) {
  root.addEventListener('pointerdown', (e) => {
    const grip = (e.target as Element).closest<HTMLElement>('[data-drag]');
    if (!grip || !root.contains(grip) || e.button > 0) return;
    const item = grip.closest<HTMLElement>('[data-drag-item]');
    const list = item?.parentElement;
    if (!item || !list) return;
    e.preventDefault();
    start(e, grip, item, list, grip.dataset.drag as DragKind);
  });

  function start(e: PointerEvent, grip: HTMLElement, item: HTMLElement, list: HTMLElement, kind: DragKind) {
    const items = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-drag-item]"));
    const from = items.indexOf(item);
    const rects = items.map((el) => el.getBoundingClientRect());
    const gap = rects.length > 1 ? Math.max(0, rects[1]!.top - rects[0]!.bottom) : 12;
    const shift = rects[from]!.height + gap;
    const startY = e.clientY;
    const startScroll = window.scrollY;
    let pointerY = e.clientY;
    let target = from;
    let raf = 0;

    grip.setPointerCapture(e.pointerId);
    item.classList.add('dragging');
    list.classList.add('drag-active');

    const layout = () => {
      const dy = pointerY - startY + (window.scrollY - startScroll);
      item.style.transform = `translateY(${dy}px)`;
      // the finger decides the slot: it passed the middle of every item counted here.
      // (Not the dragged item's centre – a tall group grabbed by its heading would lag far behind.)
      const finger = pointerY + window.scrollY;
      target = 0;
      rects.forEach((r, j) => {
        if (j !== from && r.top + startScroll + r.height / 2 < finger) target++;
      });
      items.forEach((el, j) => {
        if (j === from) return;
        const off = from < target && j > from && j <= target ? -shift : target < from && j >= target && j < from ? shift : 0;
        el.style.transform = off ? `translateY(${off}px)` : '';
      });
    };

    const tick = () => {
      const down = pointerY > window.innerHeight - NAV - EDGE;
      const up = pointerY < EDGE;
      if (up || down) {
        window.scrollBy(0, up ? -SPEED : SPEED);
        layout();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const move = (ev: PointerEvent) => {
      pointerY = ev.clientY;
      layout();
    };
    const end = (ev: PointerEvent) => {
      cancelAnimationFrame(raf);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      if (grip.hasPointerCapture(ev.pointerId)) grip.releasePointerCapture(ev.pointerId);
      item.classList.remove('dragging');
      list.classList.remove('drag-active');
      items.forEach((el) => (el.style.transform = ''));
      if (ev.type === 'pointerup' && target !== from) {
        const ids = items.map((el) => el.dataset.dragItem!);
        const [moved] = ids.splice(from, 1);
        ids.splice(target, 0, moved!);
        onDrop(kind, ids);
      }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }
}
