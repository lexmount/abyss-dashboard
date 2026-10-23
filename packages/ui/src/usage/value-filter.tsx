import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "../components/button";
import { Input } from "../components/input";
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover";
import { cn } from "../utils";
import type { UsageComparisonLabels } from "./comparison-model";
export function UsageValueFilter({
  label,
  options,
  value,
  onChange,
  labels,
  allowCustom = false,
}: {
  label: string;
  options: readonly string[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  labels: UsageComparisonLabels;
  allowCustom?: boolean;
}) {
  const [search, setSearch] = useState("");
  const choices = [...new Set([...value, ...options])].filter((option) =>
    option.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const toggle = (option: string) =>
    onChange(
      value.includes(option)
        ? value.filter((item) => item !== option)
        : [...value, option],
    );
  const add = () => {
    if (search.trim() && !value.includes(search.trim()))
      onChange([...value, search.trim()]);
    setSearch("");
  };
  return (
    <Popover onOpenChange={() => setSearch("")}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label={label}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value.length ? value[0] : labels.all}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {value.length > 1 && (
              <span className="text-muted-foreground text-xs">
                +{value.length - 1}
              </span>
            )}
            <ChevronDown className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <Input
          aria-label={labels.search + " " + label}
          placeholder={labels.search}
          value={search}
          className="mb-1 border-0 shadow-none"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (allowCustom && event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <div
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          className="max-h-64 overflow-y-auto"
        >
          <button
            type="button"
            role="option"
            aria-selected={!value.length}
            onClick={() => onChange([])}
            className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm"
          >
            <Check
              className={cn(
                "size-4",
                value.length ? "opacity-0" : "opacity-100",
              )}
            />
            {labels.all}
          </button>
          {choices.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={value.includes(option)}
              key={option}
              title={option}
              onClick={() => toggle(option)}
              className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm"
            >
              <Check
                className={cn(
                  "size-4 shrink-0",
                  value.includes(option) ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="truncate">{option}</span>
            </button>
          ))}
        </div>
        {allowCustom && search.trim() && !choices.includes(search.trim()) && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={add}
          >
            {labels.add} {search.trim()}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
