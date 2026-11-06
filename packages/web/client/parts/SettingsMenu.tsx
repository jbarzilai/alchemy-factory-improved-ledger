import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@design/components';

export function SettingsMenu({ onCustomizeFlags }: { onCustomizeFlags: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const id = useId();
  function focusGear() { root.current?.querySelector('button')?.focus(); }
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={root} className="relative" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); focusGear();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); setOpen(true); item.current?.focus();
    }
  }}>
    <Button variant="ghost" size="sm" aria-label="Settings" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="m9 3-.6 2.4-2 .9L4.2 5.6 2 9.4 3.8 11v2L2 14.6l2.2 3.8 2.2-.7 2 .9L9 21h6l.6-2.4 2-.9 2.2.7 2.2-3.8-1.8-1.6v-2L22 9.4l-2.2-3.8-2.2.7-2-.9L15 3Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </Button>
    {open && <div id={id} role="menu" aria-label="Settings" className="absolute right-0 top-full z-10 mt-1 min-w-max rounded-md border border-line bg-panel p-1 shadow-popover">
      <button ref={item} type="button" role="menuitem" className="type-body block w-full rounded-sm px-3 py-2 text-left text-ink hover:bg-raised" onClick={() => {
        focusGear(); setOpen(false); onCustomizeFlags();
      }}>Customize flags</button>
    </div>}
  </div>;
}
