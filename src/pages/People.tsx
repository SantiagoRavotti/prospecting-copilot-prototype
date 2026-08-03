import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, Download, FileUp, Search } from 'lucide-react';
import type { Priority, Prospect, ProspectStatus } from '../lib/types';
import {
  activeWorkspace,
  companyById,
  personById,
  useAppState,
  workspaceProspects,
} from '../lib/store';
import { exportBackup, exportCsv, exportXlsx } from '../lib/exporters';
import { STATUS_LABELS } from '../lib/labels';
import { Button, Input, Select } from '../components/ui';
import { PriorityBadge, StatusBadge } from '../components/badges';
import CsvImportDialog from '../components/CsvImportDialog';

interface Row {
  prospect: Prospect;
  name: string;
  title: string;
  company: string;
  country: string;
  linkedinUrl: string;
  score: number;
  priority: Priority;
  status: ProspectStatus;
  isDemo: boolean;
}

const columnHelper = createColumnHelper<Row>();

export default function People() {
  const state = useAppState();
  const workspace = activeWorkspace(state);
  const prospects = workspaceProspects(state);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | 'all'>('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'score', desc: true }]);
  const [importOpen, setImportOpen] = useState(false);

  const rows = useMemo<Row[]>(
    () =>
      prospects
        .filter((p) => statusFilter === 'all' || p.status === statusFilter)
        .map((p) => {
          const person = personById(state, p.personId);
          const company = companyById(state, p.companyId);
          return {
            prospect: p,
            name: person?.fullName ?? '',
            title: person?.title ?? '',
            company: company?.name ?? '',
            country: person?.country ?? '',
            linkedinUrl: person?.linkedinUrl ?? '',
            score: p.score,
            priority: p.priority,
            status: p.status,
            isDemo: p.isDemo,
          };
        }),
    [prospects, state, statusFilter],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Person',
        cell: (info) => (
          <div>
            <p className="font-medium text-slate-800">
              {info.getValue()}
              {info.row.original.isDemo && (
                <span className="ml-1.5 align-middle text-[10px] text-slate-400">(demo)</span>
              )}
            </p>
            <p className="text-xs text-slate-400">{info.row.original.title}</p>
          </div>
        ),
      }),
      columnHelper.accessor('company', { header: 'Company' }),
      columnHelper.accessor('country', { header: 'Country' }),
      columnHelper.accessor('score', {
        header: 'Score',
        cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
      }),
      columnHelper.accessor('priority', {
        header: 'Priority',
        cell: (info) => <PriorityBadge priority={info.getValue()} />,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor('linkedinUrl', {
        header: 'LinkedIn',
        enableSorting: false,
        cell: (info) =>
          info.getValue() ? (
            <a
              href={info.getValue()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline"
            >
              Profile
            </a>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const v = String(filterValue).toLowerCase();
      return `${row.original.name} ${row.original.title} ${row.original.company} ${row.original.country}`
        .toLowerCase()
        .includes(v);
    },
  });

  const visibleProspects = table.getRowModel().rows.map((r) => r.original.prospect);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">People</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            data-testid="import-csv"
          >
            <FileUp className="h-4 w-4" /> Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(state, visibleProspects)}
            data-testid="export-csv"
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportXlsx(state, visibleProspects)}
            data-testid="export-xlsx"
          >
            <Download className="h-4 w-4" /> XLSX
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportBackup(state)}
            data-testid="export-backup"
          >
            <Download className="h-4 w-4" /> JSON backup
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search people…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            data-testid="people-search"
          />
        </div>
        <Select
          aria-label="Filter by status"
          className="w-52"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProspectStatus | 'all')}
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABELS) as ProspectStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <span className="self-center text-xs text-slate-400">
          {table.getRowModel().rows.length} of {rows.length} in {workspace.name}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="w-full text-left text-sm" data-testid="people-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"
              >
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-4 py-3">
                    {h.column.getCanSort() ? (
                      <button
                        className="inline-flex items-center gap-1 hover:text-slate-600"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2.5 text-slate-600">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  No people match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        workspace={workspace}
      />
    </div>
  );
}
