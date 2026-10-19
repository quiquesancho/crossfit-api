export type AppConfig = {
  databaseUrl?: string;
  openClawServiceKey?: string;
  host: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return {
    databaseUrl: env.DATABASE_URL,
    openClawServiceKey: env.OPENCLAW_SERVICE_KEY,
    host: env.HOST ?? "0.0.0.0",
    port,
  };
}
