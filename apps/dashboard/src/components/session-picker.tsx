import { useQuery } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";
import * as React from "react";
import { Input, Popover, PopoverContent, PopoverTrigger } from "@lexmount.com/abyss-ui";
import {
  listSessions,
  searchSessions,
  type SessionListItem,
  type SessionListQuery,
} from "@/api/usage";
import { FilterTrigger } from "@/components/filter-trigger";
import { useI18n } from "@/hooks/use-i18n";
import { agentDisplayName } from "@/lib/agents";
import { shortSessionId } from "@/lib/session-id";
import { cn } from "@/lib/utils";

const searchDebounceMs = 250;
const searchPageSize = 20;
const listPageSize = 50;

/** What the picker knows about a session; search hits carry fewer details. */
interface SessionChoice {
  sessionPk: string;
  sessionId: string;
  agentName: string;
  lastActivityAt: string;
  turns?: number;
  totalTokens?: number;
}

interface SessionPickerProps {
  value: string;
  onChange: (sessionId: string) => void;
  /** Filters the choices follow, so they match the rest of the dashboard. */
  scope: Pick<SessionListQuery, "from" | "to" | "agentName" | "provider" | "model">;
}

/**
 * Session filter combobox. Sessions read as "Agent · when" with their short ID,
 * turns, and tokens, most recently active first. A keyword filters them
 * locally and also runs the backend content search.
 */
export function SessionPicker({ value, onChange, scope }: SessionPickerProps) {
  const { t, locale, formatNumber } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  // Remembers the chosen session so the closed trigger can stay readable.
  const [chosen, setChosen] = React.useState<SessionChoice | null>(null);
  const debouncedKeyword = useDebouncedValue(keyword.trim(), searchDebounceMs);
  const listRef = React.useRef<HTMLDivElement>(null);
  const compactNumber = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumSignificantDigits: 3,
      }),
    [locale],
  );

  const listQuery = useQuery({
    queryKey: ["session-options", "list", scope],
    queryFn: () =>
      listSessions({
        from: scope.from,
        to: scope.to,
        agentName: scope.agentName || undefined,
        provider: scope.provider || undefined,
        model: scope.model || undefined,
        pageSize: listPageSize,
      }),
    enabled: open,
    staleTime: 30_000,
  });
  const searchQuery = useQuery({
    queryKey: ["session-options", "search", scope, debouncedKeyword],
    queryFn: () =>
      searchSessions({
        q: debouncedKeyword,
        from: scope.from,
        to: scope.to,
        agentName: scope.agentName || undefined,
        provider: scope.provider || undefined,
        model: scope.model || undefined,
        pageSize: searchPageSize,
      }),
    enabled: open && debouncedKeyword.length > 0,
    staleTime: 30_000,
  });

  const options = React.useMemo(() => {
    const needle = keyword.trim().toLocaleLowerCase();
    const listed = (listQuery.data?.items ?? [])
      .map(choiceFromListItem)
      .filter(
        (choice) =>
          needle.length === 0 ||
          choice.sessionId.toLocaleLowerCase().includes(needle) ||
          agentDisplayName(choice.agentName).toLocaleLowerCase().includes(needle),
      );
    if (needle.length === 0) {
      return listed;
    }
    const seen = new Set(listed.map((choice) => choice.sessionPk));
    const searched = (searchQuery.data?.items ?? [])
      .filter((item) => !seen.has(item.session_pk))
      .map<SessionChoice>((item) => ({
        sessionPk: item.session_pk,
        sessionId: item.session_id,
        agentName: item.agent_name,
        lastActivityAt: item.ended_at ?? item.started_at,
      }));
    return [...listed, ...searched];
  }, [keyword, listQuery.data, searchQuery.data]);

  // Index 0 is the "all sessions" entry; options follow it.
  const entryCount = options.length + 1;

  React.useEffect(() => {
    setActiveIndex(0);
  }, [keyword]);

  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const select = (choice: SessionChoice | null): void => {
    setChosen(choice);
    onChange(choice?.sessionId ?? "");
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % entryCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + entryCount) % entryCount);
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(activeIndex === 0 ? null : (options[activeIndex - 1] ?? null));
    }
  };

  const searching =
    keyword.trim().length > 0 &&
    (keyword.trim() !== debouncedKeyword || searchQuery.isFetching);
  const loading = listQuery.isLoading || searching;
  const selectedChoice =
    chosen?.sessionId === value
      ? chosen
      : options.find((choice) => choice.sessionId === value);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setKeyword("");
        }
      }}
    >
      <div className="relative min-w-0">
        <PopoverTrigger asChild>
          <FilterTrigger
            role="combobox"
            aria-expanded={open}
            aria-label={t("common.session")}
            title={value || undefined}
            hideChevron={Boolean(value)}
            className={cn(value && "pr-8")}
          >
            {!value
              ? t("common.all")
              : selectedChoice
                ? `${agentDisplayName(selectedChoice.agentName)} · ${shortDateTime(selectedChoice.lastActivityAt, locale)}`
                : shortSessionId(value)}
          </FilterTrigger>
        </PopoverTrigger>
        {value ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm p-0.5"
            aria-label={t("sessionPicker.clear")}
            onClick={() => select(null)}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-80 p-0"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <Input
            autoFocus
            value={keyword}
            maxLength={256}
            placeholder={t("sessionPicker.placeholder")}
            aria-label={t("sessionPicker.placeholder")}
            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-1">
          <PickerItem
            index={0}
            active={activeIndex === 0}
            selected={value === ""}
            onHover={setActiveIndex}
            onSelect={() => select(null)}
          >
            <span className="text-sm">{t("sessionPicker.all")}</span>
          </PickerItem>
          {options.map((choice, offset) => (
            <PickerItem
              key={choice.sessionPk}
              index={offset + 1}
              active={activeIndex === offset + 1}
              selected={value === choice.sessionId}
              title={choice.sessionId}
              onHover={setActiveIndex}
              onSelect={() => select(choice)}
            >
              <span className="truncate text-sm">
                <span className="font-medium">
                  {agentDisplayName(choice.agentName)}
                </span>
                <span className="text-muted-foreground">
                  {" · "}
                  {relativeTime(choice.lastActivityAt, locale)}
                </span>
              </span>
              <span className="text-muted-foreground truncate text-xs">
                <span className="font-mono">{shortSessionId(choice.sessionId)}</span>
                {choice.turns !== undefined
                  ? ` · ${t("sessionPicker.turns", { count: formatNumber(choice.turns) })}`
                  : ""}
                {choice.totalTokens !== undefined
                  ? ` · ${t("sessionPicker.tokens", { count: compactNumber.format(choice.totalTokens) })}`
                  : ""}
              </span>
            </PickerItem>
          ))}
          {loading ? (
            <div className="text-muted-foreground px-2 py-3 text-center text-xs">
              {t("sessionPicker.loading")}
            </div>
          ) : options.length === 0 ? (
            <div className="text-muted-foreground px-2 py-3 text-center text-xs">
              {keyword.trim() ? t("sessionPicker.noMatches") : t("sessionPicker.empty")}
            </div>
          ) : null}
          {listQuery.isError || searchQuery.isError ? (
            <div className="text-destructive px-2 py-2 text-center text-xs">
              {(listQuery.error ?? searchQuery.error)?.message}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function choiceFromListItem(item: SessionListItem): SessionChoice {
  return {
    sessionPk: item.session_pk,
    sessionId: item.session_id,
    agentName: item.agent_name,
    lastActivityAt: item.last_activity_at,
    turns: item.turns,
    totalTokens: item.total_tokens,
  };
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
];

/** "3 分钟前" style for the past week, a short date and time before that. */
export function relativeTime(value: string, locale: string, now = Date.now()): string {
  let amount = (new Date(value).getTime() - now) / 60_000;
  if (Math.abs(amount) < 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  }
  for (const [unit, size] of relativeUnits) {
    if (Math.abs(amount) < size) {
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
        Math.round(amount),
        unit,
      );
    }
    amount /= size;
  }
  return shortDateTime(value, locale);
}

function shortDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function PickerItem({
  index,
  active,
  selected,
  title,
  onHover,
  onSelect,
  children,
}: {
  index: number;
  active: boolean;
  selected: boolean;
  title?: string;
  onHover: (index: number) => void;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      data-index={index}
      title={title}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5",
        active && "bg-accent text-accent-foreground",
      )}
      onMouseMove={() => onHover(index)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      <div className="grid min-w-0 flex-1 gap-0.5">{children}</div>
      <Check
        className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
