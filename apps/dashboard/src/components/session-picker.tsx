import { useQuery } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";
import * as React from "react";
import { Input, Popover, PopoverContent, PopoverTrigger } from "@lexmount.com/abyss-ui";
import {
  fetchRecentSessions,
  searchSessions,
  type SessionOption,
  type UsageQuery,
} from "@/api/usage";
import { FilterTrigger } from "@/components/filter-trigger";
import { useI18n } from "@/hooks/use-i18n";
import { agentDisplayName } from "@/lib/agents";
import { cn } from "@/lib/utils";

const searchDebounceMs = 250;
const searchPageSize = 20;
const maxVisibleRecentSessions = 50;

interface SessionPickerProps {
  value: string;
  onChange: (sessionId: string) => void;
  /** Time and Agent scope the options are drawn from. */
  scope: Pick<UsageQuery, "from" | "to" | "agentName">;
}

/**
 * Session filter combobox. With no keyword it lists recently active sessions;
 * a keyword filters those locally and also runs the backend session search,
 * which matches session ID segments as well as captured conversation content.
 */
export function SessionPicker({ value, onChange, scope }: SessionPickerProps) {
  const { t, formatDateTime } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const debouncedKeyword = useDebouncedValue(keyword.trim(), searchDebounceMs);
  const listRef = React.useRef<HTMLDivElement>(null);

  const recentQuery = useQuery({
    queryKey: ["session-options", "recent", scope],
    queryFn: () => fetchRecentSessions(scope),
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
        pageSize: searchPageSize,
      }),
    enabled: open && debouncedKeyword.length > 0,
    staleTime: 30_000,
  });

  const options = React.useMemo(() => {
    const needle = keyword.trim().toLocaleLowerCase();
    const recent = (recentQuery.data ?? []).filter(
      (option) =>
        needle.length === 0 ||
        option.sessionId.toLocaleLowerCase().includes(needle) ||
        agentDisplayName(option.agentName).toLocaleLowerCase().includes(needle),
    );
    const seen = new Set(recent.map((option) => option.sessionPk));
    const searched: SessionOption[] = [];
    if (needle.length > 0) {
      for (const item of searchQuery.data?.items ?? []) {
        if (!seen.has(item.session_pk)) {
          seen.add(item.session_pk);
          searched.push({
            sessionPk: item.session_pk,
            sessionId: item.session_id,
            agentName: item.agent_name,
            lastSeenAt: item.ended_at ?? item.started_at,
          });
        }
      }
    }
    return [...recent.slice(0, maxVisibleRecentSessions), ...searched];
  }, [keyword, recentQuery.data, searchQuery.data]);

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

  const select = (sessionId: string): void => {
    onChange(sessionId);
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
      select(activeIndex === 0 ? "" : (options[activeIndex - 1]?.sessionId ?? ""));
    }
  };

  const searching =
    keyword.trim().length > 0 &&
    (keyword.trim() !== debouncedKeyword || searchQuery.isFetching);
  const loading = recentQuery.isLoading || searching;

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
            className={cn(value && "pr-8 font-mono text-xs")}
          >
            {value || t("common.all")}
          </FilterTrigger>
        </PopoverTrigger>
        {value ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm p-0.5"
            aria-label={t("sessionPicker.clear")}
            onClick={() => onChange("")}
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
        <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto p-1">
          <PickerItem
            index={0}
            active={activeIndex === 0}
            selected={value === ""}
            onHover={setActiveIndex}
            onSelect={() => select("")}
          >
            <span className="text-sm">{t("sessionPicker.all")}</span>
          </PickerItem>
          {options.map((option, offset) => (
            <PickerItem
              key={option.sessionPk}
              index={offset + 1}
              active={activeIndex === offset + 1}
              selected={value === option.sessionId}
              onHover={setActiveIndex}
              onSelect={() => select(option.sessionId)}
            >
              <span className="truncate font-mono text-xs">{option.sessionId}</span>
              <span className="text-muted-foreground truncate text-xs">
                {agentDisplayName(option.agentName)} ·{" "}
                {formatDateTime(option.lastSeenAt)}
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
          {recentQuery.isError || searchQuery.isError ? (
            <div className="text-destructive px-2 py-2 text-center text-xs">
              {(recentQuery.error ?? searchQuery.error)?.message}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PickerItem({
  index,
  active,
  selected,
  onHover,
  onSelect,
  children,
}: {
  index: number;
  active: boolean;
  selected: boolean;
  onHover: (index: number) => void;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      data-index={index}
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
