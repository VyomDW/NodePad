import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// A throwaway accounts file and log-mode email, set before the modules load.
const AUTH_FILE = path.join(mkdtempSync(path.join(tmpdir(), "nodepad-auth-")), "auth.json");
process.env.AUTH_FILE = AUTH_FILE;
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.SMTP_URL;
delete process.env.SMTP_HOST;
delete process.env.RESEND_API_KEY;
const auth = await import("../src/auth");
const { loggedEmails } = await import("../src/integrations/email");

const lastCode = (to: string) => loggedEmails.filter((e) => e.to === to).at(-1)!.text.match(/\b(\d{6})\b/)![1]!;
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");
const details = (n: string) => auth.Registration.parse({ username: n, email: `${n}@Example.com`, password: "hunter22" });

test("sign-up emails a code and only creates the account once it is verified", async () => {
  const result = await auth.signUp(details("ada"));
  assert.deepEqual(result, { pending: { email: "ada@example.com" } });
  assert.equal((await auth.signIn({ username: "ada", password: "hunter22" })).hasOwnProperty("error"), true);

  const code = lastCode("ada@example.com");
  assert.ok("error" in (await auth.verify({ email: "ada@example.com", code: wrong(code) })));
  const done = await auth.verify({ email: "ada@example.com", code });
  assert.ok("token" in done && done.account.username === "ada");
  assert.equal((await auth.accountOf(done.token))?.username, "ada");

  const stored = JSON.parse(readFileSync(AUTH_FILE, "utf8"));
  assert.equal(stored.users[0].email, "ada@example.com");
  assert.ok(!JSON.stringify(stored).includes("hunter22"));
  assert.deepEqual(stored.pending, []);
});

test("sign in works with the username or the email", async () => {
  assert.ok("token" in (await auth.signIn({ username: "ada", password: "hunter22" })));
  assert.ok("token" in (await auth.signIn({ username: "ada@example.com", password: "hunter22" })));
  assert.ok("error" in (await auth.signIn({ username: "ada", password: "wrong-pass" })));
});

test("a taken username or email is refused before any code is sent", async () => {
  assert.ok("error" in (await auth.signUp(details("ada"))));
  const taken = await auth.signUp(auth.Registration.parse({ username: "grace", email: "ADA@example.com", password: "hunter22" }));
  // The message must not reveal that the email has an account.
  assert.ok("error" in taken && !/email|already has/i.test(taken.error));
});

test("codes lock after five wrong tries and resends are rate limited", async () => {
  await auth.signUp(details("linus"));
  const code = lastCode("linus@example.com");
  for (let i = 0; i < 5; i++) await auth.verify({ email: "linus@example.com", code: wrong(code) });
  assert.match((await auth.verify({ email: "linus@example.com", code }) as { error: string }).error, /Too many/);
  assert.match((await auth.resendCode("linus@example.com") as { error: string }).error, /Wait/);
});

test("a renewed session token still identifies the account", async () => {
  const done = await auth.signIn({ username: "ada", password: "hunter22" });
  assert.ok("token" in done);
  assert.deepEqual(await auth.accountOf(auth.renewSession(done.account)), done.account);
});

test("a session for an account that no longer exists is rejected", async () => {
  const done = await auth.signIn({ username: "ada", password: "hunter22" });
  assert.ok("token" in done);
  // Same username, different account: as if ada were deleted and the name signed up again.
  assert.equal(await auth.accountOf(auth.renewSession({ ...done.account, id: "acct-gone" })), undefined);
  assert.equal(await auth.accountOf(auth.renewSession({ id: "acct-x", username: "nobody", name: "Nobody" })), undefined);
});

test("forgot password emails a code, and the reset signs in and ends older sessions", async () => {
  const before = await auth.signIn({ username: "ada", password: "hunter22" });
  assert.ok("token" in before);

  assert.deepEqual(await auth.forgotPassword("ada@example.com"), { ok: true });
  const code = lastCode("ada@example.com");
  assert.ok("error" in (await auth.resetPassword({ email: "ada@example.com", code: wrong(code), password: "new-secret" })));
  const done = await auth.resetPassword({ email: "ada@example.com", code, password: "new-secret" });
  assert.ok("token" in done);

  assert.equal(await auth.accountOf(before.token), undefined);
  assert.equal((await auth.accountOf(done.token))?.username, "ada");
  assert.ok("error" in (await auth.signIn({ username: "ada", password: "hunter22" })));
  assert.ok("token" in (await auth.signIn({ username: "ada", password: "new-secret" })));
  // The code is single use.
  assert.ok("error" in (await auth.resetPassword({ email: "ada@example.com", code, password: "another-one" })));
});

test("forgot password answers the same for unknown emails and sends nothing", async () => {
  const sent = loggedEmails.length;
  assert.deepEqual(await auth.forgotPassword("nobody@example.com"), { ok: true });
  assert.equal(loggedEmails.length, sent);
});
