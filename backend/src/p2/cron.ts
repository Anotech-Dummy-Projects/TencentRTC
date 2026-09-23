import { Router } from "express";
import cron from "node-cron";
import { archiveService } from "./archiveService.js";

// Testing/debugging ke liye manual archive batch trigger endpoint.
export const archiveRouter = Router();

archiveRouter.post("/trigger", async (_req, res) => {
  try {
    // Future parts mein yahi real Tencent fetch aur S3 archive flow start karega.
    const result = await archiveService.processArchiveBatch();
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PART 1: Roz ka safety-net cron schedule register karta hai.
 * Future: Yeh pending archive queue ko process karega agar count trigger miss ho jaye.
 */
export function startArchiveCron(): void {
  cron.schedule(
    "0 20 * * *",
    async () => {
      console.log("[Archive Cron] Starting daily safety net processing...");
      try {
        await archiveService.processArchiveBatch();
        console.log("[Archive Cron] Daily processing completed.");
      } catch (error) {
        console.error("[Archive Cron] Failed:", error);
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  console.log("[Archive Cron] Registered daily job at 8:00 PM IST.");
}
