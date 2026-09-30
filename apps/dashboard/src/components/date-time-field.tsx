import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import {
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@lexmount.com/abyss-ui";
import { useI18n } from "@/hooks/use-i18n";
import { toDateTimeLocalInputValue } from "@/lib/time-range";
import { cn } from "@/lib/utils";

interface DateTimeFieldProps {
  id?: string;
  /** Local date-time in `YYYY-MM-DDTHH:mm` form. */
  value: string;
  onChange: (value: string) => void;
}

const textPattern = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})\s*$/;

/**
 * Minute-precision date-time input. Users can type `YYYY-MM-DD HH:mm` or pick
 * a day and type the time in the popover; the native `datetime-local` picker
 * only lets people step hours and minutes with the arrow keys.
 */
export function DateTimeField({ id, value, onChange }: DateTimeFieldProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(() => toDisplayText(value));
  const selected = parseLocalDateTime(value);

  React.useEffect(() => {
    setText(toDisplayText(value));
  }, [value]);

  const commitText = (): void => {
    const parsed = parseDisplayText(text);
    if (parsed) {
      onChange(toDateTimeLocalInputValue(parsed));
      setText(toDisplayText(toDateTimeLocalInputValue(parsed)));
    } else {
      setText(toDisplayText(value));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative min-w-0">
          <Input
            id={id}
            value={text}
            inputMode="numeric"
            placeholder="YYYY-MM-DD HH:mm"
            className="pr-7 pl-2.5 text-[13px] tabular-nums md:text-[13px]"
            onChange={(event) => {
              setText(event.target.value);
              const parsed = parseDisplayText(event.target.value);
              if (parsed) {
                onChange(toDateTimeLocalInputValue(parsed));
              }
            }}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitText();
              }
            }}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("dateTime.openPicker")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-0.5 transition-colors"
            >
              <CalendarDays className="size-4" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto rounded-xl p-0 shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DateTimePanel
          value={selected ?? roundedNow()}
          onChange={(next) => onChange(toDateTimeLocalInputValue(next))}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function DateTimePanel({
  value,
  onChange,
  onDone,
}: {
  value: Date;
  onChange: (value: Date) => void;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [month, setMonth] = React.useState(
    () => new Date(value.getFullYear(), value.getMonth(), 1),
  );
  const cells = React.useMemo(() => calendarCells(month), [month]);
  const weekdays = React.useMemo(() => weekdayLabels(locale), [locale]);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
  }).format(month);
  const today = new Date();

  const withDate = (day: Date): Date =>
    new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      value.getHours(),
      value.getMinutes(),
    );
  const withTime = (hour: number, minute: number): Date =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate(), hour, minute);
  const shiftMonth = (delta: number): void =>
    setMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );

  return (
    <div className="w-[16.25rem] p-3">
      <div className="flex h-8 items-center justify-between pl-1.5">
        <span className="text-sm font-semibold tracking-tight">{monthLabel}</span>
        <div className="flex items-center">
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent hover:text-foreground mr-1 h-7 rounded-md px-2 text-xs font-medium transition-colors"
            onClick={() => {
              const now = roundedNow();
              onChange(now);
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            {t("dateTime.now")}
          </button>
          <NavButton label={t("dateTime.previousMonth")} onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="size-4" />
          </NavButton>
          <NavButton label={t("dateTime.nextMonth")} onClick={() => shiftMonth(1)}>
            <ChevronRight className="size-4" />
          </NavButton>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-7">
        {weekdays.map((weekday, index) => (
          <span
            key={index}
            className="text-muted-foreground flex h-7 items-center justify-center text-[11px] font-medium"
          >
            {weekday}
          </span>
        ))}
        {cells.map((day, index) => {
          if (!day) {
            return <span key={`blank-${index}`} aria-hidden="true" />;
          }
          const isSelected = sameDay(day, value);
          const isToday = sameDay(day, today);
          return (
            <button
              key={day.getDate()}
              type="button"
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "mx-auto my-px flex size-8 items-center justify-center rounded-lg text-[13px] tabular-nums transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-accent",
                isToday && !isSelected && "text-ring font-semibold",
              )}
              onClick={() => onChange(withDate(day))}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      {/* Changes apply as they are made, so the time row has no confirm
          button; Enter or clicking outside closes the panel. */}
      <div className="mt-3 flex items-center gap-3 border-t pt-3">
        <span className="text-muted-foreground pl-1.5 text-xs">
          {t("dateTime.time")}
        </span>
        <TimeSegments
          hour={value.getHours()}
          minute={value.getMinutes()}
          label={t("dateTime.time")}
          onChange={(hour, minute) => onChange(withTime(hour, minute))}
          onDone={onDone}
        />
      </div>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Hour and minute as two segments inside one input-like field. Type the
 * digits (two hour digits, ":" or → move to the minutes), step with the arrow
 * keys, or scroll the mouse wheel over a segment.
 */
function TimeSegments({
  hour,
  minute,
  label,
  onChange,
  onDone,
}: {
  hour: number;
  minute: number;
  label: string;
  onChange: (hour: number, minute: number) => void;
  onDone: () => void;
}) {
  const hourRef = React.useRef<HTMLInputElement>(null);
  const minuteRef = React.useRef<HTMLInputElement>(null);

  return (
    <div
      role="group"
      aria-label={label}
      className="border-input focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 flex h-9 flex-1 cursor-text items-center justify-center rounded-md border bg-transparent text-base font-medium tabular-nums shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]"
      onMouseDown={(event) => {
        // Clicking the field's padding lands on the hours.
        if (event.target === event.currentTarget) {
          event.preventDefault();
          hourRef.current?.focus();
        }
      }}
    >
      <Segment
        ref={hourRef}
        value={hour}
        max={23}
        ariaLabel={`${label} HH`}
        onChange={(next) => onChange(next, minute)}
        onNext={() => minuteRef.current?.focus()}
        onEnter={onDone}
      />
      <span className="text-muted-foreground px-1">:</span>
      <Segment
        ref={minuteRef}
        value={minute}
        max={59}
        ariaLabel={`${label} mm`}
        onChange={(next) => onChange(hour, next)}
        onPrevious={() => hourRef.current?.focus()}
        onEnter={onDone}
      />
    </div>
  );
}

function Segment({
  ref,
  value,
  max,
  ariaLabel,
  onChange,
  onNext,
  onPrevious,
  onEnter,
}: {
  ref?: React.Ref<HTMLInputElement>;
  value: number;
  max: number;
  ariaLabel: string;
  onChange: (value: number) => void;
  /** Moves focus to the following segment. */
  onNext?: () => void;
  /** Moves focus to the preceding segment. */
  onPrevious?: () => void;
  onEnter: () => void;
}) {
  const [text, setText] = React.useState(pad2(value));
  const editing = React.useRef(false);
  const step = (delta: number): void => {
    const next = (value + delta + max + 1) % (max + 1);
    setText(pad2(next));
    onChange(next);
  };

  // Mirror outside changes (day clicks, "now") without reformatting the
  // digits someone is typing.
  React.useEffect(() => {
    if (!editing.current) {
      setText(pad2(value));
    }
  }, [value]);

  return (
    <input
      ref={ref}
      value={text}
      inputMode="numeric"
      maxLength={2}
      aria-label={ariaLabel}
      className="hover:bg-accent focus:bg-accent w-8 rounded-sm bg-transparent py-0.5 text-center outline-none"
      onFocus={(event) => {
        editing.current = true;
        event.target.select();
      }}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 2);
        setText(digits);
        const next = Number(digits);
        if (digits.length > 0 && next <= max) {
          onChange(next);
          if (digits.length === 2) {
            onNext?.();
          }
        }
      }}
      onBlur={() => {
        editing.current = false;
        setText(pad2(value));
      }}
      onWheel={(event) => {
        if (event.deltaY !== 0) {
          step(event.deltaY < 0 ? 1 : -1);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          step(event.key === "ArrowUp" ? 1 : -1);
        } else if (
          onNext &&
          (event.key === ":" || event.key === "ArrowRight" || event.key === "Tab") &&
          !event.shiftKey
        ) {
          event.preventDefault();
          onNext();
        } else if (
          onPrevious &&
          (event.key === "ArrowLeft" ||
            (event.key === "Backspace" && text.length === 0) ||
            (event.key === "Tab" && event.shiftKey))
        ) {
          event.preventDefault();
          onPrevious();
        } else if (event.key === "Enter") {
          event.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function toDisplayText(value: string): string {
  return value.replace("T", " ");
}

function parseDisplayText(text: string): Date | undefined {
  const match = textPattern.exec(text);
  if (!match) {
    return undefined;
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    hour < 24 &&
    minute < 60;
  return valid ? date : undefined;
}

function parseLocalDateTime(value: string): Date | undefined {
  return parseDisplayText(toDisplayText(value));
}

function roundedNow(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

/** Monday-first cells for the month, with blanks before the first day. */
function calendarCells(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1),
    ),
  ];
}

function weekdayLabels(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(2024, 0, 1 + index)),
  );
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
