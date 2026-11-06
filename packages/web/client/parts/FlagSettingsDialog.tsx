import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, Notice } from '@design/components';
import type { MetaResponse } from '../../shared/api';
import { putFlagSettings } from '../api';
import { FLAG_FIELDS, FLAG_GROUPS, parseDraft, setGroup, toDraft, type FlagErrors } from '../flagSettings';

export function FlagSettingsDialog({ meta, onClose, onSaved }: { meta: MetaResponse; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved] = useState(() => ({ ...meta.settings }));
  const [draft, setDraft] = useState(() => toDraft(meta.settings));
  const [errors, setErrors] = useState<FlagErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const id = useId();
  // Layout effect: its cleanup closes the dialog before React removes it, so the browser returns focus to the gear.
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  async function save() {
    if (sendingRef.current) return;
    const parsed = parseDraft(draft);
    if (!parsed.ok) { setErrors(parsed.errors); return; }
    setErrors({}); setFailure(null); setSending(true); sendingRef.current = true;
    try {
      await putFlagSettings(parsed.settings);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setSending(false); sendingRef.current = false;
      return;
    }
    onSaved(); onClose();
  }
  const defaults = toDraft(meta.flagDefaults);
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`} onCancel={event => {
    event.preventDefault(); onClose();
  }} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[42rem] overflow-y-auto rounded-lg border border-line bg-panel p-4 text-ink shadow-dialog backdrop:bg-bg/75">
    <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2 id={`${id}-title`} className="type-title">Customize flags</h2>
      <p id={`${id}-intro`} className="type-body">Flags point at things worth checking in the game. They don't change any numbers. Quests are never flagged, and the day in progress isn't checked.</p>
      {FLAG_GROUPS.map(group => {
        const switchKey = group.switch;
        const off = switchKey ? !draft[switchKey] : false;
        return <section key={group.id} aria-labelledby={`${id}-${group.id}`} className="flex flex-col gap-3 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id={`${id}-${group.id}`} className="type-heading">{group.heading}</h3>
            {switchKey && <Button size="sm" role="switch" aria-checked={draft[switchKey]} aria-label={`${group.heading} flags`} disabled={sending} onClick={() => {
              const on = !draft[switchKey];
              setDraft(current => setGroup(current, switchKey, on, saved));
              if (!on) setErrors(current => {
                const next = { ...current };
                for (const field of FLAG_FIELDS.filter(field => field.group === group.id)) delete next[field.key];
                return next;
              });
            }}>{off ? 'Off' : 'On'}</Button>}
          </div>
          {FLAG_FIELDS.filter(field => field.group === group.id).map(field => {
            const inputId = `${id}-${field.key}`;
            const suffix = field.unit === 'percent' ? '%' : field.unit === 'times' ? '×' : '';
            return <div key={field.key} className={off ? 'opacity-45' : undefined}>
              <label htmlFor={inputId} className="type-body">{field.before}{' '}
                <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                  <input id={inputId} name={field.key} type="text" inputMode="decimal" value={draft[field.key]} disabled={off || sending}
                    aria-invalid={!!errors[field.key]} aria-describedby={`${inputId}-default${errors[field.key] ? ` ${inputId}-error` : ''}`}
                    className={`type-body w-20 rounded-md border border-line-strong bg-raised px-2 py-1 text-ink disabled:pointer-events-none ${off ? '' : 'disabled:opacity-45'}`}
                    onChange={event => {
                      setDraft(current => ({ ...current, [field.key]: event.target.value }));
                      setErrors(current => ({ ...current, [field.key]: undefined }));
                    }} />{suffix}
                </span>{' '}{field.after}
              </label>
              <p id={`${inputId}-default`} className="type-small text-muted mt-1">Default {defaults[field.key]}{suffix}</p>
              {errors[field.key] && <p id={`${inputId}-error`} role="alert" className="type-small text-loss mt-1">{errors[field.key]}</p>}
            </div>;
          })}
        </section>;
      })}
      {failure && <div role="alert"><Notice>{failure}</Notice></div>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" disabled={sending} onClick={() => {
          setDraft(toDraft(meta.flagDefaults)); setErrors({}); setFailure(null);
        }}>Reset to defaults</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={sending}>Save</Button>
      </div>
    </form>
  </dialog>;
}
