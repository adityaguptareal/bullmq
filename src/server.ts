import express from 'express'
import type { BulkScanRequest } from './types/types.js';
import { seoScanQueue } from './config/bullmq.js';
import { scanWebsite } from './services/seo.services.js';
import crypto from "node:crypto";
const app = express()
const port = process.env.port || 3000;

const AllUrls = []

app.use(express.json())
app.get("/health", (req, res) => {
    res.json({ message: "Api is working properly" })
})

app.post("/bulkScan", async (req, res) => {

    const { userUrls } = req.body as BulkScanRequest
    try {

        if (!userUrls || userUrls.length == 0) {
            res.json({ message: "Enter at leat 1 url" })
            return
        }
        if (userUrls.length > 20) {
            res.json({ message: "You can submit at max 20 url" })
            return
        }
        const batchId = crypto.randomUUID();
        const jobs = await seoScanQueue.addBulk(userUrls.map((url) => ({
            name: "scan-url",
            data: { url, batchId }
        })))
        res.status(201).json({
            message: "SEO audit started",
            batchId,
            totalUrls: jobs.length,
            status: "queued",
        })
    } catch (error) {
        console.error("Failed to queue jobs:", error);
        return res.status(500).json({
            message: "Failed to queue audit jobs",
        });
    }

})

app.get("/job/:batchId", async (req, res) => {
  const { batchId } = req.params;

  const jobs = await seoScanQueue.getJobs([
    "waiting",
    "active",
    "completed",
    "failed",
  ]);

  const batchJobs = jobs.filter(
    (job) => job.data.batchId === batchId
  );

  if (!batchJobs.length) {
    return res.status(404).json({ message: "Batch not found" });
  }

  const results = await Promise.all(
    batchJobs.map(async (job) => ({
      url: job.data.url,
      status: await job.getState(),
      ...(await job.getState()) === "completed"
        ? { data: job.returnvalue }
        : {},
      ...(await job.getState()) === "failed"
        ? { error: job.failedReason }
        : {},
    }))
  );

  res.json({
    batchId,
    total: results.length,
    completed: results.filter((job) => job.status === "completed").length,
    results,
  });
});


app.get("/batches", async (_req, res) => {
  const jobs = await seoScanQueue.getJobs([
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
  ]);

  const batches = new Map<string, {
    batchId: string;
    total: number;
    completed: number;
    failed: number;
    urls: string[];
  }>();

  for (const job of jobs) {
    const { batchId, url } = job.data as {
      batchId: string;
      url: string;
    };

    if (!batchId) continue;

    if (!batches.has(batchId)) {
      batches.set(batchId, {
        batchId,
        total: 0,
        completed: 0,
        failed: 0,
        urls: [],
      });
    }

    const batch = batches.get(batchId)!;
    const status = await job.getState();

    batch.total++;
    batch.urls.push(url);

    if (status === "completed") batch.completed++;
    if (status === "failed") batch.failed++;
  }

  return res.json({
    totalBatches: batches.size,
    batches: Array.from(batches.values()),
  });
});

app.post("/test-scan", async (req, res) => {
    const { url } = req.body;
    const report = await scanWebsite(url)
    res.json({ message: "Report generated", report: report })
})

app.listen(port, () => {
    console.log("App is running at", port)
})