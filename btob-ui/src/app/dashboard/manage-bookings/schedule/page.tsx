"use client";

import { useState, Suspense, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../../configs/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface GeneratedSlot {
  slot_time: string;
  display: string;
  selected: boolean;
}

interface SavedDate {
  date: string;
  slotCount: number;
  openTime: string;
  closeTime: string;
}

type SlotStatus = "available" | "timelocked" | "booked";

interface DBSlot {
  id: string;
  slot_date: string;
  slot_time: string;
  status: SlotStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr || "00";
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${period}`;
}

function generateSlots(openTime: string, closeTime: string, slotCount: number): GeneratedSlot[] {
  if (!openTime || !closeTime || slotCount < 1) return [];
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  const totalMins = closeMins - openMins;
  if (totalMins <= 0) return [];
  const interval = Math.floor(totalMins / slotCount);
  const slots: GeneratedSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    const mins = openMins + i * interval;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    if (hh >= 24) break;
    const slot_time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    slots.push({ slot_time, display: formatTime12(slot_time), selected: true });
  }
  return slots;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

const STATUS_STYLES: Record<SlotStatus, { chip: string; badge: string; label: string }> = {
  available:   { chip: "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-200", badge: "bg-emerald-50 text-emerald-700 border-emerald-100", label: "Available" },
  timelocked:  { chip: "bg-amber-400 border-amber-400 text-white shadow-md shadow-amber-200",       badge: "bg-amber-50 text-amber-700 border-amber-100",       label: "Time Locked" },
  booked:      { chip: "bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-200",          badge: "bg-rose-50 text-rose-700 border-rose-100",          label: "Booked" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Slot Action Modal
// ─────────────────────────────────────────────────────────────────────────────
function SlotModal({
  slot,
  onClose,
  onStatusChange,
  onDelete,
}: {
  slot: DBSlot;
  onClose: () => void;
  onStatusChange: (id: string, status: SlotStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleStatus = async (status: SlotStatus) => {
    setBusy(true);
    await onStatusChange(slot.id, status);
    setBusy(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    await onDelete(slot.id);
    setBusy(false);
    onClose();
  };

  const st = STATUS_STYLES[slot.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Manage Slot</p>
            <h4 className="text-base font-black text-slate-900 mt-0.5">{formatTime12(slot.slot_time)}</h4>
            <p className="text-xs text-slate-400 font-medium">{formatDateDisplay(slot.slot_date)}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${st.badge}`}>{st.label}</span>
        </div>

        {/* Status options */}
        <div className="p-5 flex flex-col gap-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Change Status</p>
          <div className="flex flex-col gap-2">
            {(["available", "timelocked", "booked"] as SlotStatus[]).map((s) => (
              <button
                key={s}
                disabled={busy || slot.status === s}
                onClick={() => handleStatus(s)}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold border-2 transition-all text-left flex items-center gap-3 ${
                  slot.status === s
                    ? "opacity-40 cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                    : `${STATUS_STYLES[s].chip} hover:opacity-90`
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s === "available" ? "bg-white" : s === "timelocked" ? "bg-white" : "bg-white"
                }`} />
                {slot.status === s ? `Current: ${STATUS_STYLES[s].label}` : `Mark as ${STATUS_STYLES[s].label}`}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 mt-1 pt-3 flex flex-col gap-2">
            {confirmDelete ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Yes, Delete"}
                </button>
              </div>
            ) : (
              <button
                onClick={handleDelete}
                disabled={busy}
                className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-50 transition-colors"
              >
                🗑 Delete this Slot
              </button>
            )}
            <button
              onClick={onClose}
              disabled={busy}
              className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manage Slots Tab
// ─────────────────────────────────────────────────────────────────────────────
function ManageSlotsTab({
  serviceId,
  tenantId,
}: {
  serviceId: string;
  tenantId: string | null;
}) {
  const [allSlots, setAllSlots] = useState<DBSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [activeSlot, setActiveSlot] = useState<DBSlot | null>(null);
  const [actionError, setActionError] = useState("");

  // All unique dates present in fetched slots
  const uniqueDates = Array.from(new Set(allSlots.map((s) => s.slot_date))).sort();

  // Slots for the selected filter date (or all if none selected)
  const visibleSlots = filterDate
    ? allSlots.filter((s) => s.slot_date === filterDate)
    : allSlots;

  // Group visible slots by date for display
  const groupedByDate: Record<string, DBSlot[]> = {};
  for (const slot of visibleSlots) {
    if (!groupedByDate[slot.slot_date]) groupedByDate[slot.slot_date] = [];
    groupedByDate[slot.slot_date].push(slot);
  }
  const sortedGroupDates = Object.keys(groupedByDate).sort();

  const fetchSlots = useCallback(async () => {
    if (!serviceId) return;
    setLoading(true);
    setFetchError("");
    try {
      const { data, error } = await supabase
        .from("available_slots")
        .select("id, slot_date, slot_time, status")
        .eq("available_service_id", serviceId)
        .order("slot_date", { ascending: true })
        .order("slot_time", { ascending: true });

      if (error) throw error;
      setAllSlots((data as DBSlot[]) || []);
    } catch (err: any) {
      setFetchError(err.message || "Failed to load slots.");
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const handleStatusChange = async (id: string, status: SlotStatus) => {
    setActionError("");
    const { error } = await supabase
      .from("available_slots")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { setActionError(error.message); return; }
    setAllSlots((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const handleDelete = async (id: string) => {
    setActionError("");
    const { error } = await supabase.from("available_slots").delete().eq("id", id);
    if (error) { setActionError(error.message); return; }
    setAllSlots((prev) => prev.filter((s) => s.id !== id));
  };

  // Counts
  const counts = allSlots.reduce(
    (acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-bold">Loading slots…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Action Error */}
      {actionError && (
        <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-xl">
          <span className="text-rose-500 flex-shrink-0">⚠</span>
          <p className="text-sm font-semibold text-rose-600">{actionError}</p>
        </div>
      )}

      {/* Fetch Error */}
      {fetchError && (
        <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-xl">
          <span className="text-rose-500 flex-shrink-0">⚠</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-600">{fetchError}</p>
            <button onClick={fetchSlots} className="text-xs font-bold text-rose-500 underline mt-1">Retry</button>
          </div>
        </div>
      )}

      {allSlots.length === 0 && !fetchError ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200/70 shadow-sm gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-2xl">📅</div>
          <div className="text-center">
            <p className="font-black text-slate-700">No slots created yet</p>
            <p className="text-xs text-slate-400 font-medium mt-1">Go to the Create Slots tab to set up your first schedule.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {(["available", "timelocked", "booked"] as SlotStatus[]).map((s) => (
              <div key={s} className={`rounded-xl border p-3 text-center ${STATUS_STYLES[s].badge}`}>
                <p className="text-2xl font-black">{counts[s] || 0}</p>
                <p className="text-xs font-bold mt-0.5 opacity-80">{STATUS_STYLES[s].label}</p>
              </div>
            ))}
          </div>

          {/* Date filter */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Filter by Date</p>
              {filterDate && (
                <button
                  onClick={() => setFilterDate("")}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  Show All
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {uniqueDates.map((d) => {
                const daySlots = allSlots.filter((s) => s.slot_date === d);
                const isActive = filterDate === d;
                return (
                  <button
                    key={d}
                    onClick={() => setFilterDate(isActive ? "" : d)}
                    className={`flex flex-col items-center px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all ${
                      isActive
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200"
                        : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                    }`}
                  >
                    <span>{new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <span className={`text-[10px] font-semibold mt-0.5 ${isActive ? "text-indigo-200" : "text-slate-400"}`}>
                      {daySlots.length} slots
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 flex-wrap px-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Legend:</p>
            {(["available", "timelocked", "booked"] as SlotStatus[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full ${
                  s === "available" ? "bg-emerald-500" : s === "timelocked" ? "bg-amber-400" : "bg-rose-500"
                }`} />
                <span className="text-xs font-semibold text-slate-500">{STATUS_STYLES[s].label}</span>
              </div>
            ))}
            <p className="text-xs text-slate-400 font-medium ml-auto">Click any slot to manage it</p>
          </div>

          {/* Slot groups */}
          <div className="flex flex-col gap-5">
            {sortedGroupDates.map((date) => {
              const daySlots = groupedByDate[date].sort((a, b) => a.slot_time.localeCompare(b.slot_time));
              const dayAvailable = daySlots.filter((s) => s.status === "available").length;
              const dayBooked = daySlots.filter((s) => s.status === "booked").length;

              return (
                <div key={date} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-sm font-black text-slate-800">{formatDateDisplay(date)}</p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{daySlots.length} total slots</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {dayAvailable} open
                      </span>
                      <span className="px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
                        {dayBooked} booked
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
                      {daySlots.map((slot) => {
                        const st = STATUS_STYLES[slot.status];
                        return (
                          <button
                            key={slot.id}
                            onClick={() => { setActiveSlot(slot); setActionError(""); }}
                            className={`relative py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all text-center hover:scale-105 active:scale-95 ${st.chip}`}
                          >
                            {formatTime12(slot.slot_time)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Slot action modal */}
      {activeSlot && (
        <SlotModal
          slot={activeSlot}
          onClose={() => setActiveSlot(null)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Slots Tab (original flow)
// ─────────────────────────────────────────────────────────────────────────────
function CreateSlotsTab({
  serviceId,
  serviceName,
  tenantId,
}: {
  serviceId: string;
  serviceName: string;
  tenantId: string | null;
}) {
  const [step, setStep] = useState<"setup" | "preview" | "saving" | "done">("setup");
  const [selectedDate, setSelectedDate] = useState("");
  const [openTime, setOpenTime] = useState("08:00");
  const [closeTime, setCloseTime] = useState("17:00");
  const [slotCount, setSlotCount] = useState(8);
  const [generatedSlots, setGeneratedSlots] = useState<GeneratedSlot[]>([]);
  const [savedDates, setSavedDates] = useState<SavedDate[]>([]);
  const [configError, setConfigError] = useState("");
  const [saveError, setSaveError] = useState("");

  const todayStr = new Date().toISOString().split("T")[0];
  const savedDateStrings = savedDates.map((d) => d.date);
  const selectedCount = generatedSlots.filter((s) => s.selected).length;

  const handleGeneratePreview = () => {
    setConfigError("");
    if (!selectedDate) { setConfigError("Please select a date."); return; }
    if (savedDateStrings.includes(selectedDate)) {
      setConfigError("Slots for this date have already been saved. Choose another date."); return;
    }
    if (!openTime || !closeTime) { setConfigError("Please set both open and close times."); return; }
    const [oh, om] = openTime.split(":").map(Number);
    const [ch, cm] = closeTime.split(":").map(Number);
    if (oh * 60 + om >= ch * 60 + cm) { setConfigError("Close time must be after open time."); return; }
    if (slotCount < 1 || slotCount > 100) { setConfigError("Slot count must be between 1 and 100."); return; }
    setGeneratedSlots(generateSlots(openTime, closeTime, slotCount));
    setStep("preview");
  };

  const toggleSlot = (idx: number) => {
    setGeneratedSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, selected: !s.selected } : s)));
  };

  const handleConfirmSlots = async () => {
    setSaveError("");
    const activeSlots = generatedSlots.filter((s) => s.selected);
    if (activeSlots.length === 0) { setSaveError("Please select at least one slot before confirming."); return; }
    if (!tenantId) { setSaveError("Session expired. Please refresh the page."); return; }
    if (!serviceId) { setSaveError("Service ID is missing. Please go back and try again."); return; }

    setStep("saving");

    try {
      const rows = activeSlots.map((s) => ({
        tenant_id: tenantId,
        available_service_id: serviceId,
        slot_date: selectedDate,
        slot_time: s.slot_time,
        status: "available",
      }));

      const { error } = await supabase.from("available_slots").insert(rows);

      if (error) {
        if (error.code === "23505") {
          setSaveError("Some slots already exist for this date. Please choose a different date or deselect conflicting times.");
        } else {
          setSaveError(error.message || "Failed to save slots. Please try again.");
        }
        setStep("preview");
        return;
      }

      setSavedDates((prev) => [...prev, { date: selectedDate, slotCount: activeSlots.length, openTime, closeTime }]);
      setStep("done");
    } catch (err: any) {
      setSaveError(err.message || "An unexpected error occurred.");
      setStep("preview");
    }
  };

  const handleAddNextDate = () => {
    setSelectedDate("");
    setOpenTime("08:00");
    setCloseTime("17:00");
    setSlotCount(8);
    setGeneratedSlots([]);
    setConfigError("");
    setSaveError("");
    setStep("setup");
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Saved dates log */}
      {savedDates.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">✅ Configured in This Session</p>
          </div>
          <div className="divide-y divide-slate-100">
            {savedDates.map((d) => (
              <div key={d.date} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800">{formatDateDisplay(d.date)}</p>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {formatTime12(d.openTime)} – {formatTime12(d.closeTime)} · {d.slotCount} slots
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold">Saved</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP: SETUP */}
      {step === "setup" && (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-6 sm:p-8 flex flex-col gap-6">
          <div>
            <h3 className="text-base font-black text-slate-900">{savedDates.length === 0 ? "Configure First Date" : "Add Next Date"}</h3>
            <p className="text-xs text-slate-400 font-medium mt-1">Select a date and define the open hours and number of slots to generate.</p>
          </div>

          {configError && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-xl">
              <span className="text-rose-500 mt-0.5 flex-shrink-0">⚠</span>
              <p className="text-sm font-semibold text-rose-600">{configError}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Select Date <span className="text-rose-500">*</span></label>
            <input
              type="date" min={todayStr} value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setConfigError(""); }}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900 font-semibold text-sm transition-all bg-white"
            />
            {selectedDate && <p className="text-xs text-indigo-600 font-semibold ml-1">{formatDateDisplay(selectedDate)}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Open Time <span className="text-rose-500">*</span></label>
              <input type="time" value={openTime}
                onChange={(e) => { setOpenTime(e.target.value); setConfigError(""); }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900 font-semibold text-sm transition-all bg-white"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Close Time <span className="text-rose-500">*</span></label>
              <input type="time" value={closeTime}
                onChange={(e) => { setCloseTime(e.target.value); setConfigError(""); }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900 font-semibold text-sm transition-all bg-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Number of Slots <span className="text-rose-500">*</span></label>
            <div className="flex items-center gap-4">
              <input type="range" min={1} max={50} value={slotCount}
                onChange={(e) => { setSlotCount(Number(e.target.value)); setConfigError(""); }}
                className="flex-1 accent-indigo-600"
              />
              <div className="w-16 h-11 rounded-xl border border-slate-200 flex items-center justify-center bg-slate-50">
                <input type="number" min={1} max={100} value={slotCount}
                  onChange={(e) => { setSlotCount(Math.max(1, Math.min(100, Number(e.target.value)))); setConfigError(""); }}
                  className="w-full text-center text-sm font-black text-slate-900 bg-transparent focus:outline-none"
                />
              </div>
            </div>
            {openTime && closeTime && slotCount > 0 && (() => {
              const [oh, om] = openTime.split(":").map(Number);
              const [ch, cm] = closeTime.split(":").map(Number);
              const totalMins = (ch * 60 + cm) - (oh * 60 + om);
              if (totalMins > 0) {
                const interval = Math.floor(totalMins / slotCount);
                return <p className="text-xs text-slate-400 font-medium">Each slot ~<span className="text-indigo-600 font-bold">{interval} min</span> apart</p>;
              }
              return null;
            })()}
          </div>

          <button onClick={handleGeneratePreview}
            className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 mt-2">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            Generate Slot Preview
          </button>
        </div>
      )}

      {/* STEP: PREVIEW */}
      {step === "preview" && (
        <div className="flex flex-col gap-5">
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-6 sm:p-8 flex flex-col gap-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Preview Slots</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {formatDateDisplay(selectedDate)} · {formatTime12(openTime)} – {formatTime12(closeTime)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500">
                  <span className="text-indigo-600">{selectedCount}</span> / {generatedSlots.length} selected
                </span>
                <button onClick={() => setGeneratedSlots((p) => p.map((s) => ({ ...s, selected: true })))}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">Select All</button>
                <button onClick={() => setGeneratedSlots((p) => p.map((s) => ({ ...s, selected: false })))}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">Clear All</button>
              </div>
            </div>

            {saveError && (
              <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                <span className="text-rose-500 mt-0.5 flex-shrink-0">⚠</span>
                <p className="text-sm font-semibold text-rose-600">{saveError}</p>
              </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
              {generatedSlots.map((slot, idx) => (
                <button key={idx} onClick={() => toggleSlot(idx)}
                  className={`relative py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all text-center ${
                    slot.selected
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200"
                      : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                  }`}>
                  {slot.display}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-400 font-medium text-center">Click a slot to toggle it on/off before confirming</p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep("setup")}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              ← Back to Setup
            </button>
            <button onClick={handleConfirmSlots} disabled={selectedCount === 0}
              className="flex-[2] btn-primary py-3.5 rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Confirm & Save {selectedCount} Slot{selectedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {/* STEP: SAVING */}
      {step === "saving" && (
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-12 flex flex-col items-center gap-5">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          <div className="text-center">
            <p className="font-black text-slate-800">Saving Slots…</p>
            <p className="text-xs text-slate-400 font-medium mt-1">Please wait while we save your slots to the database.</p>
          </div>
        </div>
      )}

      {/* STEP: DONE */}
      {step === "done" && (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-xl p-8 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-2xl text-emerald-600 shadow-inner">✓</div>
          <div>
            <h3 className="text-xl font-black text-slate-900">Slots Saved Successfully!</h3>
            <p className="text-sm text-slate-500 font-medium mt-2 leading-relaxed">
              <strong className="text-slate-800">{savedDates[savedDates.length - 1]?.slotCount}</strong> slots saved for{" "}
              <strong className="text-slate-800">{formatDateDisplay(selectedDate)}</strong>.
            </p>
          </div>

          <div className="w-full bg-slate-50 rounded-xl border border-slate-100 p-4 text-left flex flex-col gap-2">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>Date</span><span className="text-slate-900">{formatDateDisplay(selectedDate)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>Hours</span><span className="text-slate-900">{formatTime12(openTime)} – {formatTime12(closeTime)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>Slots Saved</span><span className="text-emerald-700 font-black">{savedDates[savedDates.length - 1]?.slotCount}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>Total Dates (Session)</span><span className="text-indigo-600 font-black">{savedDates.length}</span>
            </div>
          </div>

          <div className="flex gap-3 w-full mt-2">
            <Link href="/dashboard/manage-bookings"
              className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors text-center">
              Done
            </Link>
            <button onClick={handleAddNextDate}
              className="flex-[2] btn-primary py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Slots for Next Date
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root Inner Component
// ─────────────────────────────────────────────────────────────────────────────
function SlotSchedulerPage() {
  const searchParams = useSearchParams();

  const serviceId   = searchParams.get("serviceId")   || "";
  const serviceName = searchParams.get("serviceName") || "Service";
  const doctorName  = searchParams.get("doctorName")  || "";

  const [activeTab, setActiveTab] = useState<"create" | "manage">("create");
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setTenantId(session.user.id);
    });
  }, []);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/dashboard/manage-bookings"
          className="mt-1 p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-all flex-shrink-0">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-black text-slate-900">Slot Scheduler</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Create and manage available booking slots</p>
        </div>
      </div>

      {/* Service Info Banner */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#4f46e5" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Service</p>
          <p className="text-sm font-black text-slate-900 mt-0.5 truncate">{serviceName}</p>
          {doctorName && <p className="text-xs font-semibold text-slate-500 truncate">{doctorName}</p>}
        </div>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab("create")}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === "create"
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          ➕ Create Slots
        </button>
        <button
          onClick={() => setActiveTab("manage")}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === "manage"
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          🗓 Manage Slots
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "create" ? (
        <CreateSlotsTab serviceId={serviceId} serviceName={serviceName} tenantId={tenantId} />
      ) : (
        <ManageSlotsTab serviceId={serviceId} tenantId={tenantId} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Export with Suspense
// ─────────────────────────────────────────────────────────────────────────────
export default function ScheduleBookingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
            <span className="text-xs text-slate-400 font-bold">Loading…</span>
          </div>
        </div>
      }
    >
      <SlotSchedulerPage />
    </Suspense>
  );
}
