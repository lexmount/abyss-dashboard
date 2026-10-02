import { Check, Search, X } from "lucide-react";
import * as React from "react";
import { Input, Popover, PopoverContent, PopoverTrigger } from "@lexmount.com/abyss-ui";
import { FilterTrigger } from "@/components/filter-trigger";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

/** Lists longer than this get a search box. */
const searchThreshold = 8;

interface MultiSelectFilterProps {
  /** Names the filter for the trigger, search box, and clear button. */
  label: string;
  options: readonly FilterOption[];
  /** Chosen values; empty means every value. */
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Shows option labels in monospace, for identifiers such as model names. */
  mono?: boolean;
}

/**
 * Filter combobox where any number of values can be chosen. Choosing nothing
 * means all values; the first entry clears the choice. The list stays open
 * while values are toggled.
 */
export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  mono = false,
}: MultiSelectFilterProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const selected = React.useMemo(() => new Set(value), [value]);
  const labelOf = React.useCallback(
    (optionValue: string) =>
      options.find((option) => option.value === optionValue)?.label ?? optionValue,
    [options],
  );

  const searchable = options.length > searchThreshold;
  const visibleOptions = React.useMemo(() => {
    const needle = keyword.trim().toLocaleLowerCase();
    return needle.length === 0
      ? options
      : options.filter(
          (option) =>
            option.label.toLocaleLowerCase().includes(needle) ||
            option.value.toLocaleLowerCase().includes(needle),
        );
  }, [keyword, options]);
  // Index 0 is the "all" entry; options follow it.
  const entryCount = visibleOptions.length + 1;

  React.useEffect(() => {
    setActiveIndex(0);
  }, [keyword]);

  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const toggle = (optionValue: string): void => {
    onChange(
      selected.has(optionValue)
        ? value.filter((current) => current !== optionValue)
        : [...value, optionValue],
    );
  };

  const choose = (index: number): void => {
    if (index === 0) {
      onChange([]);
      return;
    }
    const option = visibleOptions[index - 1];
    if (option) {
      toggle(option.value);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % entryCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + entryCount) % entryCount);
    } else if (event.key === "Enter" || (event.key === " " && !searchable)) {
      event.preventDefault();
      choose(activeIndex);
    }
  };

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
            aria-label={label}
            title={value.length > 0 ? value.map(labelOf).join(", ") : undefined}
            hideChevron={value.length > 0}
            className={cn(
              value.length > 0 && "pr-8",
              mono && value.length > 0 && "font-mono text-xs",
            )}
          >
            <FilterSummary labels={value.map(labelOf)} />
          </FilterTrigger>
        </PopoverTrigger>
        {value.length > 0 ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm p-0.5"
            aria-label={t("filter.clear", { label })}
            onClick={() => onChange([])}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-56 p-0"
        onKeyDown={searchable ? undefined : onKeyDown}
      >
        {searchable ? (
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <Input
              autoFocus
              value={keyword}
              placeholder={t("filter.search", { label })}
              aria-label={t("filter.search", { label })}
              className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
        ) : null}
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          tabIndex={searchable ? undefined : 0}
          className="max-h-80 overflow-y-auto p-1 outline-none"
        >
          <FilterItem
            index={0}
            active={activeIndex === 0}
            selected={value.length === 0}
            onHover={setActiveIndex}
            onSelect={() => choose(0)}
          >
            {t("common.all")}
          </FilterItem>
          {visibleOptions.map((option, offset) => (
            <FilterItem
              key={option.value}
              index={offset + 1}
              active={activeIndex === offset + 1}
              selected={selected.has(option.value)}
              title={option.value}
              mono={mono}
              onHover={setActiveIndex}
              onSelect={() => choose(offset + 1)}
            >
              {option.label}
            </FilterItem>
          ))}
          {visibleOptions.length === 0 ? (
            <div className="text-muted-foreground px-2 py-3 text-center text-xs">
              {keyword.trim() ? t("filter.noMatches") : t("filter.empty")}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterItem({
  index,
  active,
  selected,
  title,
  mono = false,
  onHover,
  onSelect,
  children,
}: {
  index: number;
  active: boolean;
  selected: boolean;
  title?: string;
  mono?: boolean;
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
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
        active && "bg-accent text-accent-foreground",
      )}
      onMouseMove={() => onHover(index)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
    >
      <FilterCheckbox checked={selected} />
      <span className={cn("min-w-0 flex-1 truncate", mono && "font-mono text-xs")}>
        {children}
      </span>
    </div>
  );
}

/** Checkbox mark for an option of a filter that takes several values. */
export function FilterCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "border-input flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
        checked && "border-primary bg-primary text-primary-foreground",
      )}
      aria-hidden="true"
    >
      <Check className={cn("size-3", checked ? "opacity-100" : "opacity-0")} />
    </span>
  );
}

/**
 * Trigger text for a filter with several values: the first value, then how
 * many more are chosen. The count stays visible when the label is truncated.
 */
export function FilterSummary({ labels }: { labels: readonly string[] }) {
  const { t } = useI18n();
  if (labels.length === 0) {
    return t("common.all");
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 truncate">{labels[0]}</span>
      {labels.length > 1 ? (
        <span className="text-muted-foreground shrink-0 font-sans text-xs tabular-nums">
          {t("filter.moreSelected", { count: labels.length - 1 })}
        </span>
      ) : null}
    </span>
  );
}
