"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../../configs/supabase";

interface AvailableService {
  id: string;
  tenant_id: string;
  clinic_center_name: string;
  available_service: string;
  doctor_name: string | null;
  is_active: boolean;
  created_at: string;
}

export default function ManageBookingsPage() {
  // Authentication & Tenant Validation State
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [tenantRecord, setTenantRecord] = useState<any>(null);
  const [tenantChecked, setTenantChecked] = useState(false);

  // Available Services State
  const [services, setServices] = useState<AvailableService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  // Modals & Forms State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<AvailableService | null>(null);
  
  const [formService, setFormService] = useState("");
  const [formDoctor, setFormDoctor] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // ── 1. Fetch Session & Tenant Details ──────────────────────────────────────
  useEffect(() => {
    const initializePage = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (session) {
          setSessionUser(session.user);

          // Check for tenant profile row
          const { data: tenant, error: tenantError } = await supabase
            .from("tenants")
            .select("tenant_id, organization_name")
            .eq("tenant_id", session.user.id)
            .maybeSingle();

          if (tenant && !tenantError) {
            setTenantRecord(tenant);
            // Fetch available services
            await fetchServices(session.user.id);
          }
        }
      } catch (err) {
        console.error("Initialization error:", err);
      } finally {
        setTenantChecked(true);
        setServicesLoading(false);
      }
    };

    initializePage();
  }, []);

  // ── 2. Fetch Services List ─────────────────────────────────────────────────
  const fetchServices = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("available_services")
        .select("*")
        .eq("tenant_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setServices(data || []);
    } catch (err) {
      console.error("Error fetching available services:", err);
    }
  };

  // ── 3. Create Service ──────────────────────────────────────────────────────
  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formService.trim()) {
      setFormError("Service name is required.");
      return;
    }
    if (!tenantRecord) {
      setFormError("Account Settings configuration missing.");
      return;
    }

    setFormSaving(true);
    setFormError("");

    try {
      const { data, error } = await supabase
        .from("available_services")
        .insert({
          tenant_id: tenantRecord.tenant_id,
          clinic_center_name: tenantRecord.organization_name,
          available_service: formService.trim(),
          doctor_name: formDoctor.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setServices((prev) => [data, ...prev]);
      setIsAddModalOpen(false);
      setFormService("");
      setFormDoctor("");
    } catch (err: any) {
      setFormError(err.message || "Failed to add service. Please try again.");
    } finally {
      setFormSaving(false);
    }
  };

  // ── 4. Update Service Details ──────────────────────────────────────────────
  const handleUpdateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;
    if (!formService.trim()) {
      setFormError("Service name is required.");
      return;
    }

    setFormSaving(true);
    setFormError("");

    try {
      const { error } = await supabase
        .from("available_services")
        .update({
          available_service: formService.trim(),
          doctor_name: formDoctor.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedService.id);

      if (error) throw error;

      setServices((prev) =>
        prev.map((s) =>
          s.id === selectedService.id
            ? { ...s, available_service: formService.trim(), doctor_name: formDoctor.trim() || null }
            : s
        )
      );
      setIsEditModalOpen(false);
      setSelectedService(null);
      setFormService("");
      setFormDoctor("");
    } catch (err: any) {
      setFormError(err.message || "Failed to update service.");
    } finally {
      setFormSaving(false);
    }
  };

  // ── 5. Toggle Service Active Status ────────────────────────────────────────
  const handleToggleActive = async (serviceId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("available_services")
        .update({ is_active: !currentStatus })
        .eq("id", serviceId);

      if (error) throw error;

      setServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, is_active: !currentStatus } : s))
      );
    } catch (err) {
      console.error("Error toggling active status:", err);
    }
  };

  // ── 6. Delete Service ──────────────────────────────────────────────────────
  const handleDeleteService = async (serviceId: string) => {
    if (!window.confirm("Are you sure you want to delete this service? This action cannot be undone.")) return;

    try {
      const { error } = await supabase
        .from("available_services")
        .delete()
        .eq("id", serviceId);

      if (error) throw error;

      setServices((prev) => prev.filter((s) => s.id !== serviceId));
    } catch (err) {
      console.error("Error deleting service:", err);
    }
  };

  const openEditModal = (svc: AvailableService) => {
    setSelectedService(svc);
    setFormService(svc.available_service);
    setFormDoctor(svc.doctor_name || "");
    setIsEditModalOpen(true);
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Manage Bookings</h2>
        <p className="text-sm text-slate-500 font-medium mt-1">Full control over available services</p>
      </div>

      <div className="flex flex-col gap-6">
        {/* A. If not checked or loading services */}
        {(!tenantChecked || (tenantRecord && servicesLoading)) ? (
          <div className="flex items-center justify-center py-20 bg-transparent">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-xs text-slate-400 font-bold">Verifying configurations…</span>
            </div>
          </div>
        ) : !tenantRecord ? (
          /* B. Warning: Account Settings Incomplete */
          <div className="max-w-2xl mx-auto mt-6 bg-white rounded-2xl border border-amber-200/80 shadow-sm p-8 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-2xl shadow-inner">
              ⚠️
            </div>
            <h3 className="text-lg font-black text-slate-900">Account Settings Incomplete</h3>
            <p className="text-sm text-slate-500 font-semibold leading-relaxed max-w-md">
              Please complete your Account Settings to set up your organisation profile and activate your service before managing available services.
            </p>
            <Link
              href="/dashboard/account-settings"
              className="btn-primary px-6 py-3 rounded-xl text-sm font-bold mt-2"
            >
              Configure Account Settings →
            </Link>
          </div>
        ) : (
          /* C. Config Panel */
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">Configure Services</h3>
                <p className="text-xs text-slate-400 font-medium">Manage available treatment/booking categories for {tenantRecord.organization_name}</p>
              </div>
              <button
                onClick={() => {
                  setFormError("");
                  setFormService("");
                  setFormDoctor("");
                  setIsAddModalOpen(true);
                }}
                className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Service
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      {["Service", "Assigned Doctor", "Status", "Actions"].map((col) => (
                        <th key={col} className="px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {services.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-12 text-center text-sm font-medium text-slate-400">
                          No services added yet. Click &quot;Add Service&quot; above to set one up.
                        </td>
                      </tr>
                    ) : (
                      services.map((svc) => (
                        <tr key={svc.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <span className="text-sm font-bold text-slate-800">{svc.available_service}</span>
                          </td>
                          <td className="px-5 py-4">
                            {svc.doctor_name ? (
                              <span className="text-sm font-semibold text-slate-600">{svc.doctor_name}</span>
                            ) : (
                              <span className="text-xs font-medium text-slate-400 italic">No doctor assigned</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <button
                              onClick={() => handleToggleActive(svc.id, svc.is_active)}
                              className={`text-xs px-2.5 py-1 rounded-full font-bold border transition-colors ${
                                svc.is_active
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100"
                                  : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100"
                              }`}
                            >
                              {svc.is_active ? "Active" : "Inactive"}
                            </button>
                          </td>
                            <td className="px-5 py-4">
                              <div className="flex gap-3 items-center">
                                <Link
                                  href={`/dashboard/manage-bookings/schedule?serviceId=${svc.id}&serviceName=${encodeURIComponent(svc.available_service)}&doctorName=${encodeURIComponent(svc.doctor_name || "")}`}
                                  className="text-xs font-bold text-emerald-600 hover:text-emerald-800 transition-colors"
                                >
                                  Schedule Booking
                                </Link>
                                <span className="text-slate-300">|</span>
                                <button
                                  onClick={() => openEditModal(svc)}
                                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                >
                                  Edit
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                  onClick={() => handleDeleteService(svc.id)}
                                  className="text-xs font-bold text-rose-500 hover:text-rose-700 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── ADD SERVICE MODAL ────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-base">Add Available Service</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddService} className="p-6 flex flex-col gap-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold">
                  {formError}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Service Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. General Consultation"
                  value={formService}
                  onChange={(e) => setFormService(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900 font-medium text-sm transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Assigned Doctor (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Priya Nair"
                  value={formDoctor}
                  onChange={(e) => setFormDoctor(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900 font-medium text-sm transition-all"
                />
              </div>
              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="btn-primary px-5 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {formSaving ? "Adding…" : "Add Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT SERVICE MODAL ───────────────────────────────────────────────── */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-base">Edit Available Service</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdateService} className="p-6 flex flex-col gap-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold">
                  {formError}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Service Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. General Consultation"
                  value={formService}
                  onChange={(e) => setFormService(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900 font-medium text-sm transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Assigned Doctor (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Priya Nair"
                  value={formDoctor}
                  onChange={(e) => setFormDoctor(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-900 font-medium text-sm transition-all"
                />
              </div>
              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="btn-primary px-5 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {formSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
