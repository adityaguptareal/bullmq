import { Worker } from "bullmq";
import { connection } from "../config/bullmq.js"
import { scanWebsite } from "../services/seo.services.js";
import { scanPerformance } from "../services/performance.services.js";

const worker = new Worker("seo-scan", async (job) => {
    const { url, batchId } = job.data as { url: string, batchId: string }
    console.log("Scanning Wesbite ...")

    const SEOJob = await scanWebsite(url)
    console.log("Scanning Performance ...")
    const performanceJOB = await scanPerformance(url)
    return {
        url: url,
        scannedAt: new Date().toISOString(),
        SEOJob,
        performanceJOB,
        batchId
    }
}, {
    connection,
    concurrency: 1
})

worker.on("completed", (job, result) => {
    console.log("Job completed:", job.id, result);
})
worker.on("failed", (job, error) => {
    console.error("Job failed:", job?.id, error.message);
})

worker.on("error", (error) => {
    console.error("Worker error:", error);
});
