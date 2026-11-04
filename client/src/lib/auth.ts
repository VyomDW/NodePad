import { create } from "zustand";

export const apiUrl = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "nodepad:token";

export interface Account {
  id: string;
  username: string;
  name: string;
}

/** Storage can throw (private windows, blocked site data); the session then lasts for this page load. */
function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
function writeToken(token?: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

interface AuthState {
  token?: string;
  account?: Account;
  /** "loading" while a remembered session is being checked. */
  status: "loading" | "ready";
}

export const useAuth = create<AuthState>(() => ({ token: readToken(), status: readToken() ? "loading" : "ready" }));

/** fetch against the server with the session attached; a 401 means the session ended, so sign out. */
export async function api(path: string, init: RequestInit = {}) {
  const { token } = useAuth.getState();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${apiUrl}${path}`, { ...init, headers });
  if (res.status === 401 && token && !path.startsWith("/auth/login")) forget();
  return res;
}

async function accountCall(path: string, body: unknown, method = "POST") {
  const res = await api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { account?: Account; token?: string; error?: string };
  if (!res.ok || !data.account) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

export async function signIn(username: string, password: string) {
  const { account, token } = await accountCall("/auth/login", { username, password });
  setSession(account!, token);
}

/** Step one of sign-up: nothing is signed in yet, a 6-digit code is on its way to the email. */
export async function signUp(details: { username: string; email: string; password: string; name?: string }) {
  const res = await api("/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details) });
  const data = (await res.json().catch(() => ({}))) as { pending?: { email: string }; error?: string };
  if (!res.ok || !data.pending) throw new Error(data.error || "Something went wrong. Try again.");
  return data.pending.email;
}

/** Step two: the code from the email creates the account and signs it in. */
export async function verifyEmail(email: string, code: string) {
  const { account, token } = await accountCall("/auth/verify", { email, code });
  setSession(account!, token);
}

export async function resendCode(email: string) {
  const res = await api("/auth/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
}

/** Forgot password: emails a reset code if an account uses this address. */
export async function forgotPassword(email: string) {
  const res = await api("/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
}

/** The reset code plus a new password signs in; sessions from before the reset end. */
export async function resetPassword(email: string, code: string, password: string) {
  const { account, token } = await accountCall("/auth/reset", { email, code, password });
  setSession(account!, token);
}

function setSession(account: Account, token?: string) {
  writeToken(token);
  useAuth.setState({ token, account, status: "ready" });
}

export async function rename(name: string) {
  const { account, token } = await accountCall("/auth/me", { name }, "PATCH");
  // The session token carries the name, so a rename comes with a fresh one.
  if (token) writeToken(token);
  useAuth.setState(token ? { account, token } : { account });
}

/** Drops the session here without telling the server (it already rejected it). */
export function forget() {
  writeToken(undefined);
  useAuth.setState({ token: undefined, account: undefined, status: "ready" });
}

export async function signOut() {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);
  forget();
}

// Check a remembered session once at startup; the server answers with a renewed token, so the 30-day
// expiry keeps moving while this device is in use.
if (useAuth.getState().token)
  void api("/auth/me")
    .then(async (res) => {
      if (!res.ok) return forget();
      const { account, token } = (await res.json()) as { account: Account; token?: string };
      if (token) writeToken(token);
      useAuth.setState(token ? { account, token, status: "ready" } : { account, status: "ready" });
    })
    // offline or server down: keep the token and let the screens retry
    .catch(() => useAuth.setState({ status: "ready" }));
