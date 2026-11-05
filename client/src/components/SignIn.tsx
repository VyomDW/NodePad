import { useState } from "react";
import { Loader2 } from "lucide-react";
import { forgotPassword, resendCode, resetPassword, signIn, signUp, verifyEmail } from "@/lib/auth";
import { MAX_NAME } from "@/lib/identity";
import { cn } from "@/lib/utils";
import { AuthBackdrop } from "./AuthBackdrop";
import { Logo } from "./Logo";

/**
 * Which sheet is showing: the sign-in / sign-up form, the sign-up code, or the two forgot-password steps
 * (ask for the email, then the code and a new password).
 */
type Step = "form" | "verify" | "forgot" | "reset";

/** Sign in or create an account: a taped sheet of paper on the graph-paper desk. */
export function SignIn({ invited }: { invited?: boolean }) {
  const [step, setStep] = useState<Step>("form");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const signup = mode === "signup";

  const go = (next: Step) => {
    setStep(next);
    setCode("");
    setError(undefined);
    setNotice(undefined);
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (step === "verify") await verifyEmail(email, code);
      else if (step === "forgot") {
        await forgotPassword(email);
        setPassword("");
        go("reset");
      } else if (step === "reset") await resetPassword(email, code, password);
      else if (signup) {
        setEmail(await signUp({ username, email, password, name: name.trim() || undefined }));
        go("verify");
      } else await signIn(username, password);
    });
  };

  const resend = () =>
    void run(async () => {
      if (step === "verify") await resendCode(email);
      else await forgotPassword(email);
      setNotice("Sent a new code.");
    });

  const field = "w-full rounded-lg border-[1.5px] border-[var(--ink)] bg-white px-3 py-2 text-sm outline-none focus:shadow-[2px_2px_0_var(--orb)]";
  const link = "font-semibold text-dim hover:text-ink";

  const codeField = (
    <label className="block space-y-1 text-sm font-medium">
      <span>{step === "reset" ? "Reset code" : "Verification code"}</span>
      <input
        autoFocus
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className={cn(field, "text-center font-mono text-xl tracking-[0.4em]")}
      />
    </label>
  );

  const heading = (title: string, body: React.ReactNode) => (
    <div className="space-y-1">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-dim">{body}</p>
    </div>
  );

  return (
    <div className="ink">
      <div className="stage-bg grid min-h-dvh place-items-center p-4 font-ui text-ink">
        <AuthBackdrop />
        <form onSubmit={submit} className="ink-page relative z-10 w-full max-w-sm space-y-5 rounded-xl px-6 pb-6 pt-8">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-[19px] font-bold">nodepad</span>
          </div>

          {step === "verify" && (
            <>
              {heading(
                "Check your email",
                <>
                  We sent a 6-digit code to <span className="font-semibold text-ink">{email}</span>. Enter it to finish making your account.
                </>,
              )}
              {codeField}
            </>
          )}

          {step === "forgot" && (
            <>
              {heading("Reset your password", "Enter the email on your account and we'll send you a code to set a new password.")}
              <label className="block space-y-1 text-sm font-medium">
                <span>Email</span>
                <input
                  autoFocus
                  required
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={field}
                />
              </label>
            </>
          )}

          {step === "reset" && (
            <>
              {heading(
                "Check your email",
                <>
                  If <span className="font-semibold text-ink">{email}</span> has a nodepad account, we sent it a 6-digit code. Enter it with your new password.
                </>,
              )}
              {codeField}
              <label className="block space-y-1 text-sm font-medium">
                <span>New password</span>
                <input
                  required
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={field}
                />
              </label>
            </>
          )}

          {step === "form" && (
            <>
              {heading(
                signup ? "Make your nodepad" : "Welcome back",
                invited
                  ? "Sign in to open the file you were invited to. It'll show up in your files too."
                  : signup
                    ? "Your files and recent work, kept under one account."
                    : "Sign in to get back to your files.",
              )}

              <div className="grid grid-cols-2 rounded-lg border-[1.5px] border-[var(--ink)] p-0.5 text-sm font-semibold">
                {(["login", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setError(undefined);
                    }}
                    className={cn("rounded-md py-1.5", mode === m ? "bg-[var(--ink)] text-[var(--page)]" : "text-dim hover:text-ink")}
                  >
                    {m === "login" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <label className="block space-y-1 text-sm font-medium">
                  <span>{signup ? "Username" : "Username or email"}</span>
                  <input
                    autoFocus
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={field}
                  />
                </label>
                {signup && (
                  <>
                    <label className="block space-y-1 text-sm font-medium">
                      <span>Email</span>
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={field}
                      />
                    </label>
                    <label className="block space-y-1 text-sm font-medium">
                      <span>
                        Display name <span className="font-normal text-dim">(what others see)</span>
                      </span>
                      <input
                        value={name}
                        maxLength={MAX_NAME}
                        autoComplete="name"
                        onChange={(e) => setName(e.target.value)}
                        placeholder={username || "Your name"}
                        className={field}
                      />
                    </label>
                  </>
                )}
                <label className="block space-y-1 text-sm font-medium">
                  <span className="flex items-baseline justify-between">
                    Password
                    {!signup && (
                      <button
                        type="button"
                        onClick={() => {
                          // A typed email carries over, so it doesn't need entering twice.
                          if (username.includes("@")) setEmail(username.trim());
                          go("forgot");
                        }}
                        className={cn(link, "text-xs")}
                      >
                        Forgot password?
                      </button>
                    )}
                  </span>
                  <input
                    required
                    type="password"
                    minLength={signup ? 6 : undefined}
                    autoComplete={signup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={field}
                  />
                </label>
              </div>
            </>
          )}

          {error && <p className="hand text-lg leading-tight text-red-700">{error}</p>}
          {notice && <p className="text-sm text-dim">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="ink-btn flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--orb)] py-2.5 text-sm font-bold text-white disabled:opacity-70"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {
              {
                verify: "Verify email",
                forgot: "Send reset code",
                reset: "Set new password",
                form: signup ? "Create account" : "Sign in",
              }[step]
            }
          </button>

          {(step === "verify" || step === "reset") && (
            <div className="flex justify-between text-sm">
              <button type="button" disabled={busy} onClick={resend} className={link}>
                Send a new code
              </button>
              <button type="button" disabled={busy} onClick={() => go(step === "verify" ? "form" : "forgot")} className="text-dim hover:text-ink">
                Use a different email
              </button>
            </div>
          )}
          {step === "forgot" && (
            <div className="text-sm">
              <button type="button" disabled={busy} onClick={() => go("form")} className={link}>
                Back to sign in
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
