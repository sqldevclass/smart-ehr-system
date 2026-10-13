import { useEffect, useState, type ReactNode } from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type Table as ReactTableInstance,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DataTableColumnFilter } from "@/components/reports/data-table/DataTableColumnFilter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Columns3, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    align?: "right";
  }
}

// Excel/Sheets-style multi-select filter. undefined = no filter (show all).
// An explicit Set (including an empty one) = explicit selection; an empty
// Set means "show nothing". Must stay in sync with DataTableColumnFilter.
export function multiSelectFilter(row: any, columnId: string, filterValue: Set<string>) {
  return filterValue.has(String(row.getValue(columnId) ?? ""));
}

interface SavedPreferences {
  visible_columns?: string[];
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  isLoading?: boolean;
  emptyMessage?: string;
  /** When provided, enables "save as default view" column-visibility persistence for this view. */
  viewKey?: string;
  getRowId?: (row: TData, index: number) => string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  renderFooter?: (table: ReactTableInstance<TData>) => ReactNode;
}

export function DataTable<TData>({
  columns,
  data,
  isLoading,
  emptyMessage = "No rows.",
  viewKey,
  getRowId,
  leftSlot,
  rightSlot,
  renderFooter,
}: DataTableProps<TData>) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const { data: savedPrefs } = useQuery({
    queryKey: ["user-view-preferences", viewKey, user?.id],
    queryFn: async () => {
      if (!user || !viewKey) return null;
      const { data, error } = await supabase
        .from("user_view_preferences")
        .select("preferences")
        .eq("user_id", user.id)
        .eq("view_key", viewKey)
        .maybeSingle();
      if (error) throw error;
      return data?.preferences as SavedPreferences | null;
    },
    enabled: !!user && !!viewKey,
  });

  useEffect(() => {
    if (prefsLoaded || !viewKey) return;
    if (savedPrefs === undefined) return;
    if (savedPrefs?.visible_columns) {
      const visible = new Set(savedPrefs.visible_columns);
      const next: VisibilityState = {};
      columns.forEach((c) => {
        const id = (c.id ?? (c as any).accessorKey) as string | undefined;
        if (id) next[id] = visible.has(id);
      });
      setColumnVisibility(next);
    }
    setPrefsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPrefs, viewKey]);

  const table = useReactTable({
    data,
    columns,
    defaultColumn: { filterFn: multiSelectFilter as any },
    state: { columnFilters, columnVisibility },
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const hasActiveFilters = columnFilters.length > 0;
  const resetFilters = () => setColumnFilters([]);
  const hideableColumns = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const rows = table.getRowModel().rows;

  const saveAsDefault = async () => {
    if (!user || !viewKey) return;
    const visible_columns = table
      .getAllLeafColumns()
      .filter((c) => c.getIsVisible())
      .map((c) => c.id);
    const { error } = await supabase
      .from("user_view_preferences")
      .upsert(
        { user_id: user.id, hospital_id: user.hospitalId, view_key: viewKey, preferences: { visible_columns } },
        { onConflict: "user_id,view_key" },
      );
    if (error) {
      toast.error("Не удалось сохранить вид по умолчанию.");
      return;
    }
    toast.success("Сохранено как вид по умолчанию.");
    queryClient.invalidateQueries({ queryKey: ["user-view-preferences", viewKey, user.id] });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap shrink-0 pb-2">
        <div className="flex items-center gap-2">{leftSlot}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить фильтры
          </Button>

          {hideableColumns.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <Columns3 className="h-3.5 w-3.5" />
                  Столбцы
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="max-h-72 overflow-y-auto space-y-0.5">
                  {hideableColumns.map((col) => (
                    <label
                      key={col.id}
                      className="flex items-center gap-2 text-xs cursor-pointer px-1 py-1 rounded hover:bg-muted"
                    >
                      <Checkbox
                        checked={col.getIsVisible()}
                        onCheckedChange={(v) => col.toggleVisibility(!!v)}
                      />
                      <span>
                        {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
                      </span>
                    </label>
                  ))}
                </div>
                {viewKey && (
                  <div className="border-t mt-2 pt-2">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline px-1"
                      onClick={saveAsDefault}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Сохранить как вид по умолчанию
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}

          {rightSlot}
        </div>
      </div>

      <div className="rounded-md border bg-card flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <Table wrapperClassName="h-full overflow-auto">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 whitespace-nowrap sticky top-0 z-10 bg-card">№</TableHead>
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const align = header.column.columnDef.meta?.align;
                  return (
                    <TableHead
                      key={header.id}
                      className={cn("whitespace-nowrap sticky top-0 z-10 bg-card", align === "right" && "text-right")}
                    >
                      <div className={cn("flex items-center", align === "right" && "justify-end")}>
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        {header.column.getCanFilter() && <DataTableColumnFilter column={header.column} />}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleLeafColumns.length + 1} className="text-center text-sm text-muted-foreground py-6">
                    No rows match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{idx + 1}</TableCell>
                    {row.getVisibleCells().map((cell) => {
                      const align = cell.column.columnDef.meta?.align;
                      return (
                        <TableCell key={cell.id} className={cn("whitespace-nowrap", align === "right" && "text-right")}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
            {rows.length > 0 && renderFooter && (
              <TableFooter className="sticky bottom-0 bg-card">
                {renderFooter(table)}
              </TableFooter>
            )}
          </Table>
        )}
      </div>
    </div>
  );
}
