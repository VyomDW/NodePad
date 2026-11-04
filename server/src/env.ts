export const env = {
  port: Number(process.env.PORT ?? 8787),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  museApiKey: process.env.MUSE_API_KEY || process.env.MODEL_API_KEY || "",
  museBaseUrl: process.env.MUSE_BASE_URL || "https://api.meta.ai/v1",
  museModel: process.env.MUSE_MODEL || "muse-spark-1.3-contributor",
  // Tried in order when the primary model is temporarily unavailable or unavailable to this API key.
  museFallbackModels: (process.env.MUSE_FALLBACK_MODELS || "muse-spark-1.3-contributor,muse-spark-1.3,muse-spark-1.2-contributor,muse-spark-1.2,muse-spark-1.1,muse-wonder-1.0")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean),
  /** Path to a recorded NDJSON response to replay instead of calling Muse (tests, offline demo). */
  museFixture: process.env.MUSE_FIXTURE ?? "",
  // Separate so voice can run for real while Muse Spark is still on its mock.
  museVoiceApiKey: process.env.MUSE_VOICE_API_KEY || process.env.MUSE_API_KEY || process.env.MODEL_API_KEY || "",
  museVoiceUrl: process.env.MUSE_VOICE_URL || "https://api.meta.ai/v1/asr/transcribe",
  serpApiKey: process.env.SERPAPI_KEY ?? "",
  /** Media studio (music and video generation) runs on Replicate. */
  replicateToken: process.env.REPLICATE_API_TOKEN ?? "",
  replicateMusicModel: process.env.REPLICATE_MUSIC_MODEL || "google/lyria-2",
  replicateVideoModel: process.env.REPLICATE_VIDEO_MODEL || "bytedance/seedance-1-lite",
  meshyApiKey: process.env.MESHY_API_KEY ?? "",
  /** Verification emails: SMTP (SMTP_URL, or SMTP_HOST and friends) or Resend; see integrations/email.ts. */
  smtpUrl: process.env.SMTP_URL ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER ?? "",
  // Google shows app passwords in groups of four; the spaces are not part of it.
  smtpPass: (process.env.SMTP_PASS ?? "").replace(/\s+/g, ""),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM || process.env.SMTP_USER || "nodepad <onboarding@resend.dev>",
};
