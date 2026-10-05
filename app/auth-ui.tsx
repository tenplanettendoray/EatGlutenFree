"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { safeAuthReturn } from "./lib/auth-return";
import { authClient } from "./lib/auth-client";
import { SafeServeMark } from "./safe-serve-logo";

type SocialProvider = "google" | "apple" | "microsoft";

function authErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const value = error as { message?: string; error?: { message?: string } };
    return value.message || value.error?.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function defaultUsername(email?: string | null) {
  const cleaned = email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "") || "diner";
  return cleaned.length >= 3 ? cleaned.slice(0, 30) : `${cleaned}user`.slice(0, 30);
}

function MailIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v11H4zM4.5 7l7.5 6 7.5-6" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function UserIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" />{hidden && <path d="m4 4 16 16" />}</svg>;
}

function returnPath() {
  if (typeof window === "undefined") return "/search";
  const raw = new URLSearchParams(window.location.search).get("callbackURL") || sessionStorage.getItem("auth-return") || "/search";
  return safeAuthReturn(raw, window.location.origin);
}

function rememberPage() {
  if (/^\/(sign-in|sign-up|onboarding)(\/|$)/.test(window.location.pathname)) return;
  if (window.history.state?.safeServeDraft) sessionStorage.setItem("auth-search-draft", JSON.stringify(window.history.state.safeServeDraft));
  sessionStorage.setItem("auth-return", window.location.pathname + window.location.search + window.location.hash);
}

export function AccountControls() {
  const { data: session, isPending } = authClient.useSession();
  return (
    <Link className="account-button" onClick={rememberPage} href={session ? "/account" : "/sign-up"} aria-label={session ? "Account" : "Make an account"} aria-busy={isPending}>
      <span className="account-icon" aria-hidden="true"><UserIcon /></span><span className="account-button-label">{session ? "Account" : "Make an account"}</span>
    </Link>
  );
}

function SocialButtons() {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState("");
  const [enabledProviders, setEnabledProviders] = useState<SocialProvider[]>([]);
  const providers: Array<{ provider: SocialProvider; label: string; mark: string }> = [
    { provider: "google", label: "Google", mark: "G" },
    { provider: "apple", label: "Apple", mark: "A" },
    { provider: "microsoft", label: "Microsoft", mark: "M" },
  ];

  useEffect(() => {
    let active = true;
    fetch("/api/auth-providers", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ providers?: SocialProvider[] }> : { providers: [] })
      .then((data: { providers?: SocialProvider[] }) => { if (active) setEnabledProviders(data.providers || []); })
      .catch(() => { if (active) setEnabledProviders([]); });
    return () => { active = false; };
  }, []);

  const visibleProviders = providers.filter(({ provider }) => enabledProviders.includes(provider));
  if (!visibleProviders.length) return null;

  async function continueWith(provider: SocialProvider) {
    setBusy(provider); setError("");
    try {
    const result = await authClient.signIn.social({
      provider,
      callbackURL: returnPath(),
      newUserCallbackURL: `/onboarding?callbackURL=${encodeURIComponent(returnPath())}`,
    });
    if (result.error) {
      setError(result.error.message || `${provider} sign-in is not configured yet.`);
      setBusy(null);
    }
    } catch {
      setError("Sign-in could not connect. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="social-auth-block">
      <div className="social-auth-grid">
        {visibleProviders.map(({ provider, label, mark }) => (
          <button type="button" key={provider} disabled={busy !== null} onClick={() => continueWith(provider)}>
            <span className={`social-mark ${provider}`} aria-hidden="true">{mark}</span>
            <strong>{busy === provider ? "Opening…" : label}</strong>
          </button>
        ))}
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="auth-divider"><span>or use email</span></div>
    </div>
  );
}

function CustomSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const result = await authClient.signIn.email({ email: email.trim(), password, rememberMe, callbackURL: returnPath() });
    if (result.error) {
      setError(result.error.message || "We could not sign you in.");
      setBusy(false);
      return;
    }
    window.location.assign(returnPath());
  }

  return (
    <div className="safe-auth-panel">
      <div className="auth-card-logo"><SafeServeMark /></div>
      <span className="section-kicker">Gluten FreEat</span>
      <h1>Welcome back</h1>
      <SocialButtons />
      <form className="safe-auth-form" onSubmit={submit}>
        <label htmlFor="sign-in-email">Email</label>
        <div className="auth-input-wrap"><span className="auth-field-icon"><MailIcon /></span><input id="sign-in-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div>
        <label htmlFor="sign-in-password">Password</label>
        <div className="auth-input-wrap"><span className="auth-field-icon"><LockIcon /></span><input id="sign-in-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /><button className="password-visibility" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}><EyeIcon hidden={showPassword} /></button></div>
        <label className="remember-choice"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span>Remember me</span></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="auth-switch">New here? <Link href="/sign-up" onClick={() => sessionStorage.setItem("auth-return", returnPath())}>Create an account</Link></p>
    </div>
  );
}

function CustomSignUp() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const resolvedUsername = username.trim() || defaultUsername(email);
    const result = await authClient.signUp.email({
      email: email.trim(),
      password,
      name: resolvedUsername,
      username: resolvedUsername,
      displayUsername: resolvedUsername,
      callbackURL: returnPath(),
    });
    if (result.error) {
      setError(result.error.message || "We could not create your account.");
      setBusy(false);
      return;
    }
    window.location.assign(returnPath());
  }

  return (
    <div className="safe-auth-panel">
      <div className="auth-card-logo"><SafeServeMark /></div>
      <span className="section-kicker">Gluten FreEat</span>
      <h1>Create your account</h1>
      <SocialButtons />
      <form className="safe-auth-form" onSubmit={register}>
        <label htmlFor="sign-up-email">Email</label>
        <div className="auth-input-wrap"><span className="auth-field-icon"><MailIcon /></span><input id="sign-up-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div>
        <label htmlFor="sign-up-username">Username <span>optional</span></label>
        <div className="auth-input-wrap"><span className="auth-field-icon"><UserIcon /></span><input id="sign-up-username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={defaultUsername(email)} /></div>
        <small className="field-help">If blank, we’ll use the part of your email before @.</small>
        <label htmlFor="sign-up-password">Password <span>required</span></label>
        <div className="auth-input-wrap"><span className="auth-field-icon"><LockIcon /></span><input id="sign-up-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /><button className="password-visibility" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}><EyeIcon hidden={showPassword} /></button></div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="auth-switch">Already have an account? <Link href="/sign-in" onClick={() => sessionStorage.setItem("auth-return", returnPath())}>Sign in</Link></p>
    </div>
  );
}

export function AccountExperience() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <div className="auth-loading">Loading account…</div>;
  return session ? <SimpleProfile user={session.user} /> : <CustomSignIn />;
}

function SimpleProfile({ user }: { user: { email: string; name: string; username?: string | null } }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountAccess, setAccountAccess] = useState<{ premium: boolean; plan?: string | null; admin?: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/subscription", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ premium: boolean; plan?: string | null; admin?: boolean }> : null)
      .then((access) => { if (active) setAccountAccess(access); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setStatus("");
    if (newPassword !== confirmPassword) { setError("The new passwords do not match."); return; }
    setBusy(true);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (result.error) setError(result.error.message || "The password could not be updated.");
    else { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setStatus("Password updated."); }
    setBusy(false);
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/");
  }

  return (
    <div className="simple-profile">
      <span className="section-kicker">Account</span>
      <h1>Hello, {user.username || user.name || defaultUsername(user.email)}.</h1>
      <p className="account-intro">{user.email}</p>
      <div className="account-access-row">
        <span className={accountAccess?.premium ? "premium" : "free"}>{accountAccess?.premium ? `${accountAccess.plan ? `${accountAccess.plan} ` : ""}Premium` : "Free account"}</span>
        {!accountAccess?.premium && <Link href="/premium?return=%2Faccount">Explore Premium</Link>}
        {accountAccess?.admin && <Link className="admin-account-link" href="/admin">Open admin panel</Link>}
      </div>
      <form className="safe-auth-form password-form" onSubmit={changePassword}>
        <h2>Change password</h2>
        <label htmlFor="current-password">Current password</label>
        <input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        <label htmlFor="confirm-password">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        {status && <p className="auth-success" role="status">{status}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Updating…" : "Change password"}</button>
      </form>
      <button className="sign-out-button" type="button" onClick={signOut}>Sign out</button>
    </div>
  );
}

export function OAuthOnboarding() {
  const { data: session, isPending } = authClient.useSession();
  const email = session?.user.email;
  const suggested = useMemo(() => defaultUsername(email), [email]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPending && !session) window.location.replace("/sign-in");
  }, [isPending, session]);

  if (isPending || !session) return <div className="auth-loading">Loading your account…</div>;

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const resolvedUsername = username.trim() || suggested;
      const update = await authClient.updateUser({ name: resolvedUsername, username: resolvedUsername, displayUsername: resolvedUsername });
      if (update.error) throw update.error;
      const passwordResponse = await fetch("/api/account/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const passwordResult = await passwordResponse.json() as { error?: string };
      if (!passwordResponse.ok) throw new Error(passwordResult.error || "The password could not be set.");
      window.location.assign(returnPath());
    } catch (onboardingError) {
      setError(authErrorMessage(onboardingError, "We could not finish your account."));
      setBusy(false);
    }
  }

  return (
    <div className="safe-auth-panel onboarding-panel">
      <span className="section-kicker">One last step</span>
      <h1>Your profile</h1>
      <form className="safe-auth-form" onSubmit={finish}>
        <label htmlFor="onboarding-username">Username <span>optional</span></label>
        <input id="onboarding-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={suggested} />
        <small className="field-help">Leave blank to use {suggested}.</small>
        <label htmlFor="onboarding-password">Password <span>required</span></label>
        <input id="onboarding-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <label htmlFor="onboarding-confirm">Confirm password</label>
        <input id="onboarding-confirm" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Finishing…" : "Finish account"}</button>
      </form>
    </div>
  );
}

export function SignInExperience() { return <CustomSignIn />; }
export function SignUpExperience() { return <CustomSignUp />; }
