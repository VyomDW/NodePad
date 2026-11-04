import Fastify from "fastify";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import websocket from "@fastify/websocket";
import { ClientMessage } from "@hacktx/shared";
import { env } from "./env";
import { diagnoseMuse } from "./integrations/muse";
import { accountOf, Credentials, forgotPassword, PasswordReset, Registration, rename, renewSession, requireAccount, resendCode, resetPassword, signIn, signOut, signUp, tokenOf, Verification, verify } from "./auth";
import { diagnoseEmail } from "./integrations/email";
import { admit, deleteRoom, findRoom, getRoom, listRooms, revokeAccess, type Room } from "./rooms/room";
import { removeSaved } from "./rooms/store";
import { transcribe, transcribeTurns } from "./integrations/voice";
import { listenerFor } from "./rooms/listen";
import { IMAGE_DIR } from "./integrations/image";
import { listMedia, mediaEnabled, mediaFile, removeMedia, startMedia, type MediaKind, type MediaOptions } from "./integrations/media";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMeshyTask, getMeshyTask, meshyAssetPath, refineMeshyTask, type MeshyQuality } from "./integrations/meshy";

const app = Fastify({
  logger: true,
  // Vite removes /api during local development. Do the same before routing in
  // production so the browser can use one origin for pages, HTTP and sockets.
  rewriteUrl(request) {
    const url = request.url ?? "/";
    return url.startsWith("/api/") ? url.slice(4) : url;
  },
});

await app.register(cors, { origin: env.clientOrigin });
// Uploaded images travel inline as data URLs (downscaled in the browser), so allow larger frames.
await app.register(websocket, { options: { maxPayload: 16 * 1024 * 1024 } });

app.get("/health", async () => ({ ok: true }));

/** Can this server reach the AI? Key fingerprint, models visible from here, and a tiny test call per model. */
app.get("/health/ai", async () => diagnoseMuse());

/** Can this server send sign-up and reset codes? The email mode and, for SMTP, whether its login works. */
app.get("/health/email", async () => diagnoseEmail());

/**
 * Accounts: sign up (emails a code), verify the code, forgot and reset password, sign in, who am I, rename,
 * sign out. Responses that sign someone in carry the session token the browser keeps.
 */
const firstIssue = (error: { issues: { message: string }[] }) => error.issues[0]?.message ?? "Check your details.";

app.post<{ Body: unknown }>("/auth/signup", async (req, reply) => {
  const input = Registration.safeParse(req.body);
  if (!input.success) return reply.code(400).send({ error: firstIssue(input.error) });
  const result = await signUp(input.data);
  if ("error" in result) return reply.code(409).send({ error: result.error });
  return result;
});

app.post<{ Body: unknown }>("/auth/verify", async (req, reply) => {
  const input = Verification.safeParse(req.body);
  if (!input.success) return reply.code(400).send({ error: firstIssue(input.error) });
  const result = await verify(input.data);
  if ("error" in result) return reply.code(400).send({ error: result.error });
  return result;
});

app.post<{ Body: { email?: string } }>("/auth/resend", async (req, reply) => {
  const email = req.body?.email?.trim().toLowerCase();
  if (!email) return reply.code(400).send({ error: "Enter your email." });
  const result = await resendCode(email);
  if ("error" in result) return reply.code(429).send({ error: result.error });
  return result;
});

app.post<{ Body: { email?: string } }>("/auth/forgot", async (req, reply) => {
  const email = req.body?.email?.trim().toLowerCase();
  if (!email) return reply.code(400).send({ error: "Enter your email." });
  const result = await forgotPassword(email);
  if ("error" in result) return reply.code(429).send({ error: result.error });
  return { ok: true };
});

app.post<{ Body: unknown }>("/auth/reset", async (req, reply) => {
  const input = PasswordReset.safeParse(req.body);
  if (!input.success) return reply.code(400).send({ error: firstIssue(input.error) });
  const result = await resetPassword(input.data);
  if ("error" in result) return reply.code(400).send({ error: result.error });
  return result;
});

app.post<{ Body: unknown }>("/auth/login", async (req, reply) => {
  const input = Credentials.safeParse(req.body);
  if (!input.success) return reply.code(401).send({ error: "Wrong username, email or password." });
  const result = await signIn(input.data);
  if ("error" in result) return reply.code(401).send({ error: result.error });
  return result;
});

app.get("/auth/me", async (req, reply) => {
  const account = await requireAccount(req, reply);
  return account && { account, token: renewSession(account) };
});

app.patch<{ Body: { name?: string } }>("/auth/me", async (req, reply) => {
  const account = await requireAccount(req, reply);
  if (!account) return;
  const name = req.body?.name?.trim().slice(0, 32);
  if (!name) return reply.code(400).send({ error: "Enter a name." });
  return rename(account, name);
});

app.post("/auth/logout", async (req) => {
  const token = tokenOf(req);
  if (token) signOut(token);
  return { ok: true };
});

app.post<{ Body: { prompt?: string; quality?: MeshyQuality } }>("/studio/meshy/tasks", async (req, reply) => {
  if (!await requireAccount(req, reply)) return;
  const prompt = req.body?.prompt?.trim();
  if (!prompt || prompt.length > 800) return reply.code(400).send({ error: "Enter a model description up to 800 characters." });
  const quality = req.body?.quality === "medium" ? "medium" : "high";
  try { return await createMeshyTask(prompt, quality); }
  catch (error) { req.log.error(error); return reply.code(502).send({ error: error instanceof Error ? error.message : "Could not start 3D generation." }); }
});

app.post<{ Body: { previewTaskId?: string; prompt?: string } }>("/studio/meshy/refine", async (req, reply) => {
  if (!await requireAccount(req, reply)) return;
  const previewTaskId = req.body?.previewTaskId?.trim();
  const prompt = req.body?.prompt?.trim();
  if (!previewTaskId || !prompt || prompt.length > 800) return reply.code(400).send({ error: "A completed preview and prompt are required." });
  try { return await refineMeshyTask(previewTaskId, prompt); }
  catch (error) { req.log.error(error); return reply.code(502).send({ error: error instanceof Error ? error.message : "Could not texture 3D model." }); }
});

app.get<{ Params: { id: string } }>("/studio/meshy/tasks/:id", async (req, reply) => {
  try { return await getMeshyTask(req.params.id); }
  catch (error) { req.log.error(error); return reply.code(502).send({ error: error instanceof Error ? error.message : "Could not check 3D generation." }); }
});

app.get<{ Params: { id: string } }>("/studio/meshy/assets/:id.glb", async (req, reply) => {
  const file = meshyAssetPath(req.params.id);
  if (!file) return reply.code(404).send();
  return reply.header("cache-control", "public, max-age=31536000, immutable").type("model/gltf-binary").send(createReadStream(file));
});

/** AI-generated images, by the random file name generateImage chose (nothing else in the folder is reachable). */
app.get<{ Params: { file: string } }>("/images/:file", async (req, reply) => {
  const { file } = req.params;
  if (!/^[0-9a-f-]{36}\.(webp|png|jpg)$/.test(file)) return reply.code(404).send();
  const full = path.join(IMAGE_DIR, file);
  if (!existsSync(full)) return reply.code(404).send();
  reply.header("cache-control", "public, max-age=31536000, immutable");
  return reply.type(file.endsWith(".png") ? "image/png" : file.endsWith(".jpg") ? "image/jpeg" : "image/webp").send(createReadStream(full));
});

/** Media studio: every music and video generation, newest first, and whether a Replicate key is set. */
app.get("/media", async (req, reply) => {
  const account = await requireAccount(req, reply);
  return account && { enabled: mediaEnabled(), jobs: await listMedia(account.id) };
});

app.post<{ Body: { kind?: string; prompt?: string; duration?: number; aspectRatio?: string } }>("/media", async (req, reply) => {
  const account = await requireAccount(req, reply);
  if (!account) return;
  const { kind, prompt, duration, aspectRatio } = req.body ?? {};
  if (!mediaEnabled()) return reply.code(503).send({ error: "Add REPLICATE_API_TOKEN to server/.env to generate media." });
  if (kind !== "music" && kind !== "video") return reply.code(400).send({ error: "kind must be music or video" });
  const text = prompt?.trim();
  if (!text || text.length > 1000) return reply.code(400).send({ error: "Describe what to make (up to 1000 characters)." });
  const options: MediaOptions = {
    duration: duration === 10 ? 10 : 5,
    aspectRatio: aspectRatio === "9:16" || aspectRatio === "1:1" ? aspectRatio : "16:9",
  };
  return startMedia(account.id, kind as MediaKind, text, options);
});

app.delete<{ Params: { id: string } }>("/media/:id", async (req, reply) => {
  const account = await requireAccount(req, reply);
  if (!account) return;
  return (await removeMedia(req.params.id, account.id)) ? { ok: true } : reply.code(404).send({ error: "Nothing to remove (it may still be generating)." });
});

const MEDIA_TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg" };

/** One generated file; ?download=1 saves it instead of playing it. Only names the job itself lists are served. */
app.get<{ Params: { id: string; name: string }; Querystring: { download?: string } }>("/media/:id/:name", async (req, reply) => {
  const full = await mediaFile(req.params.id, req.params.name);
  if (!full || !existsSync(full)) return reply.code(404).send();
  const ext = path.extname(full).slice(1);
  if (req.query.download) reply.header("content-disposition", `attachment; filename="muse-${req.params.name}"`);
  return reply.type(MEDIA_TYPES[ext] ?? "application/octet-stream").send(createReadStream(full));
});

/** The signed-in account's files for the home screen (theirs and ones shared with them), most recently edited first. */
app.get("/docs", async (req, reply) => {
  const account = await requireAccount(req, reply);
  if (!account) return;
  return listRooms()
    .filter((r) => r.access.has(account.id))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      template: r.doc.kind === "board" ? r.doc.template : undefined,
      title: r.doc.title,
      updatedAt: r.updatedAt,
      online: r.members.size,
      mine: r.ownerId === account.id,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
});

/** The owner deletes the file for everyone; anyone else just removes it from their own list. */
app.delete<{ Params: { id: string } }>("/docs/:id", async (req, reply) => {
  const account = await requireAccount(req, reply);
  if (!account) return;
  const room = findRoom(req.params.id);
  if (!room || !room.access.has(account.id)) return reply.code(404).send({ error: "No such file." });
  if (room.ownerId !== account.id) {
    revokeAccess(room, account.id);
    return { ok: true, removed: "list" };
  }
  deleteRoom(room.id);
  removeSaved(room.id);
  return { ok: true, removed: "file" };
});

app.addContentTypeParser(/^audio\//, { parseAs: "buffer", bodyLimit: 32 * 1024 * 1024 }, (_req, body, done) => done(null, body));

/**
 * One WAV clip in, transcript out.
 * Push-to-talk (default): the transcript takes the same path as a typed prompt.
 * Listen mode (?mode=listen): an open-mic utterance, which only edits if it holds a real request.
 * `source=call` is the meeting audio someone shares, which may hold several voices.
 */
app.post<{ Params: { roomId: string }; Querystring: { userId?: string; mode?: string; source?: string } }>(
  "/rooms/:roomId/voice",
  async (req, reply) => {
    const account = await requireAccount(req, reply);
    if (!account) return;
    const userId = account.id;
    const { mode, source } = req.query;
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return reply.code(400).send({ error: "expected audio body" });
    }
    const mime = req.headers["content-type"] ?? "audio/wav";
    const room = findRoom(req.params.roomId);
    if (!room || !room.access.has(userId)) return reply.code(404).send({ error: "No such file." });
    try {
      if (mode === "listen") {
        const fromCall = source === "call";
        const lines = await transcribeTurns(req.body, mime, fromCall);
        const name = account.name;
        if (lines.length) listenerFor(room).hear(lines, fromCall ? `${userId}:call` : userId, fromCall ? "On the call" : name);
        return { text: lines.join(" ") };
      }
      const text = await transcribe(req.body, mime);
      if (text) void room.prompt(text, userId, account.name);
      return { text };
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({ error: "transcription failed" });
    }
  },
);

app.register(async (scope) => {
  scope.get("/ws", { websocket: true }, (socket) => {
    let room: Room | undefined;
    let member: Parameters<Room["join"]>[0] | undefined;

    // One message at a time, in order, so anything sent right after a join waits for its account check.
    let queue = Promise.resolve();
    socket.on("message", (raw) => {
      queue = queue.then(() => handle(raw)).catch((err) => scope.log.error(err));
    });

    async function handle(raw: Buffer | ArrayBuffer | Buffer[]) {
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const parsed = ClientMessage.safeParse(data);
      if (!parsed.success) {
        socket.send(JSON.stringify({ type: "error", message: "invalid message" }));
        return;
      }
      const msg = parsed.data;
      if (msg.type === "join") {
        // Only the owner, or someone holding the file's Invite link, gets in. It then shows in their files.
        const account = await accountOf(msg.token);
        if (socket.readyState !== socket.OPEN) return;
        if (!account) return socket.close(4401, "sign in");
        const existing = findRoom(msg.roomId);
        if (existing && !admit(existing, account.id, msg.invite)) return socket.close(4403, "no access");
        if (room && member) room.leave(member);
        room = existing ?? getRoom(msg.roomId, msg.kind);
        admit(room, account.id);
        member = { socket, userId: account.id, name: account.name };
        room.join(member);
        return;
      }
      if (!room || !member) return;
      if (msg.type === "prompt") void room.prompt(msg.text, member.userId, member.name);
      if (msg.type === "undo") room.undo(msg.opId, member.userId);
      if (msg.type === "undo_turn") room.undoTurn(msg.turnId, member.userId);
      if (msg.type === "stop") room.stop();
      if (msg.type === "ops") room.userOps(msg.ops, member);
      if (msg.type === "undo_mine") room.undoMine(member.userId);
      if (msg.type === "redo_mine") room.redoMine(member.userId);
    }

    socket.on("close", () => {
      if (room && member) room.leave(member);
    });
  });
});

if (process.env.NODE_ENV === "production") {
  const clientRoot = fileURLToPath(new URL("../../client/dist/", import.meta.url));
  await app.register(staticFiles, {
    root: clientRoot,
    maxAge: "30d",
    immutable: true,
  });

  // index.html must be revalidated so a deployment never leaves visitors on
  // an old asset manifest. Room and media state live in query parameters.
  app.get("/", (_request, reply) =>
    reply.sendFile("index.html", { maxAge: 0, immutable: false }),
  );
}

await app.listen({ port: env.port, host: process.env.SERVER_HOST || "0.0.0.0" });
