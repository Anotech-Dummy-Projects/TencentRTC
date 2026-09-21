import React, { useState, useMemo } from "react";
import axios from "axios";
import { register } from "../lib/api";
import type { User, ApiErrorResponse } from "../types/api";

export interface RegisterProps {
  onSuccess: (user: User) => void;
  onSwitchToLogin: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onSuccess, onSwitchToLogin }) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  // Compute password strength metrics
  const strengthInfo = useMemo(() => {
    if (!password) {
      return {
        segments: ["bg-surface-variant", "bg-surface-variant", "bg-surface-variant", "bg-surface-variant"],
        hint: "Must be at least 8 characters",
        hintClass: "text-outline",
        score: "",
        scoreClass: "text-outline",
      };
    }

    let scoreCount = 0;
    if (password.length >= 8) scoreCount++;
    if (/[A-Z]/.test(password)) scoreCount++;
    if (/[0-9]/.test(password)) scoreCount++;
    if (/[^A-Za-z0-9]/.test(password)) scoreCount++;

    if (password.length < 8) {
      return {
        segments: ["bg-error", "bg-surface-variant", "bg-surface-variant", "bg-surface-variant"],
        hint: "Minimum 8 characters required",
        hintClass: "text-error",
        score: "Too short",
        scoreClass: "text-error font-medium",
      };
    }

    if (scoreCount <= 1) {
      return {
        segments: ["bg-error", "bg-surface-variant", "bg-surface-variant", "bg-surface-variant"],
        hint: "Add numbers and special characters",
        hintClass: "text-on-surface-variant",
        score: "Weak",
        scoreClass: "text-error font-medium",
      };
    }

    if (scoreCount === 2 || scoreCount === 3) {
      return {
        segments: ["bg-secondary", "bg-secondary", "bg-secondary", "bg-surface-variant"],
        hint: "Good password strength",
        hintClass: "text-on-surface-variant",
        score: "Medium",
        scoreClass: "text-secondary font-medium",
      };
    }

    return {
      segments: ["bg-primary", "bg-primary", "bg-primary", "bg-primary"],
      hint: "Strong and secure password",
      hintClass: "text-primary",
      score: "Strong",
      scoreClass: "text-primary font-medium",
    };
  }, [password]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (!agreeTerms) {
      setErrorMessage("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    // Split name into first and last name for backend schema
    const nameParts = trimmedName.split(/\s+/);
    const firstName = nameParts[0] || "User";
    const lastName = nameParts.slice(1).join(" ") || "Member";

    try {
      setLoading(true);
      const data = await register({
        firstName,
        lastName,
        email: trimmedEmail,
        password,
      });

      // Direct navigation to chat dashboard upon successful registration!
      onSuccess(data.user);
    } catch (err: unknown) {
      if (axios.isAxiosError<ApiErrorResponse>(err)) {
        const errorData = err.response?.data;
        const msg =
          errorData?.error ||
          errorData?.details?.[0]?.message ||
          "Registration failed. Please check your information and try again.";
        setErrorMessage(msg);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="w-full min-h-screen flex flex-col justify-center items-center p-gutter bg-surface relative">
      <div className="flex flex-col w-full items-center justify-center py-6 space-xl">
        {/* Subtle decorative ambient orbs strictly contained */}
        <div className="relative w-full max-w-lg flex flex-col items-center">
          <div className="absolute -top-12 -left-12 w-64 h-64 bg-primary-fixed rounded-full filter blur-3xl opacity-30 pointer-events-none"></div>
          <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-secondary-fixed rounded-full filter blur-3xl opacity-25 pointer-events-none"></div>

          {/* Main Registration Card */}
          <div className="relative w-full bg-surface-container-lowest rounded-2xl shadow-xl p-8 sm:p-10 z-10">
            {/* Top Center Brand Icon & System Badge */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-xl bg-primary-fixed flex items-center justify-center shadow-sm mb-4 transition-transform hover:scale-105 duration-200">
                <span
                  className="material-symbols-outlined text-primary text-[28px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  person_add
                </span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1 tracking-tight font-semibold">
                Create an Account
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-xs">
                Get started with your unique ID and chat access in seconds
              </p>
            </div>

            {/* Error Message Alert */}
            {errorMessage && (
              <div
                className="mb-4 p-3.5 rounded-xl bg-error-container/30 border border-error/20 text-error flex items-center gap-2.5 text-body-sm transition-all"
                role="alert"
              >
                <span
                  className="material-symbols-outlined text-[20px] text-error flex-shrink-0"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  error
                </span>
                <span className="flex-1 font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Registration Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* Full Name Input */}
              <div className="space-y-1.5">
                <label
                  className="block font-label-md text-label-md text-on-surface font-medium"
                  htmlFor="full-name"
                >
                  Full Name
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none transition-colors">
                    badge
                  </span>
                  <input
                    className="w-full pl-11 pr-4 py-3 bg-surface-container-low text-on-surface font-body-md text-body-md rounded-xl placeholder:text-outline focus:bg-surface-container-lowest focus:shadow-md outline-none transition-all duration-150 shadow-sm"
                    id="full-name"
                    name="fullName"
                    type="text"
                    placeholder="e.g. Alex Morgan"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onFocus={() => setIsNameFocused(true)}
                    onBlur={() => setIsNameFocused(false)}
                    style={{
                      boxShadow: isNameFocused
                        ? "0 0 0 2px #4f46e5, 0 0 0 5px rgba(79, 70, 229, 0.15)"
                        : "0 0 0 1px #c7c4d8",
                    }}
                  />
                </div>
              </div>

              {/* Email Address Input */}
              <div className="space-y-1.5">
                <label
                  className="block font-label-md text-label-md text-on-surface font-medium"
                  htmlFor="email"
                >
                  Email address
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none transition-colors">
                    mail
                  </span>
                  <input
                    className="w-full pl-11 pr-4 py-3 bg-surface-container-low text-on-surface font-body-md text-body-md rounded-xl placeholder:text-outline focus:bg-surface-container-lowest focus:shadow-md outline-none transition-all duration-150 shadow-sm"
                    id="email"
                    name="email"
                    type="email"
                    placeholder="name@company.com"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setIsEmailFocused(true)}
                    onBlur={() => setIsEmailFocused(false)}
                    style={{
                      boxShadow: isEmailFocused
                        ? "0 0 0 2px #4f46e5, 0 0 0 5px rgba(79, 70, 229, 0.15)"
                        : "0 0 0 1px #c7c4d8",
                    }}
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label
                  className="block font-label-md text-label-md text-on-surface font-medium"
                  htmlFor="password"
                >
                  Password
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none transition-colors">
                    lock
                  </span>
                  <input
                    className="w-full pl-11 pr-12 py-3 bg-surface-container-low text-on-surface font-body-md text-body-md rounded-xl placeholder:text-outline focus:bg-surface-container-lowest focus:shadow-md outline-none transition-all duration-150 shadow-sm"
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create password (min 8 chars)"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setIsPasswordFocused(true)}
                    onBlur={() => setIsPasswordFocused(false)}
                    style={{
                      boxShadow: isPasswordFocused
                        ? "0 0 0 2px #4f46e5, 0 0 0 5px rgba(79, 70, 229, 0.15)"
                        : "0 0 0 1px #c7c4d8",
                    }}
                  />
                  <button
                    aria-label="Toggle password visibility"
                    className="absolute right-3.5 flex items-center justify-center text-outline hover:text-on-surface transition-colors focus:outline-none cursor-pointer"
                    onClick={() => setShowPassword((prev) => !prev)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[20px]" id="eye-icon">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>

                {/* Password Strength Visual Bar */}
                <div className="pt-1 space-y-1">
                  <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden flex gap-1">
                    <div
                      className={`h-full w-1/4 transition-all duration-300 ${strengthInfo.segments[0]}`}
                      id="strength-seg-1"
                    ></div>
                    <div
                      className={`h-full w-1/4 transition-all duration-300 ${strengthInfo.segments[1]}`}
                      id="strength-seg-2"
                    ></div>
                    <div
                      className={`h-full w-1/4 transition-all duration-300 ${strengthInfo.segments[2]}`}
                      id="strength-seg-3"
                    ></div>
                    <div
                      className={`h-full w-1/4 transition-all duration-300 ${strengthInfo.segments[3]}`}
                      id="strength-seg-4"
                    ></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-label-sm text-label-sm flex items-center gap-1 ${strengthInfo.hintClass}`}
                      id="strength-hint"
                    >
                      {strengthInfo.hint}
                    </span>
                    <span
                      className={`font-label-sm text-label-sm ${strengthInfo.scoreClass}`}
                      id="strength-score"
                    >
                      {strengthInfo.score}
                    </span>
                  </div>
                </div>
              </div>

              {/* Terms & Privacy Agreement */}
              <div className="pt-1 flex items-start gap-2.5">
                <input
                  className="mt-1 w-4 h-4 rounded text-primary bg-surface-container-low accent-primary cursor-pointer"
                  id="terms"
                  required
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                />
                <label
                  className="font-body-sm text-body-sm text-on-surface-variant leading-tight cursor-pointer"
                  htmlFor="terms"
                >
                  I agree to the{" "}
                  <a
                    className="text-primary font-medium hover:underline"
                    href="#terms"
                    onClick={(e) => e.preventDefault()}
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    className="text-primary font-medium hover:underline"
                    href="#privacy"
                    onClick={(e) => e.preventDefault()}
                  >
                    Privacy Policy
                  </a>
                </label>
              </div>

              {/* Primary Action Button */}
              <div className="pt-2">
                <button
                  className={`w-full py-3.5 px-6 rounded-xl font-label-lg text-label-lg font-medium shadow-md transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer text-on-primary ${
                    loading
                      ? "bg-primary-container opacity-85 cursor-not-allowed"
                      : "bg-primary hover:bg-primary-container hover:shadow-lg active:scale-[0.99]"
                  }`}
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover:translate-x-1">
                        arrow_forward
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Return to Login Footer Link */}
            <div className="mt-8 text-center">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={onSwitchToLogin}
                  className="font-medium text-primary hover:text-on-primary-fixed-variant hover:underline ml-1 bg-transparent border-0 cursor-pointer p-0"
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>

          {/* Security & Trust Indicators */}
          <div className="mt-6 flex items-center justify-center gap-2 text-outline">
            <span
              className="material-symbols-outlined text-secondary text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              verified_user
            </span>
            <span className="font-label-sm text-label-sm tracking-normal">
              Direct encrypted peer-to-peer messaging ready
            </span>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Register;
