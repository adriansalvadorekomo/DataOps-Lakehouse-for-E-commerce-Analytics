import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sortable, paginated table. Numeric columns set meta.numeric for right alignment. */
export function DataTable<T>({
  data,
  columns,
  initialSort,
  pageSize = 12,
  onRowClick,
  empty = "No rows.",
  dense,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  initialSort?: SortingState;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  empty?: string;
  dense?: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const pages = table.getPageCount();
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13.5px]">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-line">
                {hg.headers.map((h) => {
                  const numeric = (h.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} className={cn("py-2.5 pr-4 font-normal", numeric ? "text-right" : "text-left")}>
                      {h.column.getCanSort() ? (
                        <button
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn("label inline-flex items-center gap-1 hover:text-ink", sorted && "text-ink")}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        <span className="label">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr><td colSpan={columns.length} className="py-8 text-center text-ink-3">{empty}</td></tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn("border-b border-line/70 transition-colors", onRowClick && "cursor-pointer hover:bg-panel-2")}
              >
                {row.getVisibleCells().map((cell) => {
                  const numeric = (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric;
                  return (
                    <td key={cell.id} className={cn(dense ? "py-2" : "py-3", "pr-4", numeric && "num text-right")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-[12.5px] text-ink-3">
          <span className="num">
            Page {table.getState().pagination.pageIndex + 1} of {pages} · {data.length.toLocaleString("en-IN")} rows
          </span>
          <div className="flex gap-1">
            <button className="rounded-md border border-line px-2.5 py-1 hover:text-ink disabled:opacity-40" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</button>
            <button className="rounded-md border border-line px-2.5 py-1 hover:text-ink disabled:opacity-40" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
