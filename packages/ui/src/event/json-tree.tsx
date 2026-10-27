import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/** Strings longer than this show their start until expanded. */
const stringPreviewCharacters = 300;
/** Arrays longer than this group their items in ranges of this many. */
const arrayGroupSize = 100;
/** How many members a collapsed object or array previews on its line. */
const previewMembers = 5;

/**
 * A JSON value as an expandable tree, after the object preview of the
 * browser's developer tools: each object and array on one line with a short
 * preview, opened member by member; long arrays in ranges of a hundred. The
 * root starts open, everything under it closed.
 */
export function JsonTree({
  value,
  formatNumber,
  showMore,
}: {
  value: unknown;
  formatNumber: (value: number) => string;
  /** Expands a long string; `count` is its formatted length in characters. */
  showMore: (count: string) => string;
}) {
  const context = React.useMemo(
    () => ({ formatNumber, showMore }),
    [formatNumber, showMore],
  );
  return (
    <div role="tree" className="font-mono text-xs leading-5">
      <JsonNode name={null} value={value} context={context} defaultOpen />
    </div>
  );
}

type TreeContext = {
  formatNumber: (value: number) => string;
  showMore: (count: string) => string;
};

function JsonNode({
  name,
  value,
  context,
  defaultOpen = false,
}: {
  /** The member's key or index; null for the root. */
  name: string | null;
  value: unknown;
  context: TreeContext;
  defaultOpen?: boolean;
}) {
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? null
      : Object.entries(value as Record<string, unknown>);
    return (
      <Branch
        label={<Key name={name} />}
        preview={<Preview value={value} />}
        defaultOpen={defaultOpen}
      >
        {Array.isArray(value) ? (
          <ArrayItems items={value} from={0} context={context} />
        ) : (
          entries!.map(([key, member]) => (
            <JsonNode key={key} name={key} value={member} context={context} />
          ))
        )}
      </Branch>
    );
  }
  return (
    <div role="treeitem" className="pl-4 break-all whitespace-pre-wrap">
      <Key name={name} />
      <Scalar value={value} context={context} />
    </div>
  );
}

/** An array's items, in ranges of a hundred when there are more. */
function ArrayItems({
  items,
  from,
  context,
}: {
  items: readonly unknown[];
  /** Index of the first item within the whole array. */
  from: number;
  context: TreeContext;
}) {
  if (items.length > arrayGroupSize) {
    // Ranges of ranges, so that each level shows at most a hundred lines.
    let size = arrayGroupSize;
    while (items.length > size * arrayGroupSize) size *= arrayGroupSize;
    const groups: React.ReactNode[] = [];
    for (let start = 0; start < items.length; start += size) {
      const end = Math.min(start + size, items.length);
      groups.push(
        <Branch
          key={start}
          label={
            <span className="text-muted-foreground">{`[${from + start} … ${from + end - 1}]`}</span>
          }
        >
          <ArrayItems
            items={items.slice(start, end)}
            from={from + start}
            context={context}
          />
        </Branch>,
      );
    }
    return groups;
  }
  return items.map((item, index) => (
    <JsonNode
      key={index}
      name={String(from + index)}
      value={item}
      context={context}
    />
  ));
}

/** A line that opens to show its children. */
function Branch({
  label,
  preview,
  defaultOpen = false,
  children,
}: {
  label: React.ReactNode;
  preview?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div role="treeitem" aria-expanded={open}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="hover:bg-muted/60 flex w-full min-w-0 items-start rounded-sm text-left"
      >
        <Chevron className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 truncate">
          {label}
          {preview}
        </span>
      </button>
      {open ? (
        <div role="group" className="pl-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function Key({ name }: { name: string | null }) {
  if (name === null) return null;
  return (
    <>
      <span className="text-(--syntax-key)">{name}</span>
      <span className="text-muted-foreground">: </span>
    </>
  );
}

/** The one-line summary of an object or array. */
function Preview({ value }: { value: object }) {
  if (Array.isArray(value)) {
    const shown = value.slice(0, previewMembers);
    return (
      <span className="text-muted-foreground">
        {`(${value.length}) [`}
        {shown.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 ? ", " : null}
            <Short value={item} />
          </React.Fragment>
        ))}
        {value.length > shown.length ? ", …" : null}]
      </span>
    );
  }
  const entries = Object.entries(value);
  const shown = entries.slice(0, previewMembers);
  return (
    <span className="text-muted-foreground">
      {"{"}
      {shown.map(([key, member], index) => (
        <React.Fragment key={key}>
          {index > 0 ? ", " : null}
          <span className="text-(--syntax-key)/80">{key}</span>
          {": "}
          <Short value={member} />
        </React.Fragment>
      ))}
      {entries.length > shown.length ? ", …" : null}
      {"}"}
    </span>
  );
}

/** A member as a preview shows it: scalars in short, containers folded. */
function Short({ value }: { value: unknown }) {
  if (Array.isArray(value)) return <>{`Array(${value.length})`}</>;
  if (value !== null && typeof value === "object") return <>{"{…}"}</>;
  if (typeof value === "string") {
    const text = value.length > 24 ? `${value.slice(0, 24)}…` : value;
    return (
      <span className="text-(--syntax-string)">{JSON.stringify(text)}</span>
    );
  }
  return <Scalar value={value} />;
}

function Scalar({ value, context }: { value: unknown; context?: TreeContext }) {
  if (typeof value === "string") {
    return <JsonString value={value} context={context} />;
  }
  if (typeof value === "number") {
    return <span className="text-(--syntax-number)">{String(value)}</span>;
  }
  return (
    <span className="text-(--syntax-literal)">
      {value === undefined ? "undefined" : JSON.stringify(value)}
    </span>
  );
}

/** A string in quotes, its start only when long until the reader opens it. */
function JsonString({
  value,
  context,
}: {
  value: string;
  context?: TreeContext;
}) {
  const [whole, setWhole] = React.useState(false);
  const long = context !== undefined && value.length > stringPreviewCharacters;
  const shown =
    long && !whole ? value.slice(0, stringPreviewCharacters) : value;
  // Escapes as JSON would, so line breaks and quotes read as they are stored.
  const quoted = JSON.stringify(shown);
  return (
    <>
      <span className="text-(--syntax-string)">
        {long && !whole ? `${quoted.slice(0, -1)}…"` : quoted}
      </span>
      {long && !whole ? (
        <button
          type="button"
          onClick={() => setWhole(true)}
          className="text-muted-foreground hover:text-foreground ml-2 font-sans text-[11px] underline-offset-2 hover:underline"
        >
          {context.showMore(context.formatNumber(value.length))}
        </button>
      ) : null}
    </>
  );
}
