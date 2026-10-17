'use client';

import React, { useState, useMemo } from 'react';
import {
  INITIAL_TICKETS,
  Ticket,
  PriorityType,
  StatusType,
  PRIORITY_ICON_MAP,
  STATUS_ICON_MAP,
  ASSIGNEE_AVATAR_MAP,
} from '@/data/adminData';
import { AdminCard, AdminCardHeader, AdminCardTitle } from './AdminCard';
import { AdminIcon } from './AdminIcon';

type SortKey = 'id' | 'subject' | 'priority' | 'assignee' | 'status' | 'created' | 'slaHours';
type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<PriorityType, number> = { High: 3, Medium: 2, Low: 1 };

const formatSlaHours = (h: number) => {
  if (h >= 24) return `${Math.round(h / 24)}d left`;
  return `${h}h left`;
};

export const SlaMonitoringTable: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>(INITIAL_TICKETS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(['#2319']));
  const [sortState, setSortState] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriorities, setSelectedPriorities] = useState<Set<PriorityType>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusType>>(new Set());

  // Dropdown states
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [actionsDropdownOpen, setActionsDropdownOpen] = useState(false);
  const [activeRowMenuId, setActiveRowMenuId] = useState<string | null>(null);

  const query = searchQuery.trim().toLowerCase();

  // Filter & Sort Logic
  const filteredTickets = useMemo(() => {
    let result = tickets.filter((t) => {
      const matchesSearch =
        !query ||
        t.id.toLowerCase().includes(query) ||
        t.subject.toLowerCase().includes(query) ||
        t.assignee.toLowerCase().includes(query);

      const matchesPriority =
        selectedPriorities.size === 0 || selectedPriorities.has(t.priority);
      const matchesStatus =
        selectedStatuses.size === 0 || selectedStatuses.has(t.status);

      return matchesSearch && matchesPriority && matchesStatus;
    });

    if (sortState) {
      const { key, dir } = sortState;
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (key === 'priority') {
          cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        } else if (key === 'slaHours') {
          cmp = a.slaHours - b.slaHours;
        } else {
          cmp = String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true });
        }
        return dir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [tickets, query, selectedPriorities, selectedStatuses, sortState]);

  const allSelected =
    filteredTickets.length > 0 && filteredTickets.every((t) => selectedIds.has(t.id));
  const someSelected = filteredTickets.some((t) => selectedIds.has(t.id));
  const activeFiltersCount = selectedPriorities.size + selectedStatuses.size;

  const handleToggleSort = (key: SortKey) => {
    setSortState((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredTickets.forEach((t) => next.delete(t.id));
      } else {
        filteredTickets.forEach((t) => next.add(t.id));
      }
      return next;
    });
  };

  const handleUpdateTicket = (id: string, updates: Partial<Ticket>) => {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    setActiveRowMenuId(null);
  };

  const handleExportCSV = () => {
    const rows = filteredTickets.filter((t) => !selectedIds.size || selectedIds.has(t.id));
    const header = ['Ticket ID', 'Subject', 'Priority', 'Assignee', 'Status', 'Created', 'SLA Hours'];
    const csvContent = [
      header.join(','),
      ...rows.map((r) =>
        [
          `"${r.id}"`,
          `"${r.subject}"`,
          `"${r.priority}"`,
          `"${r.assignee}"`,
          `"${r.status}"`,
          `"${r.created}"`,
          r.slaHours,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sla-monitoring.csv';
    link.click();
    URL.revokeObjectURL(url);
    setActionsDropdownOpen(false);
  };

  return (
    <AdminCard
      patternStyle={{
        left: 'calc(50% - 28.5px)',
        top: 'calc(50% + 58.5px)',
        transform: 'translate(-50%, -50%)',
      }}
      className="w-full animate-rise [animation-delay:340ms]"
      aria-labelledby="sla-title"
    >
      <AdminCardHeader className="flex-wrap gap-2 sm:flex-nowrap">
        <div className="flex items-center gap-3">
          <AdminIcon name="target" size={16} />
          <AdminCardTitle id="sla-title">SLA Monitoring</AdminCardTitle>
        </div>

        {/* Search, Filter & Actions Toolbar */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {/* Table Search */}
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-2.5 shadow-sm transition-[border-color,box-shadow] hover:border-[#d1d5db] focus-within:border-[#9ca3af] sm:w-[240px] sm:flex-none">
            <AdminIcon name="tb-search" size={14} className="text-[#9ca3af]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ticket ID, subject or agent"
              className="min-w-0 flex-1 bg-transparent text-[13px] leading-none text-[#1f2937] outline-none placeholder:text-[#9ca3af]"
            />
          </label>

          {/* Filter Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white pl-2 pr-2.5 text-xs font-medium text-[#4b5563] shadow-sm hover:bg-[#fafafa]"
            >
              <AdminIcon name="filter" size={14} />
              <span>Filter</span>
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-[#1f2937] text-[10px] leading-none text-white">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {filterDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-xl border border-[#e5e7eb] bg-white p-2 shadow-lg animate-fade">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase text-[#9ca3af]">
                  Priority
                </p>
                {(['High', 'Medium', 'Low'] as PriorityType[]).map((p) => (
                  <label
                    key={p}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[#1f2937] hover:bg-[#f8f8f8]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPriorities.has(p)}
                      onChange={() => {
                        setSelectedPriorities((prev) => {
                          const next = new Set(prev);
                          if (next.has(p)) next.delete(p);
                          else next.add(p);
                          return next;
                        });
                      }}
                      className="rounded border-[#d1d5db]"
                    />
                    <AdminIcon name={PRIORITY_ICON_MAP[p]} size={14} />
                    <span>{p}</span>
                  </label>
                ))}

                <div className="my-1 h-px bg-[#e5e7eb]" />

                <p className="px-2 py-1 text-[11px] font-semibold uppercase text-[#9ca3af]">
                  Status
                </p>
                {(['In Review', 'In Progress', 'Delivered'] as StatusType[]).map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[#1f2937] hover:bg-[#f8f8f8]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStatuses.has(s)}
                      onChange={() => {
                        setSelectedStatuses((prev) => {
                          const next = new Set(prev);
                          if (next.has(s)) next.delete(s);
                          else next.add(s);
                          return next;
                        });
                      }}
                      className="rounded border-[#d1d5db]"
                    />
                    <AdminIcon name={STATUS_ICON_MAP[s]} size={14} />
                    <span>{s}</span>
                  </label>
                ))}

                {activeFiltersCount > 0 && (
                  <>
                    <div className="my-1 h-px bg-[#e5e7eb]" />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPriorities(new Set());
                        setSelectedStatuses(new Set());
                      }}
                      className="w-full rounded-lg px-2 py-1.5 text-xs text-left text-[#ef4444] hover:bg-[#ef4444]/10"
                    >
                      Clear all filters
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Table Actions Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsDropdownOpen(!actionsDropdownOpen)}
              className="flex h-8 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white px-2 text-[#4b5563] shadow-sm hover:bg-[#fafafa]"
            >
              <AdminIcon name="more" size={16} />
            </button>

            {actionsDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-lg animate-fade">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="flex w-full items-center rounded-lg px-2 py-1.5 text-xs text-[#1f2937] hover:bg-[#f8f8f8]"
                >
                  Export {selectedIds.size ? 'selected' : 'all'} as CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortState(null);
                    setActionsDropdownOpen(false);
                  }}
                  className="flex w-full items-center rounded-lg px-2 py-1.5 text-xs text-[#1f2937] hover:bg-[#f8f8f8]"
                >
                  Reset sorting
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(new Set());
                    setActionsDropdownOpen(false);
                  }}
                  className="flex w-full items-center rounded-lg px-2 py-1.5 text-xs text-[#1f2937] hover:bg-[#f8f8f8]"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        </div>
      </AdminCardHeader>

      {/* Table Container */}
      <div className="relative w-full overflow-x-auto rounded-xl bg-white p-1.5 shadow-[inset_0_0_0_0.8px_#e5e7eb] [scrollbar-width:thin]">
        <div role="table" className="min-w-[1138px]">
          {/* Header Row */}
          <div className="grid grid-cols-[140px_minmax(170px,1fr)_160px_160px_160px_160px_140px_40px] items-center h-9 rounded-lg border border-black/[0.04] bg-[#f7f7f7]">
            <div className="flex h-full items-center gap-2 py-2.5 pl-3 pr-4">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={handleToggleSelectAll}
                className="rounded border-[#d1d5db]"
                aria-label="Select all tickets"
              />
              <button
                type="button"
                onClick={() => handleToggleSort('id')}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1f2937] outline-none"
              >
                <span>Ticket ID</span>
                <AdminIcon
                  name={sortState?.key === 'id' && sortState.dir === 'desc' ? 'arrow-down' : 'arrow-up'}
                  size={12}
                  className={`opacity-50 ${sortState?.key === 'id' ? 'opacity-100' : ''}`}
                />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleToggleSort('subject')}
              className="flex items-center gap-1.5 px-3 py-2.5 text-left text-[13px] font-semibold text-[#1f2937]"
            >
              <span>Subject</span>
              {sortState?.key === 'subject' && (
                <AdminIcon name={sortState.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleToggleSort('priority')}
              className="flex items-center gap-1.5 px-3 py-2.5 text-left text-[13px] font-semibold text-[#1f2937]"
            >
              <span>Priority</span>
              {sortState?.key === 'priority' && (
                <AdminIcon name={sortState.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleToggleSort('assignee')}
              className="flex items-center gap-1.5 px-3 py-2.5 text-left text-[13px] font-semibold text-[#1f2937]"
            >
              <span>Assignee</span>
              {sortState?.key === 'assignee' && (
                <AdminIcon name={sortState.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleToggleSort('status')}
              className="flex items-center gap-1.5 px-3 py-2.5 text-left text-[13px] font-semibold text-[#1f2937]"
            >
              <span>Status</span>
              {sortState?.key === 'status' && (
                <AdminIcon name={sortState.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleToggleSort('created')}
              className="flex items-center gap-1.5 px-3 py-2.5 text-left text-[13px] font-semibold text-[#1f2937]"
            >
              <span>Created</span>
              {sortState?.key === 'created' && (
                <AdminIcon name={sortState.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleToggleSort('slaHours')}
              className="flex items-center gap-1.5 px-3 py-2.5 text-left text-[13px] font-semibold text-[#1f2937]"
            >
              <span>SLA Target</span>
              {sortState?.key === 'slaHours' && (
                <AdminIcon name={sortState.dir === 'desc' ? 'arrow-down' : 'arrow-up'} size={12} />
              )}
            </button>

            <div className="flex items-center justify-center">
              <span className="sr-only">Actions</span>
            </div>
          </div>

          {/* Table Rows */}
          <div role="rowgroup">
            {filteredTickets.map((ticket, idx) => {
              const isSelected = selectedIds.has(ticket.id);
              const isMenuOpen = activeRowMenuId === ticket.id;

              return (
                <div
                  key={ticket.id}
                  role="row"
                  aria-selected={isSelected}
                  className={`grid grid-cols-[140px_minmax(170px,1fr)_160px_160px_160px_160px_140px_40px] items-center h-[46px] border-b border-black/[0.06] transition-colors duration-150 hover:bg-[#fafafa] ${
                    isSelected ? 'bg-[#f3f4f6]/60' : 'bg-white'
                  }`}
                  style={{ animationDelay: `${420 + idx * 60}ms` }}
                >
                  {/* ID + Checkbox */}
                  <div className="flex h-full items-center gap-2.5 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelectRow(ticket.id)}
                      className="rounded border-[#d1d5db]"
                      aria-label={`Select ticket ${ticket.id}`}
                    />
                    <span className="text-[13px] font-medium text-[#1f2937]">
                      {ticket.id}
                    </span>
                  </div>

                  {/* Subject */}
                  <div className="flex h-full items-center px-3 py-2.5 overflow-hidden">
                    <span className="truncate text-[13px] text-[#1f2937] hover:underline cursor-pointer">
                      {ticket.subject}
                    </span>
                  </div>

                  {/* Priority */}
                  <div className="flex h-full items-center gap-2 px-3 py-2.5">
                    <AdminIcon name={PRIORITY_ICON_MAP[ticket.priority]} size={16} />
                    <span className="text-[13px] text-[#4b5563]">{ticket.priority}</span>
                  </div>

                  {/* Assignee */}
                  <div className="flex h-full items-center gap-2 px-3 py-2.5">
                    <div className="size-5 shrink-0 rounded-full overflow-hidden border border-[#e5e7eb]">
                      <img
                        src={ASSIGNEE_AVATAR_MAP[ticket.assignee] || '/admin/avatar-sarah.jpg'}
                        alt={ticket.assignee}
                        className="size-full object-cover"
                      />
                    </div>
                    <span className="text-[13px] text-[#4b5563] truncate">
                      {ticket.assignee}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex h-full items-center gap-2 px-3 py-2.5">
                    <AdminIcon name={STATUS_ICON_MAP[ticket.status]} size={16} />
                    <span className="text-[13px] text-[#4b5563]">{ticket.status}</span>
                  </div>

                  {/* Created */}
                  <div className="flex h-full items-center px-3 py-2.5">
                    <span className="text-[13px] text-[#6b7280]">{ticket.created}</span>
                  </div>

                  {/* SLA Hours */}
                  <div className="flex h-full items-center px-3 py-2.5">
                    <span
                      className={`text-[13px] font-medium ${
                        ticket.slaHours <= 3 ? 'text-[#ef4444]' : 'text-[#4b5563]'
                      }`}
                    >
                      {formatSlaHours(ticket.slaHours)}
                    </span>
                  </div>

                  {/* Row Actions Menu */}
                  <div className="relative flex h-full items-center justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveRowMenuId(isMenuOpen ? null : ticket.id)
                      }
                      className="rounded p-1 hover:bg-black/[0.05] text-[#6b7280]"
                    >
                      <AdminIcon name="more" size={16} />
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-lg animate-fade">
                        <p className="px-2 py-1 text-[11px] font-semibold text-[#9ca3af]">
                          {ticket.id}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleUpdateTicket(ticket.id, { status: 'In Progress' })}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-xs text-[#1f2937] hover:bg-[#f8f8f8]"
                        >
                          <AdminIcon name="status-progress" size={14} />
                          <span>Mark in progress</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateTicket(ticket.id, { status: 'In Review' })}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-xs text-[#1f2937] hover:bg-[#f8f8f8]"
                        >
                          <AdminIcon name="status-review" size={14} />
                          <span>Send to review</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateTicket(ticket.id, { status: 'Delivered' })}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-xs text-[#1f2937] hover:bg-[#f8f8f8]"
                        >
                          <AdminIcon name="status-delivered" size={14} />
                          <span>Mark delivered</span>
                        </button>

                        <div className="my-1 h-px bg-[#e5e7eb]" />
                        <p className="px-2 py-1 text-[11px] font-semibold text-[#9ca3af]">
                          Reassign
                        </p>
                        {['John Doe', 'Sarah Lee', 'Michael Wong'].map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() =>
                              handleUpdateTicket(ticket.id, {
                                assignee: name,
                                assigneeAvatar: ASSIGNEE_AVATAR_MAP[name],
                              })
                            }
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-xs text-[#1f2937] hover:bg-[#f8f8f8]"
                          >
                            <span>{name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredTickets.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <AdminIcon name="tb-search" size={24} className="opacity-40" />
                <p className="text-sm font-medium text-[#1f2937]">No tickets found</p>
                <p className="text-xs text-[#9ca3af]">Try adjusting your search or filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminCard>
  );
};
