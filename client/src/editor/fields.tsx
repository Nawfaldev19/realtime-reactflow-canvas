import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatNumber, parseNumber } from "./properties";

// Form fields for the properties panel. Typing applies after 200ms of
// inactivity (or at once on blur and Enter), so a burst of keystrokes is one
// operation. While a field has focus, outside changes do not overwrite what
// the person is typing.

export const APPLY_DELAY = 200;

/** Calls `commit` with the latest scheduled value once input pauses for `delay` ms. */
export function useDebouncedCommit<T>(commit: (value: T) => void, delay = APPLY_DELAY) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) latest.current(next.value);
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => flush, [flush]);
  return { schedule, flush };
}

interface NumberFieldProps {
  readonly label: string;
  /** The shared value, or null when the selected nodes differ. */
  readonly value: number | null;
  readonly onCommit: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly suffix?: string;
}

export function NumberField({ label, value, onCommit, min, max, step = 1, suffix }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(formatNumber(value));
  const focused = useRef(false);
  const { schedule, flush } = useDebouncedCommit<number>((next) => {
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
    onCommit(clamped);
  });

  useEffect(() => {
    if (!focused.current) setText(formatNumber(value));
  }, [value]);

  return (
    <div className="prop-field">
      <label htmlFor={id}>{label}</label>
      <div className="prop-field__input">
        <input
          id={id}
          className="input input-compact"
          type="number"
          inputMode="decimal"
          value={text}
          placeholder={value === null ? "Mixed" : undefined}
          min={min}
          max={max}
          step={step}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            flush();
            setText(formatNumber(value));
          }}
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseNumber(event.target.value);
            if (parsed !== null) schedule(parsed);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") flush();
          }}
        />
        {suffix && <span className="prop-field__suffix">{suffix}</span>}
      </div>
    </div>
  );
}

interface ColorFieldProps {
  readonly label: string;
  readonly value: string | null;
  /** Shown in the picker when there is no value (the theme default). */
  readonly fallback: string;
  readonly onCommit: (value: string | null) => void;
}

/** A colour picker with a reset to the theme default. Only #rrggbb values can be shown by the picker. */
export function ColorField({ label, value, fallback, onCommit }: ColorFieldProps) {
  const id = useId();
  const { schedule } = useDebouncedCommit<string>(onCommit);
  const shown = value !== null && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return (
    <div className="prop-field prop-field--color">
      <label htmlFor={id}>{label}</label>
      <div className="prop-field__input">
        <input
          id={id}
          type="color"
          className="color-input"
          value={shown}
          onChange={(event) => schedule(event.target.value)}
        />
        <button
          type="button"
          className="button button-ghost button-small"
          disabled={value === null}
          onClick={() => onCommit(null)}
          aria-label={`Reset ${label.toLowerCase()}`}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  readonly label: string;
  readonly value: T | null;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onCommit: (value: T) => void;
}

export function SelectField<T extends string>({ label, value, options, onCommit }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="prop-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select input-compact"
        value={value ?? ""}
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value);
          if (next) onCommit(next.value);
        }}
      >
        {value === null && (
          <option value="" disabled>
            Mixed
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface RangeFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly marks?: readonly number[];
  readonly onCommit: (value: number) => void;
  readonly format?: (value: number) => string;
}

/** A slider that shows its value immediately and applies after input pauses. */
export function RangeField({ label, value, min, max, step = 1, marks, onCommit, format = String }: RangeFieldProps) {
  const id = useId();
  const listId = useId();
  const [shown, setShown] = useState(value);
  const { schedule } = useDebouncedCommit<number>(onCommit);
  useEffect(() => setShown(value), [value]);
  return (
    <div className="prop-field prop-field--range">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{format(shown)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        list={marks ? listId : undefined}
        onChange={(event) => {
          const next = Number(event.target.value);
          setShown(next);
          schedule(next);
        }}
      />
      {marks && (
        <datalist id={listId}>
          {marks.map((mark) => (
            <option key={mark} value={mark} />
          ))}
        </datalist>
      )}
    </div>
  );
}

export function PanelSection({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="prop-section" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
