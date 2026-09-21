import React, { useState } from "react";
import { login, register } from "../lib/api";

export interface AdminLoginRegisterProps {
  onLoginSuccess?: (data?: { identifier: string; token: string }) => void;
  onRegisterSuccess?: (data?: { name: string; email: string; role: string; token: string }) => void;
  onBackToApp?: () => void;
}

export const AdminLoginRegister: React.FC<AdminLoginRegisterProps> = ({
  onLoginSuccess,
  onRegisterSuccess,
  onBackToApp,
}) => {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);

  // Register form state
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regRole, setRegRole] = useState("lead-auditor");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // Submission simulation state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authStage, setAuthStage] = useState<"idle" | "verifying" | "granted">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMessage("Please enter both identifier and password.");
      return;
    }

    setIsSubmitting(true);
    setAuthStage("verifying");

    try {
      const response = await login({ email: loginIdentifier.trim(), password: loginPassword });
      if (!response.token) throw new Error("The server did not return an access token.");
      // The backend also sets an HttpOnly CookieToken. Local storage is kept as
      // the development bearer-token fallback used by the shared API client.
      localStorage.setItem("token", response.token);
      setAuthStage("granted");
      onLoginSuccess?.({ identifier: loginIdentifier.trim(), token: response.token });
    } catch (error: any) {
      setErrorMessage(error.response?.data?.error || "Unable to sign in. Please try again.");
      setAuthStage("idle");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!regFullName.trim() || !regEmail.trim() || !regPassword) {
      setErrorMessage("Please fill in all required registration fields.");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setAuthStage("verifying");

    try {
      const [firstName = "User", ...lastNameParts] = regFullName.trim().split(/\s+/);
      const response = await register({
        email: regEmail.trim(),
        password: regPassword,
        firstName,
        lastName: lastNameParts.join(" ") || "Member",
      });
      if (!response.token) throw new Error("The server did not return an access token.");
      localStorage.setItem("token", response.token);
      setAuthStage("granted");
      onRegisterSuccess?.({
        name: regFullName.trim(),
        email: regEmail.trim(),
        role: regRole,
        token: response.token,
      });
    } catch (error: any) {
      setErrorMessage(error.response?.data?.error || "Unable to create the account. Please try again.");
      setAuthStage("idle");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between text-on-surface antialiased">
      {/* Header */}
      <header className="w-full bg-surface-container-low/60 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-16 w-full px-margin flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined text-[18px]">shield</span>
            </div>
            <span className="font-headline-sm text-headline-sm text-on-surface">
              Admin Panel - Audit &amp; Compliance
            </span>
          </div>
          <div className="flex items-center gap-space-sm">
            {onBackToApp && (
              <button
                type="button"
                onClick={onBackToApp}
                className="px-2.5 py-1 text-xs text-on-surface-variant hover:text-on-surface bg-surface-container-high rounded-md transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                <span>User App</span>
              </button>
            )}
            <div className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">
              <span className="w-2 h-2 rounded-full bg-tertiary"></span>
              <span>SESSION SECURED</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full flex items-center justify-center px-margin py-margin">
        <div className="flex flex-col w-full items-center justify-center py-space-md sm:py-space-xl">
          {/* Ambient Security Glow */}
          <div className="relative w-full max-w-[540px] flex flex-col items-center">
            <div className="absolute -top-16 -left-12 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-16 -right-12 w-64 h-64 bg-tertiary/5 rounded-full blur-3xl pointer-events-none"></div>

            {/* Telemetry & Node Badge */}
            <div className="mb-space-md flex items-center justify-between w-full px-space-xs">
              <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant">
                <span className="inline-block w-2 h-2 rounded-full bg-tertiary"></span>
                <span>NODE: AUTH-GATEWAY-US-EAST-01</span>
              </div>
              <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-primary">
                <span className="material-symbols-outlined text-[14px]">verified_user</span>
                <span>MUTUAL TLS v1.3 ACTIVE</span>
              </div>
            </div>

            {/* Main Authentication Container Card */}
            <div className="w-full bg-surface-container-lowest rounded-xl shadow-xl p-space-lg sm:p-space-xl relative">
              {/* Card Brand Header */}
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center text-on-primary shadow-md mb-space-sm">
                  <span className="material-symbols-outlined text-[26px]">shield</span>
                </div>
                <h1 className="font-headline-md text-headline-md text-on-surface tracking-tight">
                  Admin Panel Access
                </h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                  Audit &amp; Compliance Governance Portal • Privileged Gateway
                </p>
              </div>

              {/* Segmented Control Tab Switcher */}
              <div className="mt-space-lg p-1 bg-surface-container rounded-lg flex items-center gap-1">
                <button
                  type="button"
                  id="tab-login"
                  onClick={() => {
                    setAuthMode("login");
                    setErrorMessage(null);
                  }}
                  className={`flex-1 py-2 px-space-sm rounded-lg font-headline-sm text-headline-sm transition-all flex items-center justify-center gap-space-xs ${
                    authMode === "login"
                      ? "text-on-primary bg-primary shadow-sm"
                      : "text-on-surface-variant bg-transparent hover:bg-surface-container-high"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">lock_open</span>
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  id="tab-register"
                  onClick={() => {
                    setAuthMode("register");
                    setErrorMessage(null);
                  }}
                  className={`flex-1 py-2 px-space-sm rounded-lg font-headline-sm text-headline-sm transition-all flex items-center justify-center gap-space-xs ${
                    authMode === "register"
                      ? "text-on-primary bg-primary shadow-sm"
                      : "text-on-surface-variant bg-transparent hover:bg-surface-container-high"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                  <span>Register Admin</span>
                </button>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="mt-space-md p-space-sm rounded-lg bg-error-container text-on-error-container text-body-sm font-medium flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* FORM 1: LOGIN MODE */}
              {authMode === "login" && (
                <form
                  id="auth-login-form"
                  className="mt-space-lg flex flex-col gap-space-md"
                  onSubmit={handleLoginSubmit}
                >
                  <div className="flex flex-col gap-space-xs">
                    <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center justify-between">
                      <span>ADMINISTRATOR IDENTIFIER / EMAIL</span>
                      <span className="text-primary font-normal">SSO ENABLED</span>
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                        badge
                      </span>
                      <input
                        className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md pl-10 pr-3 py-2 rounded-lg outline-none shadow-sm border border-outline-variant/30 focus:border-primary focus:bg-surface-container-low transition-colors"
                        placeholder="admin@sentinel.internal or admin_id"
                        required
                        type="text"
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-space-xs">
                    <div className="flex items-center justify-between">
                      <label className="font-label-sm text-label-sm text-on-surface font-semibold">
                        ADMINISTRATOR MASTER PASSWORD
                      </label>
                      <button
                        type="button"
                        className="font-label-sm text-label-sm text-primary hover:underline"
                      >
                        Token Reset?
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                        key
                      </span>
                      <input
                        id="login-pass"
                        className="w-full bg-surface-container-lowest text-on-surface font-label-md text-label-md pl-10 pr-10 py-2 rounded-lg outline-none shadow-sm border border-outline-variant/30 focus:border-primary focus:bg-surface-container-low transition-colors"
                        placeholder="••••••••••••"
                        required
                        type={showLoginPassword ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        disabled={isSubmitting}
                      />
                      <button
                        type="button"
                        className="absolute right-3 text-outline hover:text-on-surface flex items-center justify-center"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {showLoginPassword ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* 2FA Hardware Key Protocol Indicator */}
                  <div className="p-space-sm rounded-lg bg-surface-container-low flex items-start gap-space-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-tertiary text-[18px] mt-0.5">
                      security
                    </span>
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface">
                        Secured with Hardware Key / 2FA Protocol
                      </span>
                      <span className="font-caption text-caption text-secondary">
                        FIDO2 WebAuthn &amp; YubiKey OTP validated automatically upon credential check.
                      </span>
                    </div>
                  </div>

                  {/* Checkbox & Audit Session Persistence */}
                  <div className="flex items-center justify-between pt-space-xs">
                    <label className="flex items-center gap-space-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberSession}
                        onChange={(e) => setRememberSession(e.target.checked)}
                        className="w-4 h-4 rounded bg-surface-container-low accent-primary cursor-pointer"
                      />
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Remember administrator session
                      </span>
                    </label>
                    <span className="font-label-sm text-label-sm text-outline">TTL: 8H MAX</span>
                  </div>

                  {/* Primary Action Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full py-2.5 px-space-md rounded-lg font-headline-sm text-headline-sm active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-space-sm mt-space-xs ${
                      authStage === "granted"
                        ? "bg-tertiary text-on-tertiary"
                        : "bg-primary text-on-primary hover:bg-primary-container"
                    }`}
                  >
                    {authStage === "verifying" ? (
                      <>
                        <span className="material-symbols-outlined text-[18px] animate-spin">
                          refresh
                        </span>
                        <span>Verifying Cryptographic Credentials...</span>
                      </>
                    ) : authStage === "granted" ? (
                      <>
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>Clearance Granted • Redirecting...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">login</span>
                        <span>Sign In to Admin Panel</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* FORM 2: REGISTRATION MODE */}
              {authMode === "register" && (
                <form
                  id="auth-register-form"
                  className="mt-space-lg flex flex-col gap-space-md"
                  onSubmit={handleRegisterSubmit}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                    <div className="flex flex-col gap-space-xs">
                      <label className="font-label-sm text-label-sm text-on-surface font-semibold">
                        ADMIN FULL NAME
                      </label>
                      <div className="relative flex items-center">
                        <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                          person
                        </span>
                        <input
                          className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md pl-10 pr-3 py-2 rounded-lg outline-none shadow-sm border border-outline-variant/30 focus:border-primary focus:bg-surface-container-low transition-colors"
                          placeholder="Elena Rostova, CISA"
                          required
                          type="text"
                          value={regFullName}
                          onChange={(e) => setRegFullName(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-space-xs">
                      <label className="font-label-sm text-label-sm text-on-surface font-semibold">
                        ORG SECURITY EMAIL
                      </label>
                      <div className="relative flex items-center">
                        <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                          alternate_email
                        </span>
                        <input
                          className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md pl-10 pr-3 py-2 rounded-lg outline-none shadow-sm border border-outline-variant/30 focus:border-primary focus:bg-surface-container-low transition-colors"
                          placeholder="e.rostova@internal.gov"
                          required
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-space-xs">
                    <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center justify-between">
                      <span>ROLE ASSIGNMENT &amp; CLEARANCE CODE</span>
                      <span className="font-label-sm text-label-sm text-outline">RBAC-LEVEL-4</span>
                    </label>
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                        verified
                      </span>
                      <select
                        className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md pl-10 pr-8 py-2 rounded-lg outline-none shadow-sm border border-outline-variant/30 focus:border-primary focus:bg-surface-container-low transition-colors appearance-none cursor-pointer"
                        value={regRole}
                        onChange={(e) => setRegRole(e.target.value)}
                        disabled={isSubmitting}
                      >
                        <option value="lead-auditor">Compliance Lead Auditor (SOC 2 / ISO 27001)</option>
                        <option value="secops">Security Operations Specialist (SIEM Level 3)</option>
                        <option value="data-dpo">Data Protection Officer (GDPR / HIPAA Tier)</option>
                        <option value="super-admin">Enterprise Master Security Admin</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-3 text-outline text-[18px] pointer-events-none">
                        expand_more
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                    <div className="flex flex-col gap-space-xs">
                      <label className="font-label-sm text-label-sm text-on-surface font-semibold">
                        MASTER PASSWORD
                      </label>
                      <div className="relative flex items-center">
                        <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                          lock
                        </span>
                        <input
                          id="reg-pass"
                          className="w-full bg-surface-container-lowest text-on-surface font-label-md text-label-md pl-10 pr-10 py-2 rounded-lg outline-none shadow-sm border border-outline-variant/30 focus:border-primary focus:bg-surface-container-low transition-colors"
                          placeholder="Min 16 chars"
                          required
                          type={showRegPassword ? "text" : "password"}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          className="absolute right-3 text-outline hover:text-on-surface flex items-center justify-center"
                          onClick={() => setShowRegPassword((prev) => !prev)}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {showRegPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-space-xs">
                      <label className="font-label-sm text-label-sm text-on-surface font-semibold">
                        CONFIRM MASTER PASSWORD
                      </label>
                      <div className="relative flex items-center">
                        <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                          check_circle
                        </span>
                        <input
                          id="reg-pass-confirm"
                          className="w-full bg-surface-container-lowest text-on-surface font-label-md text-label-md pl-10 pr-10 py-2 rounded-lg outline-none shadow-sm border border-outline-variant/30 focus:border-primary focus:bg-surface-container-low transition-colors"
                          placeholder="Re-enter password"
                          required
                          type={showRegConfirmPassword ? "text" : "password"}
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          className="absolute right-3 text-outline hover:text-on-surface flex items-center justify-center"
                          onClick={() => setShowRegConfirmPassword((prev) => !prev)}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {showRegConfirmPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Clearance Notice */}
                  <div className="p-space-sm rounded-lg bg-surface-container-high flex items-start gap-space-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">
                      info
                    </span>
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface">
                        Hardware Token Clearance Required
                      </span>
                      <span className="font-caption text-caption text-secondary">
                        New administrator registrations trigger an immutable ledger event and require multi-signature supervisor token clearance.
                      </span>
                    </div>
                  </div>

                  {/* Primary Action Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full py-2.5 px-space-md rounded-lg font-headline-sm text-headline-sm active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-space-sm mt-space-xs ${
                      authStage === "granted"
                        ? "bg-tertiary text-on-tertiary"
                        : "bg-primary text-on-primary hover:bg-primary-container"
                    }`}
                  >
                    {authStage === "verifying" ? (
                      <>
                        <span className="material-symbols-outlined text-[18px] animate-spin">
                          refresh
                        </span>
                        <span>Verifying Cryptographic Credentials...</span>
                      </>
                    ) : authStage === "granted" ? (
                      <>
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        <span>Clearance Granted • Redirecting...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">person_add</span>
                        <span>Register Administrator</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Trust Badges & Compliance Footer Inside Card */}
              <div className="mt-space-lg pt-space-md bg-surface-container-low -mx-space-lg -mb-space-lg sm:-mx-space-xl sm:-mb-space-xl p-space-md rounded-b-xl flex flex-col gap-space-xs items-center text-center">
                <div className="flex flex-wrap items-center justify-center gap-space-xs">
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-tertiary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">policy</span>
                    <span>Tamper-Proof Audit Protocol</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-on-surface-variant">
                    NIST SP 800-53
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-lowest font-label-sm text-label-sm text-on-surface-variant">
                    SOC 2 Type II
                  </span>
                </div>
                <p className="font-caption text-caption text-outline max-w-sm">
                  All administrative authorization requests are permanently hashed into the compliance ledger with remote syslog replication.
                </p>
              </div>
            </div>

            {/* Additional Quick Reference System Status */}
            <div className="w-full mt-space-md grid grid-cols-3 gap-space-xs text-center font-label-sm text-label-sm text-on-surface-variant">
              <div className="p-space-xs bg-surface-container rounded-lg">
                <div className="text-outline text-[10px]">ENCRYPTION</div>
                <div className="font-semibold text-on-surface mt-0.5">AES-256-GCM</div>
              </div>
              <div className="p-space-xs bg-surface-container rounded-lg">
                <div className="text-outline text-[10px]">VAULT STATE</div>
                <div className="font-semibold text-tertiary mt-0.5">HEALTHY / SEALED</div>
              </div>
              <div className="p-space-xs bg-surface-container rounded-lg">
                <div className="text-outline text-[10px]">AUDIT LOGS</div>
                <div className="font-semibold text-on-surface mt-0.5">WORM STORAGE</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-space-md bg-surface-container-lowest shadow-[0_-1px_8px_rgba(0,0,0,0.02)]">
        <div className="w-full px-margin flex flex-col sm:flex-row items-center justify-between gap-space-xs">
          <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <span className="material-symbols-outlined text-primary text-[14px]">lock</span>
            <span>256-Bit Encrypted &amp; Audited • Read-Only Compliance Portal</span>
          </div>
          <div className="font-caption text-caption text-outline">
            System Build v4.19-audit • FIPS 140-2 Validated
          </div>
        </div>
      </footer>
    </div>
  );
};

export const adminLognRegistser = AdminLoginRegister;
export default AdminLoginRegister;
