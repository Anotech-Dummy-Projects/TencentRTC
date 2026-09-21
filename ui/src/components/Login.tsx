import React, { useState } from "react";
import axios from "axios";
import { login } from "../lib/api";
import type { User, ApiErrorResponse } from "../types/api";

export interface LoginProps {
  onSuccess: (user: User) => void;
  onSwitchToRegister: () => void;
  onSwitchToAdmin?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccess, onSwitchToRegister, onSwitchToAdmin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    try {
      setLoading(true);
      const data = await login({ email: trimmedEmail, password });
      onSuccess(data.user);
    } catch (err: unknown) {
      setIsAuthenticated(false);
      if (axios.isAxiosError<ApiErrorResponse>(err)) {
        const errorData = err.response?.data;
        const msg =
          errorData?.error ||
          errorData?.details?.[0]?.message ||
          "Failed to sign in. Please verify your credentials.";
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
        {/* Subtle Ambient Glow Orbs behind card */}
        <div className="relative w-full max-w-md">
          <div className="absolute -top-12 -left-12 w-64 h-64 bg-primary-fixed/40 rounded-full blur-3xl pointer-events-none -z-10"></div>
          <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-secondary-fixed/50 rounded-full blur-3xl pointer-events-none -z-10"></div>

          {/* Main Authentication Card */}
          <div className="w-full bg-surface-container-lowest rounded-2xl p-8 sm:p-10 shadow-xl relative overflow-hidden transition-all duration-300">
            {/* Decorative Micro Top Accent Gradient Strip */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-primary-container to-secondary-container"></div>

            {/* Header Section */}
            <div className="flex flex-col items-center text-center">
              {/* Brand Icon Badge */}
              <div className="w-14 h-14 rounded-xl bg-primary-fixed flex items-center justify-center text-primary shadow-sm mb-5 transition-transform hover:scale-105 duration-200">
                <span
                  className="material-symbols-outlined text-[28px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  chat_bubble
                </span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold">
                Welcome Back
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-xs">
                Sign in with your email and password to access your conversations
              </p>
            </div>

            {/* Error Message Alert */}
            {errorMessage && (
              <div
                className="mt-6 p-3.5 rounded-xl bg-error-container/30 border border-error/20 text-error flex items-center gap-2.5 text-body-sm transition-all"
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

            {/* Login Form */}
            <form className="mt-8 space-y-5" id="loginForm" onSubmit={handleSubmit}>
              {/* Email Field */}
              <div>
                <label
                  className="block font-label-md text-label-md text-on-surface mb-1.5 font-medium"
                  htmlFor="email"
                >
                  Email address
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-[18px] text-outline pointer-events-none">
                    mail
                  </span>
                  <input
                    className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest rounded-xl font-body-md text-body-md text-on-surface placeholder:text-outline/60 focus:bg-surface-container-low transition-all duration-150 outline-none shadow-sm"
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

              {/* Password Field */}
              <div>
                <label
                  className="block font-label-md text-label-md text-on-surface mb-1.5 font-medium"
                  htmlFor="password"
                >
                  Password
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-[18px] text-outline pointer-events-none">
                    lock
                  </span>
                  <input
                    className="w-full pl-10 pr-11 py-2.5 bg-surface-container-lowest rounded-xl font-body-md text-body-md text-on-surface placeholder:text-outline/60 focus:bg-surface-container-low transition-all duration-150 outline-none shadow-sm"
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
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
                    className="absolute right-3.5 text-outline hover:text-on-surface transition-colors flex items-center justify-center p-1 rounded-lg cursor-pointer"
                    id="togglePasswordBtn"
                    onClick={togglePasswordVisibility}
                    title="Toggle password visibility"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]" id="passwordEyeIcon">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password Row */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer group select-none">
                  <input
                    className="w-4 h-4 rounded text-primary-container accent-primary-container cursor-pointer"
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="font-body-sm text-body-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(
                      "Forgot password reset instructions have been forwarded to your system administrator."
                    );
                  }}
                  className="font-label-md text-label-md text-primary hover:text-primary-container transition-colors bg-transparent border-0 p-0 cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              {/* Primary Submit Button */}
              <button
                className={`w-full mt-2 py-3 px-5 text-on-primary rounded-xl font-label-lg text-label-lg flex items-center justify-center gap-2 transition-all duration-150 shadow-md active:scale-[0.99] cursor-pointer ${
                  loading
                    ? "bg-primary-container opacity-90 cursor-not-allowed"
                    : "bg-primary-container hover:bg-primary"
                }`}
                id="submitBtn"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
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
                    <span>Authenticating...</span>
                  </>
                ) : isAuthenticated ? (
                  <>
                    <span className="material-symbols-outlined text-[18px]">check</span>
                    <span>Authenticated</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <span className="material-symbols-outlined text-[18px] transition-transform duration-150 group-hover:translate-x-0.5">
                      arrow_forward
                    </span>
                  </>
                )}
              </button>
            </form>

            {/* Footer Register Prompt */}
            <div className="mt-8 text-center pt-2">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Don't have an account?
                <button
                  type="button"
                  onClick={onSwitchToRegister}
                  className="font-label-lg text-label-lg text-primary hover:text-primary-container transition-colors ml-1 font-semibold bg-transparent border-0 cursor-pointer p-0 underline"
                  id="go-to-signup-btn"
                >
                  Sign up
                </button>
              </p>

              {onSwitchToAdmin && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-center">
                  <button
                    type="button"
                    onClick={onSwitchToAdmin}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary transition-colors cursor-pointer bg-transparent border-0"
                  >
                    <span className="material-symbols-outlined text-[15px]">shield</span>
                    <span>Access Admin Portal</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Security Guarantee / Trust Indicator */}
          <div className="mt-6 flex items-center justify-center gap-2 text-on-surface-variant">
            <span
              className="material-symbols-outlined text-[16px] text-secondary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              verified_user
            </span>
            <span className="font-label-sm text-label-sm tracking-normal text-outline">
              Protected by TLS 1.3 end-to-end encryption
            </span>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Login;
