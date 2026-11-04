import { createHash, createHmac, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { emailMode, resetEmail, sendEmail, verificationEmail, type Email as EmailMessage } from "./integrations/email";

/**
 * Accounts and sign-in sessions.
 *
 * Sessions are self-verifying: the token carries the account (id, username, name) and an expiry, signed with
 * SESSION_SECRET. Any server instance can check it without shared state, so a restart, a redeploy or a request
 * landing on a different serverless container no longer signs anyone out.
 *
 * Accounts (username, email, salted scrypt hash) live in Upstash Redis when it is configured (Vercel's KV
 * integration sets KV_REST_API_URL / KV_REST_API_TOKEN), so they survive containers too; otherwise in data/auth.json.
 *
 * Sign-up is two steps: the details wait as a pending registration while a 6-digit code goes to the email, and
 * the account only exists once that code comes back. A forgotten password works the same way: a code to the
 * account's email, then a new password, which also ends every session started before it. Each successful
 * /auth/me hands out a fresh token, so a device that keeps using nodepad stays signed in.
 */
const FILE = path.resolve(process.env.AUTH_FILE || "data/auth.json");
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 86_400_000;
const CODE_MINUTES = 10;
const CODE_TRIES = 5;
const RESEND_SECONDS = 30;

/**
 * Signs session tokens. Set SESSION_SECRET in production; without it a stable secret is derived from the
 * server's API key so every instance of one deployment agrees, and a random one is the last resort (dev only).
 */
const SECRET =
  process.env.SESSION_SECRET ||
  (process.env.MUSE_API_KEY || process.env.MODEL_API_KEY
    ? createHash("sha256").update(`nodepad-session:${process.env.MUSE_API_KEY || process.env.MODEL_API_KEY}`).digest("hex")
    : randomBytes(32).toString("hex"));
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") console.warn("[auth] SESSION_SECRET is not set; deriving one from the API key");

const User = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  salt: z.string(),
  hash: z.string(),
  createdAt: z.number(),
  /** Verified at sign-up; accounts made before email verification have none. */
  email: z.string().optional(),
  /** When the password last changed; sessions started before it are no longer accepted. */
  passwordAt: z.number().optional(),
});
type User = z.infer<typeof User>;
/** A 6-digit code waiting to be entered, stored only as a hash. */
const Code = z.object({ email: z.string(), codeHash: z.string(), expires: z.number(), tries: z.number(), sentAt: z.number() });
type Code = z.infer<typeof Code>;
/** A sign-up waiting for its email code. */
const Pending = Code.extend({ username: z.string(), name: z.string(), salt: z.string(), hash: z.string() });
type Pending = z.infer<typeof Pending>;
const Store = z
  .object({ users: z.array(User).default([]), pending: z.array(Pending).default([]), resets: z.array(Code).default([]) })
  .passthrough();

export interface Account {
  id: string;
  username: string;
  name: string;
}

// ---- Account storage: Upstash Redis when configured, else a JSON file ----

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useKv = !!(KV_URL && KV_TOKEN);
console.log(`[auth] accounts stored in ${useKv ? "Upstash Redis" : FILE}`);

async function kv(...command: string[]): Promise<unknown> {
  const res = await fetch(KV_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!res.ok || body.error) throw new Error(`Redis ${res.status}: ${body.error ?? res.statusText}`);
  return body.result;
}
const userKey = (username: string) => `nodepad:user:${username}`;
const emailKey = (email: string) => `nodepad:email:${email}`;

function loadFile(): z.infer<typeof Store> {
  try {
    return Store.parse(JSON.parse(readFileSync(FILE, "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[auth] could not read accounts, starting empty", err);
    return { users: [], pending: [], resets: [] };
  }
}
const file = useKv ? { users: [], pending: [], resets: [] } : loadFile();
function saveFile() {
  mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ users: file.users, pending: file.pending, resets: file.resets }));
  renameSync(tmp, FILE);
}

async function findUser(username: string): Promise<User | undefined> {
  if (!useKv) return file.users.find((u) => u.username === username);
  const raw = await kv("GET", userKey(username));
  return typeof raw === "string" ? User.parse(JSON.parse(raw)) : undefined;
}
async function findUserByEmail(email: string): Promise<User | undefined> {
  if (!useKv) return file.users.find((u) => u.email === email);
  const username = await kv("GET", emailKey(email));
  return typeof username === "string" ? findUser(username) : undefined;
}
/** Stores a new user, or names the field that is already taken (atomic in Redis). */
async function addUser(user: User & { email: string }): Promise<"username" | "email" | undefined> {
  if (!useKv) {
    if (file.users.some((u) => u.username === user.username)) return "username";
    if (file.users.some((u) => u.email === user.email)) return "email";
    file.users.push(user);
    saveFile();
    return;
  }
  if ((await kv("SET", emailKey(user.email), user.username, "NX")) !== "OK") return "email";
  if ((await kv("SET", userKey(user.username), JSON.stringify(user), "NX")) === "OK") return;
  await kv("DEL", emailKey(user.email));
  return "username";
}
async function saveUser(user: User) {
  if (useKv) await kv("SET", userKey(user.username), JSON.stringify(user));
  else saveFile();
}

/** Outstanding codes of one kind (sign-ups or password resets), one per email, kept for a day at most. */
function codeStore<T extends Code>(kind: "pending" | "resets", schema: z.ZodType<T>) {
  const key = (email: string) => `nodepad:${kind}:${email}`;
  const list = () => file[kind] as T[];
  return {
    async find(email: string): Promise<T | undefined> {
      if (!useKv) return list().find((c) => c.email === email);
      const raw = await kv("GET", key(email));
      return typeof raw === "string" ? schema.parse(JSON.parse(raw)) : undefined;
    },
    async save(code: T) {
      if (useKv) return void (await kv("SET", key(code.email), JSON.stringify(code), "EX", String(86_400)));
      // Expired codes are dropped whenever the file is written.
      (file[kind] as T[]) = [...list().filter((c) => c.email !== code.email && c.expires > Date.now() - 86_400_000), code];
      saveFile();
    },
    async drop(email: string) {
      if (useKv) return void (await kv("DEL", key(email)));
      (file[kind] as T[]) = list().filter((c) => c.email !== email);
      saveFile();
    },
  };
}
const pendings = codeStore("pending", Pending);
const resets = codeStore("resets", Code);

// ---- Sessions: signed, self-contained tokens ----

const Payload = z.object({ id: z.string(), username: z.string(), name: z.string(), exp: z.number() });
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("base64url");

function startSession(account: Account) {
  const body = Buffer.from(JSON.stringify({ ...account, exp: Date.now() + SESSION_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Tokens signed out on this instance; a best-effort list, since a signed token can't be recalled everywhere. */
const revoked = new Set<string>();

const hashOf = (password: string, salt: string) => scryptSync(password, salt, 64).toString("hex");
const publicOf = (u: User): Account => ({ id: u.id, username: u.username, name: u.name });

const Username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.-]{3,32}$/, "Usernames are 3 to 32 letters, numbers, dots, dashes or underscores.");
const Password = z.string().min(6, "Passwords need at least 6 characters.").max(200);
const Email = z.string().trim().toLowerCase().max(254).email("Enter a valid email address.");

export const Registration = z.object({ username: Username, email: Email, password: Password, name: z.string().trim().max(32).optional() });
/** Sign in with either the username or the email. */
export const Credentials = z.object({ username: z.string().trim().toLowerCase().min(1).max(254), password: z.string().max(200) });
export const Verification = z.object({ email: Email, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.") });
export const PasswordReset = Verification.extend({ password: Password });

const codeHashOf = (email: string, code: string) => createHmac("sha256", SECRET).update(`verify:${email}:${code}`).digest("hex");
const codeWait = (code: Code) => Math.ceil((code.sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000);

/** Stores a fresh code for `record` and emails it; the code itself is only ever stored hashed. */
async function issueCode<T extends Code>(
  store: ReturnType<typeof codeStore<T>>,
  record: Omit<T, keyof Code> & { email: string },
  email: (to: string, code: string) => EmailMessage,
) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const next = { ...record, codeHash: codeHashOf(record.email, code), expires: Date.now() + CODE_MINUTES * 60_000, tries: 0, sentAt: Date.now() } as T;
  await store.save(next);
  try {
    await sendEmail(email(record.email, code));
  } catch (err) {
    console.error("[auth] could not send email", err);
    await store.drop(record.email);
    return {
      error: emailMode === "off" ? "Email isn't set up on this server yet, so we can't send codes." : "We couldn't send the email. Try again in a moment.",
    } as const;
  }
  return { ok: true } as const;
}

/** Checks a typed code against its record, counting wrong tries; undefined when it matches. */
async function checkCode<T extends Code>(store: ReturnType<typeof codeStore<T>>, record: T, code: string) {
  if (record.expires < Date.now()) return "That code has expired. Send a new one.";
  if (record.tries >= CODE_TRIES) return "Too many wrong codes. Send a new one.";
  if (timingSafeEqual(Buffer.from(codeHashOf(record.email, code), "hex"), Buffer.from(record.codeHash, "hex"))) return;
  await store.save({ ...record, tries: record.tries + 1 });
  return "That code isn't right. Check the email and try again.";
}

/** Shown when the email is already in use, without saying so. */
const ACCOUNT_ERROR = "There was an error making this account. Try again, or sign in if you already have one.";

/** Step one of sign-up: checks the details are free, then emails a code. No account exists yet. */
export async function signUp(input: z.infer<typeof Registration>) {
  if (await findUser(input.username)) return { error: "That username is taken." } as const;
  // Deliberately vague: saying the email is taken would reveal who uses nodepad.
  if (await findUserByEmail(input.email)) return { error: ACCOUNT_ERROR } as const;
  const salt = randomBytes(16).toString("hex");
  const record = { email: input.email, username: input.username, name: input.name || input.username, salt, hash: hashOf(input.password, salt) };
  const sent = await issueCode(pendings, record, verificationEmail);
  return "error" in sent ? sent : ({ pending: { email: input.email } } as const);
}

/** Sends a new sign-up code, at most once every RESEND_SECONDS. */
export async function resendCode(email: string) {
  const pending = await pendings.find(email);
  if (!pending) return { error: "That sign-up has expired. Start again." } as const;
  const wait = codeWait(pending);
  if (wait > 0) return { error: `Wait ${wait} seconds before asking for another code.` } as const;
  const sent = await issueCode(pendings, pending, verificationEmail);
  return "error" in sent ? sent : ({ pending: { email } } as const);
}

/** Step two of sign-up: a matching code turns the pending registration into an account and signs it in. */
export async function verify(input: z.infer<typeof Verification>) {
  const pending = await pendings.find(input.email);
  if (!pending) return { error: "That sign-up has expired. Start again." } as const;
  const wrong = await checkCode(pendings, pending, input.code);
  if (wrong) return { error: wrong } as const;
  const user = { id: `acct-${randomUUID()}`, username: pending.username, name: pending.name, salt: pending.salt, hash: pending.hash, email: pending.email, createdAt: Date.now() };
  const taken = await addUser(user);
  await pendings.drop(pending.email);
  if (taken === "username") return { error: "That username was taken while you were verifying. Start again with another." } as const;
  if (taken === "email") return { error: ACCOUNT_ERROR } as const;
  return { account: publicOf(user), token: startSession(publicOf(user)) } as const;
}

/**
 * Forgot password, step one: emails a code if an account uses this address. The answer is the same either way,
 * so this can't be used to find out which emails have accounts.
 */
export async function forgotPassword(email: string) {
  const existing = await resets.find(email);
  const wait = existing ? codeWait(existing) : 0;
  if (wait > 0) return { error: `Wait ${wait} seconds before asking for another code.` } as const;
  if (!(await findUserByEmail(email))) return { ok: true } as const;
  return issueCode(resets, { email }, resetEmail);
}

/** Forgot password, step two: a matching code sets the new password, ends older sessions and signs in here. */
export async function resetPassword(input: z.infer<typeof PasswordReset>) {
  const record = await resets.find(input.email);
  if (!record) return { error: "That code has expired. Send a new one." } as const;
  const wrong = await checkCode(resets, record, input.code);
  if (wrong) return { error: wrong } as const;
  const user = await findUserByEmail(input.email);
  await resets.drop(input.email);
  if (!user) return { error: "That account no longer exists." } as const;
  user.salt = randomBytes(16).toString("hex");
  user.hash = hashOf(input.password, user.salt);
  user.passwordAt = Date.now();
  await saveUser(user);
  return { account: publicOf(user), token: startSession(publicOf(user)) } as const;
}

export async function signIn(input: z.infer<typeof Credentials>) {
  const user = input.username.includes("@") ? await findUserByEmail(input.username) : await findUser(input.username);
  const ok = user && timingSafeEqual(Buffer.from(hashOf(input.password, user.salt), "hex"), Buffer.from(user.hash, "hex"));
  if (!user || !ok) return { error: "Wrong username, email or password." } as const;
  return { account: publicOf(user), token: startSession(publicOf(user)) } as const;
}

/** A fresh token for a signed-in account, so a device in regular use never reaches the expiry. */
export const renewSession = (account: Account) => startSession(account);

export function signOut(token: string) {
  revoked.add(token);
}

/** The account a session token belongs to, if the token is valid and that account still exists. */
export async function accountOf(token: string | undefined): Promise<Account | undefined> {
  if (!token || revoked.has(token)) return undefined;
  const [body, mac] = token.split(".");
  if (!body || !mac) return undefined;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  let payload;
  try {
    payload = Payload.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    return undefined;
  }
  if (!payload.success || payload.data.exp < Date.now()) return undefined;
  // Matching the id too, so a token outlives neither a deleted account nor a new one that reuses its username.
  const user = await findUser(payload.data.username);
  if (user?.id !== payload.data.id) return undefined;
  // Started before the latest password change (the token's start is its expiry minus the session length).
  if (user.passwordAt && payload.data.exp - SESSION_MS < user.passwordAt) return undefined;
  return publicOf(user);
}

/** Renames the account and returns a fresh token carrying the new name. */
export async function rename(account: Account, name: string) {
  const user = await findUser(account.username);
  if (user) {
    user.name = name;
    await saveUser(user);
  }
  const next = { ...account, name };
  return { account: next, token: startSession(next) };
}

export const tokenOf = (req: FastifyRequest) => req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];

/** Route guard: the signed-in account, or a 401 already sent. */
export async function requireAccount(req: FastifyRequest, reply: FastifyReply): Promise<Account | undefined> {
  const account = await accountOf(tokenOf(req));
  if (!account) void reply.code(401).send({ error: "Sign in to continue." });
  return account;
}
