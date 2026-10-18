import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

await app.listen({ host: "0.0.0.0", port: 3000 });
