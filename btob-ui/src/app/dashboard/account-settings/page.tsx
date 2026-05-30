"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../configs/supabase";
import { services, TenantForm } from "../dashboard-data";

export default function AccountSettingsPage() {
  const [pageLoading, setPageLoading] = useState(true);
  const [settingsStep, setSettingsStep] = useState<"service" | "profile">("service");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<TenantForm>({
    organization_name: "",
    business_registration_number: "",
    organization_phone_number: "",
    whatsapp_number: "",
    email: "",
    chosen_service: "",
    subscription_plan: "trial",
  });

  const [formSaving, setFormSaving] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [formError, setFormError] = useState("");

  // Fetch current session and load tenant details if they exist in the DB
  useEffect(() => {
    const fetchTenantData = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (session) {
          // Prefill with auth session metadata defaults
          setProfileForm((prev) => ({
            ...prev,
            email: session.user.email ?? "",
            organization_name: session.user.user_metadata?.center_name ?? "",
          }));

          // Fetch stored tenant record from the DB
          const { data: tenant, error: tenantFetchError } = await supabase
            .from("tenants")
            .select("*")
            .eq("tenant_id", session.user.id)
            .maybeSingle();

          if (tenant && !tenantFetchError) {
            setProfileForm({
              organization_name: tenant.organization_name || "",
              business_registration_number: tenant.business_registration_number || "",
              organization_phone_number: tenant.organization_phone_number || "",
              whatsapp_number: tenant.whatsapp_number || "",
              email: tenant.email || "",
              chosen_service: tenant.chosen_service || "",
              subscription_plan: tenant.subscription_plan || "trial",
            });
            if (tenant.chosen_service) {
              setSelectedService(tenant.chosen_service);
              // Direct the user to the profile form step since they already selected a service
              setSettingsStep("profile");
            }
          }
        }
      } catch (err) {
        console.error("Error loading profile details:", err);
      } finally {
        setPageLoading(false);
      }
    };
    fetchTenantData();
  }, []);

  const handleServiceSelect = (serviceId: string) => {
    if (!services.find((s) => s.id === serviceId)?.available) return;
    setSelectedService(serviceId);
  };

  const handleServiceContinue = () => {
    if (!selectedService) return;
    setProfileForm((prev) => ({ ...prev, chosen_service: selectedService }));
    setSettingsStep("profile");
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    setFormError("");
    setFormSuccess(false);

    // Client-side validation
    if (!profileForm.organization_name.trim()) {
      setFormError("Organisation name is required.");
      setFormSaving(false);
      return;
    }
    if (!profileForm.email.trim()) {
      setFormError("Email is required.");
      setFormSaving(false);
      return;
    }
    if (!profileForm.chosen_service) {
      setFormError("Please go back and select a service.");
      setFormSaving(false);
      return;
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(`Session error: ${sessionError.message}`);
      if (!session) throw new Error("You must be signed in to save your profile.");

      const tenantId = session.user.id;

      // Upsert into public.tenants
      const { error: tenantError } = await supabase
        .from("tenants")
        .upsert(
          {
            tenant_id: tenantId,
            organization_name: profileForm.organization_name.trim(),
            business_registration_number: profileForm.business_registration_number.trim() || null,
            organization_phone_number: profileForm.organization_phone_number.trim() || null,
            whatsapp_number: profileForm.whatsapp_number.trim() || null,
            email: profileForm.email.trim(),
            chosen_service: profileForm.chosen_service,
            service_status: "active",
            subscription_plan: profileForm.subscription_plan,
            profile_status: "approved",
          },
          { onConflict: "tenant_id" }
        );

      if (tenantError) {
        throw new Error(
          `Tenants save failed: ${tenantError.message}${tenantError.details ? ` — ${tenantError.details}` : ""}`
        );
      }

      // Sync name/email back to public.profiles (non-fatal)
      const { error: profileSyncError } = await supabase
        .from("profiles")
        .update({
          name: profileForm.organization_name.trim(),
          email: profileForm.email.trim(),
        })
        .eq("id", tenantId);

      if (profileSyncError) {
        console.warn("profiles sync warning:", profileSyncError.message);
      }

      setFormSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save profile. Please try again.";
      setFormError(msg);
    } finally {
      setFormSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-20 bg-transparent">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-bold">Loading configurations…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Account Settings</h2>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Configure your service and complete your organization profile
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {[
          { step: "service", label: "1. Choose Service" },
          { step: "profile", label: "2. Organization Profile" },
        ].map(({ step, label }, idx) => {
          const isActive = settingsStep === step;
          const isDone = settingsStep === "profile" && step === "service";
          return (
            <div key={step} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                    isDone
                      ? "bg-emerald-500 text-white"
                      : isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isDone ? "✓" : idx + 1}
                </div>
                <span
                  className={`text-xs font-bold transition-colors ${
                    isActive ? "text-slate-900" : isDone ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {idx === 0 && <span className="text-slate-200 font-bold">›</span>}
            </div>
          );
        })}
      </div>

      {/* ── STEP 1: Service Selection ───────────────────────────── */}
      {settingsStep === "service" && (
        <div className="flex flex-col gap-5">
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-6">
            <h3 className="text-base font-black text-slate-900 mb-1">Select Your Service</h3>
            <p className="text-sm text-slate-500 font-medium mb-6">
              Choose the booking service you want to activate for your organisation. Only one service can be active at a time.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((svc) => {
                const isSelected = selectedService === svc.id;
                return (
                  <button
                    key={svc.id}
                    id={`service-card-${svc.id}`}
                    onClick={() => handleServiceSelect(svc.id)}
                    disabled={!svc.available}
                    className={`relative flex flex-col items-start text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
                      !svc.available
                        ? "cursor-not-allowed opacity-60 bg-slate-50 border-slate-200"
                        : isSelected
                        ? "cursor-pointer"
                        : "cursor-pointer bg-white border-slate-200 hover:border-slate-300 hover:shadow-md"
                    }`}
                    style={
                      svc.available && isSelected
                        ? { borderColor: svc.color, background: svc.bgColor, boxShadow: `0 0 0 4px ${svc.color}18` }
                        : {}
                    }
                  >
                    {/* Badge */}
                    <span
                      className={`absolute top-3 right-3 text-xs font-black px-2 py-0.5 rounded-full ${
                        svc.available ? "text-white" : "bg-slate-100 text-slate-500"
                      }`}
                      style={svc.available ? { background: svc.color } : {}}
                    >
                      {svc.badge}
                    </span>

                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                      style={{
                        background: svc.bgColor,
                        color: svc.color,
                        border: `1px solid ${svc.borderColor}`,
                      }}
                    >
                      {svc.icon}
                    </div>

                    <h4 className="text-sm font-black text-slate-900 mb-1">{svc.label}</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">{svc.description}</p>

                    {/* Selected ring */}
                    {svc.available && isSelected && (
                      <div className="flex items-center gap-1.5 mt-3">
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ background: svc.color }}
                        >
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span className="text-xs font-bold" style={{ color: svc.color }}>Selected</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              id="service-continue-btn"
              onClick={handleServiceContinue}
              disabled={!selectedService}
              className="btn-primary px-8 py-3 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Continue to Profile →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Organization Profile ───────────────────────── */}
      {settingsStep === "profile" && (
        <div className="flex flex-col gap-5">
          {/* Selected service chip */}
          {selectedService && (() => {
            const svc = services.find((s) => s.id === selectedService)!;
            return (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-bold"
                style={{ background: svc.bgColor, borderColor: svc.borderColor, color: svc.color }}
              >
                <span className="text-base">{svc.available ? "✅" : "⏳"}</span>
                Selected Service: <span className="font-black">{svc.label}</span>
                <button
                  className="ml-auto text-xs font-bold underline opacity-70 hover:opacity-100 transition-opacity"
                  onClick={() => setSettingsStep("service")}
                >
                  Change
                </button>
              </div>
            );
          })()}

          {/* Form */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-6 sm:p-8">
            <h3 className="text-base font-black text-slate-900 mb-1">Organisation Details</h3>
            <p className="text-sm text-slate-500 font-medium mb-6">
              Fill in your organisation information. This will be used to set up your tenant profile.
            </p>

            {formSuccess && (
              <div className="mb-5 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm font-semibold flex items-center gap-2">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Profile saved successfully! Your tenant account is now active.
              </div>
            )}

            {formError && (
              <div className="mb-5 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-sm font-semibold flex items-center gap-2">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {formError}
              </div>
            )}

            <form onSubmit={handleProfileSave} className="flex flex-col gap-5">
              {/* Row 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="org-name" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Organisation Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    required
                    value={profileForm.organization_name}
                    onChange={(e) => setProfileForm((p) => ({ ...p, organization_name: e.target.value }))}
                    placeholder="Apex Medical Center"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-medium text-sm transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="business-reg" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Business Registration No.
                  </label>
                  <input
                    id="business-reg"
                    type="text"
                    value={profileForm.business_registration_number}
                    onChange={(e) => setProfileForm((p) => ({ ...p, business_registration_number: e.target.value }))}
                    placeholder="BR-2024-001234"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-medium text-sm transition-all"
                  />
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="org-phone" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Organisation Phone
                  </label>
                  <input
                    id="org-phone"
                    type="tel"
                    value={profileForm.organization_phone_number}
                    onChange={(e) => setProfileForm((p) => ({ ...p, organization_phone_number: e.target.value }))}
                    placeholder="+60-3-1234-5678"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-medium text-sm transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="whatsapp" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    WhatsApp Number
                  </label>
                  <div className="relative">
                    <input
                      id="whatsapp"
                      type="tel"
                      value={profileForm.whatsapp_number}
                      onChange={(e) => setProfileForm((p) => ({ ...p, whatsapp_number: e.target.value }))}
                      placeholder="+601X-XXXXXXX"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-slate-900 font-medium text-sm transition-all"
                    />
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm">💬</span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">This number will be used for your AI booking bot</p>
                </div>
              </div>

              {/* Row 3 */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="org-email" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Organisation Email <span className="text-rose-500">*</span>
                </label>
                <input
                  id="org-email"
                  type="email"
                  required
                  value={profileForm.email}
                  onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="info@apexmedical.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-slate-900 font-medium text-sm transition-all"
                />
              </div>

              {/* Row 4 - Subscription plan */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Subscription Plan
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(["trial", "basic", "premium", "enterprise"] as const).map((plan) => {
                    const isActive = profileForm.subscription_plan === plan;
                    const planColors: Record<string, string> = {
                      trial: "#64748b",
                      basic: "#0ea5e9",
                      premium: "#7c3aed",
                      enterprise: "#f59e0b",
                    };
                    return (
                      <button
                        type="button"
                        key={plan}
                        id={`plan-${plan}`}
                        onClick={() => setProfileForm((p) => ({ ...p, subscription_plan: plan }))}
                        className={`py-2.5 px-3 rounded-xl text-xs font-bold border-2 capitalize transition-all ${
                          isActive
                            ? "text-white border-transparent shadow-sm"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                        style={isActive ? { background: planColors[plan], borderColor: planColors[plan] } : {}}
                      >
                        {plan}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 font-medium">You start with Trial — upgrade anytime</p>
              </div>

              {/* Divider */}
              <div className="h-px bg-slate-100 my-1" />

              {/* Info box */}
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-medium text-indigo-700 flex items-start gap-2">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  Your profile is stored securely and links to your tenant account in the Grab My Seat platform. 
                  The <strong>WhatsApp number</strong> will be configured as the entry point for your AI booking bot.
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-4 mt-2">
                <button
                  type="button"
                  onClick={() => setSettingsStep("service")}
                  className="btn-ghost px-5 py-3 rounded-xl text-sm font-bold"
                >
                  ← Back
                </button>
                <button
                  id="profile-save-btn"
                  type="submit"
                  disabled={formSaving}
                  className="btn-primary px-8 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {formSaving ? "Saving…" : "Save & Activate ✓"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
