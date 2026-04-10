import "./env.js";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import router from "./routes.js";

const app = express();

app.use(
  cors({
    origin: config.clientUrl
  })
);
app.use(express.json({ limit: "2mb" }));
app.use("/api", router);
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return response.status(400).json({
      message: "Validation failed",
      issues: error.issues
    });
  }

  console.error(error);
  return response.status(500).json({
    message: error instanceof Error ? error.message : "Internal server error"
  });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
