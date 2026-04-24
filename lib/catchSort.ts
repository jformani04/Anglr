import { CatchLog } from "@/lib/catches";

export type SortField = "date" | "weight" | "length" | "species" | "lure";
export type SortDirection = "asc" | "desc";

export type SortConfig = {
  field: SortField;
  direction: SortDirection;
};

type SortType = "numeric" | "string" | "date";

type SortDefinition = {
  field: SortField;
  label: string;
  type: SortType;
  defaultDirection: SortDirection;
  getValue: (c: CatchLog) => number | string;
};

function parseNumeric(str: string | null | undefined): number {
  if (!str?.trim()) return -1;
  const m = str.match(/\d+\.?\d*/);
  return m ? parseFloat(m[0]) : -1;
}

function parseDate(str: string | null | undefined): number {
  if (!str?.trim()) return 0;
  const ms = new Date(str).getTime();
  return isNaN(ms) ? 0 : ms;
}

// Add new sort options here — nothing else in the codebase needs to change.
export const SORT_DEFINITIONS: SortDefinition[] = [
  {
    field: "date",
    label: "Date",
    type: "date",
    defaultDirection: "desc",
    getValue: (c) => c.date ?? "",
  },
  {
    field: "weight",
    label: "Weight",
    type: "numeric",
    defaultDirection: "desc",
    getValue: (c) => parseNumeric(c.weight),
  },
  {
    field: "length",
    label: "Size",
    type: "numeric",
    defaultDirection: "desc",
    getValue: (c) => parseNumeric(c.length),
  },
  {
    field: "species",
    label: "Species",
    type: "string",
    defaultDirection: "asc",
    getValue: (c) => (c.species ?? "").toLowerCase(),
  },
  {
    field: "lure",
    label: "Lure",
    type: "string",
    defaultDirection: "asc",
    getValue: (c) => (c.lure ?? "").toLowerCase(),
  },
];

export function applySortToCatches(
  catches: CatchLog[],
  sort: SortConfig | null
): CatchLog[] {
  if (!sort) return catches;

  const def = SORT_DEFINITIONS.find((d) => d.field === sort.field);
  if (!def) return catches;

  const multiplier = sort.direction === "asc" ? 1 : -1;

  return [...catches].sort((a, b) => {
    const va = def.getValue(a);
    const vb = def.getValue(b);

    if (def.type === "numeric") {
      const na = va as number;
      const nb = vb as number;
      // Catches with no parseable value always sort to the end
      if (na < 0 && nb < 0) return 0;
      if (na < 0) return 1;
      if (nb < 0) return -1;
      return (na - nb) * multiplier;
    }

    if (def.type === "date") {
      const da = parseDate(va as string);
      const db = parseDate(vb as string);
      if (da === 0 && db === 0) return 0;
      if (da === 0) return 1;
      if (db === 0) return -1;
      return (da - db) * multiplier;
    }

    // string
    const sa = va as string;
    const sb = vb as string;
    if (!sa && !sb) return 0;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa.localeCompare(sb) * multiplier;
  });
}
