import React, { useEffect, useMemo, useState } from "react";
import { getAdminSessionTimeline, getAdminSessions, getMe } from "../lib/api";

export interface ChatMessageAudit {
  id: string;
  sender: string;
  time: string;
  text: string;
  attachment?: {
    url: string;
    label: string;
  };
}

export interface TimelineAuditItem {
  id: string;
  title: string;
  time: string;
  color: "emerald" | "blue" | "rose" | "amber";
}

export interface AdminSessionItem {
  id: string;
  participants: string[];
  startTime: string;
  endTime: string;
  duration: string;
  durationMinutes: number;
  status: "Ended" | "Timeout" | "Active";
  messages: ChatMessageAudit[];
  timeline: TimelineAuditItem[];
}

const EMPTY_SESSION: AdminSessionItem = {
  id: "—",
  participants: [],
  startTime: "—",
  endTime: "—",
  duration: "—",
  durationMinutes: 0,
  status: "Ended",
  messages: [],
  timeline: [],
};

export interface AdminProps {
  onLogout?: () => void;
  onNavigateHome?: () => void;
  onUnauthorized?: () => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(durationSecs: number): string {
  const minutes = Math.floor(durationSecs / 60);
  const seconds = durationSecs % 60;
  return minutes > 0 ? `${minutes}m${seconds ? ` ${seconds}s` : ""}` : `${seconds}s`;
}

function parseDisplayDate(value: string): string | undefined {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) return undefined;
  return isoDate;
}

export const Admin: React.FC<AdminProps> = ({ onLogout, onNavigateHome, onUnauthorized }) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [participantFilter, setParticipantFilter] = useState<string>("");
  const [durationFilter, setDurationFilter] = useState<string>("");
  const [dateFromFilter, setDateFromFilter] = useState<string>("");
  const [dateToFilter, setDateToFilter] = useState<string>("");
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [sessions, setSessions] = useState<AdminSessionItem[]>([]);
  const [isAuthorizing, setIsAuthorizing] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(() => {
        if (!cancelled) setIsAuthorized(true);
      })
      .catch(() => {
        if (!cancelled) onUnauthorized?.();
      })
      .finally(() => {
        if (!cancelled) setIsAuthorizing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    let cancelled = false;
    const durationMin = Number.parseInt(durationFilter.replace(/\D/g, ""), 10);
    const dateFrom = parseDisplayDate(dateFromFilter);
    const dateTo = parseDisplayDate(dateToFilter);
    setIsLoadingSessions(true);
    setErrorMessage(null);
    getAdminSessions({
      page: 1,
      limit: 50,
      ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
      ...(participantFilter.trim() ? { participantId: participantFilter.trim() } : {}),
      ...(Number.isFinite(durationMin) ? { durationMin } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    })
      .then(({ items }) => {
        if (cancelled) return;
        const mappedSessions: AdminSessionItem[] = items.map((session) => ({
          id: session.id,
          participants: session.participants,
          startTime: formatDateTime(session.startTime),
          endTime: formatDateTime(session.endTime),
          duration: formatDuration(session.durationSecs),
          durationMinutes: Math.floor(session.durationSecs / 60),
          status: session.status,
          messages: [],
          timeline: [],
        }));
        setSessions(mappedSessions);
        setSelectedSessionId((current) =>
          mappedSessions.some((session) => session.id === current) ? current : (mappedSessions[0]?.id || "")
        );
      })
      .catch((error: any) => {
        if (!cancelled) setErrorMessage(error.response?.data?.error || "Unable to load session metadata.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthorized, searchQuery, participantFilter, durationFilter, dateFromFilter, dateToFilter]);

  useEffect(() => {
    if (!isAuthorized || !selectedSessionId) return;
    let cancelled = false;
    setIsLoadingTimeline(true);
    getAdminSessionTimeline(selectedSessionId)
      .then(({ timeline }) => {
        if (cancelled) return;
        setSessions((current) => current.map((session) =>
          session.id === selectedSessionId
            ? { ...session, timeline: timeline.map((event) => ({ ...event, time: formatDateTime(event.time) })) }
            : session
        ));
      })
      .catch((error: any) => {
        if (!cancelled) setErrorMessage(error.response?.data?.error || "Unable to load the session timeline.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTimeline(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthorized, selectedSessionId]);

  const selectedSession = useMemo(() => {
    return sessions.find((session) => session.id === selectedSessionId) || sessions[0] || EMPTY_SESSION;
  }, [selectedSessionId, sessions]);

  if (isAuthorizing) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Verifying admin access...</div>;
  }

  return (
    <div className="min-h-screen flex bg-slate-100 font-sans text-slate-800 antialiased overflow-x-hidden">
      {/* BEGIN: Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 shadow-sm z-20">
        {/* Top Branding & Navigation */}
        <div>
          {/* Brand Header */}
          <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-100">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-xs">
              {/* Shield Icon */}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path
                  d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-slate-900 leading-tight">
                Admin Panel
              </h1>
              <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">
                Audit &amp; Compliance
              </p>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="p-3 space-y-1">
            {/* Session List */}
            <button
              type="button"
              aria-current="page"
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors bg-blue-50/80 text-blue-600 border border-blue-100/60"
            >
              {/* Chat Bubble Icon */}
              <svg
                className="w-4 h-4 shrink-0 text-blue-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Session List</span>
            </button>
          </nav>
        </div>

        {/* Bottom Compliance Status Blocks */}
        <div className="p-3 space-y-2 border-t border-slate-100 bg-slate-50/50">
          {/* Read-Only Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200/80 bg-white shadow-2xs">
            <div className="text-slate-500 mt-0.5 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect height="11" rx="2" ry="2" width="18" x="3" y="11" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-800">Read-Only Access</span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                View only. No edits. No deletes.
              </p>
            </div>
          </div>
        </div>
      </aside>
      {/* END: Sidebar */}

      {/* BEGIN: MainContentWrapper */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/70">
        {/* BEGIN: TopNavbar */}
        <header className="h-16 px-8 bg-white border-b border-slate-200 flex items-center justify-between gap-4 sticky top-0 z-10">
          {/* Global Search Bar */}
          <div className="relative w-96">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" x2="16.65" y1="21" y2="16.65" />
              </svg>
            </div>
            <input
              className="block w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50/80 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="Search session ID or participant..."
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* User Profile Dropdown Button */}
          <div className="relative flex items-center gap-3">
            <button
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors text-slate-700"
              type="button"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="text-xs font-medium text-slate-700">Admin</span>
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileOpen && (
              <div className="absolute right-0 top-11 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-30">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-800">Security Officer</p>
                  <p className="text-[11px] text-slate-400 truncate">admin@sentinel.internal</p>
                </div>
                {onNavigateHome && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      onNavigateHome();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 border-b border-slate-100"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>User App</span>
                  </button>
                )}
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </header>
        {/* END: TopNavbar */}

        {/* BEGIN: ScrollablePageContent */}
        <main className="flex-1 p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Page Title & Header */}
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Session List</h2>
            <p className="text-xs text-slate-500">View and search chat sessions</p>
          </div>

          {/* BEGIN: FilterBar */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs" data-purpose="session-filters">
            <form
              className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end"
              onSubmit={(e) => e.preventDefault()}
            >
              {/* From Date Field */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">From Date</label>
                <div className="relative flex items-center">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                  </div>
                  <input
                    className="w-full pl-9 pr-8 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-700 bg-white cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="DD/MM/YYYY"
                    type="text"
                    inputMode="numeric"
                    value={dateFromFilter}
                    onChange={(e) => setDateFromFilter(e.target.value)}
                  />
                </div>
              </div>

              {/* To Date Field — optional; From alone selects that one day. */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">To Date</label>
                <div className="relative flex items-center">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
                      <line x1="16" x2="16" y1="2" y2="6" />
                      <line x1="8" x2="8" y1="2" y2="6" />
                      <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                  </div>
                  <input
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-700 bg-white cursor-pointer hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="DD/MM/YYYY"
                    type="text"
                    inputMode="numeric"
                    value={dateToFilter}
                    onChange={(e) => setDateToFilter(e.target.value)}
                  />
                </div>
              </div>

              {/* Participant ID Input */}
              <div className="md:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Participant ID</label>
                <div className="relative flex items-center">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <input
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg placeholder-slate-400 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="e.g. user_123"
                    type="text"
                    value={participantFilter}
                    onChange={(e) => setParticipantFilter(e.target.value)}
                  />
                </div>
              </div>

              {/* Duration Select Dropdown */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Duration (min)</label>
                <div className="relative flex items-center">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <select
                    className="w-full pl-9 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none"
                    value={durationFilter}
                    onChange={(e) => setDurationFilter(e.target.value)}
                  >
                    <option value="">All durations</option>
                    <option value="> 5">&gt; 5</option>
                    <option value="> 15">&gt; 15</option>
                    <option value="> 30">&gt; 30</option>
                    <option value="> 60">&gt; 60</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </div>

            </form>
          </section>
          {/* END: FilterBar */}

          {errorMessage && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700" role="alert">
              {errorMessage}
            </div>
          )}

          {/* BEGIN: SessionsTable */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs" data-purpose="sessions-table">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4" scope="col">Session ID</th>
                    <th className="py-3 px-4" scope="col">Participants</th>
                    <th className="py-3 px-4" scope="col">Start Time</th>
                    <th className="py-3 px-4" scope="col">End Time</th>
                    <th className="py-3 px-4" scope="col">Duration</th>
                    <th className="py-3 px-4" scope="col">Status</th>
                    <th className="py-3 px-4 text-right" scope="col"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {sessions.map((session) => {
                    const isSelected = session.id === selectedSession.id;
                    return (
                      <tr
                        key={session.id}
                        id={`row-${session.id}`}
                        onClick={() => setSelectedSessionId(session.id)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected
                            ? "bg-blue-50/40 hover:bg-blue-50/60"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-medium text-slate-900 flex items-center gap-1.5">
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>}
                          <span>{session.id}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {session.participants.map((p) => (
                              <span
                                key={p}
                                className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {session.startTime}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {session.endTime}
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-medium">
                          {session.duration}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                              session.status === "Ended"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {session.status}
                          </span>
                        </td>
                        <td
                          className={`py-3 px-4 text-right transition-colors ${
                            isSelected
                              ? "text-blue-600"
                              : "text-slate-400 group-hover:text-slate-600"
                          }`}
                        >
                          <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </td>
                      </tr>
                    );
                  })}
                  {isLoadingSessions && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                        Loading session metadata…
                      </td>
                    </tr>
                  )}
                  {!isLoadingSessions && sessions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                        No sessions found matching current filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          {/* END: SessionsTable */}

          {/* Visual Flow Hint Indicator */}
          <div className="flex items-center gap-2 pl-4 text-xs text-slate-400 font-medium">
            <svg className="w-4 h-4 rotate-90" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Selected Session Detailed Inspection</span>
          </div>

          {/* BEGIN: SessionDetailsCard */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm" data-purpose="session-detail-card">
            {/* Detail Header */}
            <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-slate-900">Session Details</h3>
                  <span className="font-mono text-xs text-slate-500 font-normal">
                    Session ID: <strong className="text-slate-800">{selectedSession.id}</strong>
                  </span>
                </div>
              </div>
              <div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                    selectedSession.status === "Ended"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-700 border-slate-200"
                  }`}
                >
                  {selectedSession.status}
                </span>
              </div>
            </div>

            {/* Detail 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Sub-Section: Metadata Info */}
              <div className="lg:col-span-3 space-y-6">
                {/* Participants */}
                <div>
                  <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Participants
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedSession.participants.map((p) => (
                      <span
                        key={p}
                        className="px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Time Details */}
                <div>
                  <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                    Time
                  </span>
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between py-0.5">
                      <dt className="text-slate-500">Start:</dt>
                      <dd className="font-mono text-slate-800 font-medium">{selectedSession.startTime}</dd>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <dt className="text-slate-500">End:</dt>
                      <dd className="font-mono text-slate-800 font-medium">{selectedSession.endTime}</dd>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <dt className="text-slate-500">Duration:</dt>
                      <dd className="font-semibold text-slate-900">{selectedSession.duration}</dd>
                    </div>
                  </dl>
                </div>

                {/* Compliance Note Box */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700 mb-1">
                    <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Tamper-Proof Audit</span>
                  </div>
                  Message records and file assets are cryptographically logged with immutability flags.
                </div>
              </div>

              {/* Middle Sub-Section: Chat Messages Audit Log */}
              <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l lg:border-r border-slate-200 lg:px-6 pt-4 lg:pt-0">
                <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  Chat Messages
                </span>
                <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-4 text-xs text-slate-500">
                  Chat content will be available after cloud archive integration.
                </div>
              </div>

              {/* Right Sub-Section: Timeline / Audit Trail */}
              <div className="lg:col-span-4 pt-4 lg:pt-0">
                <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  Timeline
                </span>
                <div className="relative pl-6 space-y-6">
                  {/* Vertical Line Connector */}
                  <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200" />
                  {isLoadingTimeline && (
                    <div className="space-y-3 animate-pulse" aria-label="Loading timeline">
                      <div className="h-3 w-3/4 rounded bg-slate-200" />
                      <div className="h-3 w-1/2 rounded bg-slate-200" />
                      <div className="h-3 w-2/3 rounded bg-slate-200" />
                    </div>
                  )}
                  {!isLoadingTimeline && selectedSession.timeline.map((event) => {
                    const dotBg =
                      event.color === "emerald"
                        ? "bg-emerald-500"
                        : event.color === "blue"
                        ? "bg-blue-500"
                        : event.color === "amber"
                        ? "bg-amber-500"
                        : "bg-rose-500";

                    return (
                      <div key={event.id} className="relative">
                        <span
                          className={`absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full ${dotBg} ring-4 ring-white`}
                        />
                        <h4 className="text-xs font-semibold text-slate-900 leading-tight">
                          {event.title}
                        </h4>
                        <time className="text-[11px] text-slate-400 font-mono block mt-0.5">
                          {event.time}
                        </time>
                      </div>
                    );
                  })}
                  {!isLoadingTimeline && selectedSession.id !== "—" && selectedSession.timeline.length === 0 && (
                    <p className="text-xs text-slate-400">No timeline metadata is available for this session.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
          {/* END: SessionDetailsCard */}
        </main>
        {/* END: ScrollablePageContent */}
      </div>
      {/* END: MainContentWrapper */}
    </div>
  );
};

export default Admin;
