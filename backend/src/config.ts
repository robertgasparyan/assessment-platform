export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL ?? "",
  pgDumpPath: process.env.PG_DUMP_PATH ?? "pg_dump",
  aiConfigEncryptionKey: process.env.AI_CONFIG_ENCRYPTION_KEY ?? "",
  ai: {
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL ?? "http://192.168.1.1:11434",
      model: process.env.OLLAMA_MODEL ?? "gpt-oss:20b"
    },
    openai: {
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL ?? "",
      apiKey: process.env.OPENAI_API_KEY ?? ""
    },
    claude: {
      baseUrl: process.env.CLAUDE_BASE_URL ?? "https://api.anthropic.com",
      model: process.env.CLAUDE_MODEL ?? "",
      apiKey: process.env.CLAUDE_API_KEY ?? ""
    },
    gemini: {
      baseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
      model: process.env.GEMINI_MODEL ?? "",
      apiKey: process.env.GEMINI_API_KEY ?? ""
    }
  },
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 25),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? ""
  }
};
