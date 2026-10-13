import { Worker } from "bullmq";
import { connection } from "../config/bullmq.js"

const worker = new Worker("seo-scan", async (job) => {
    console.log("Scanning Wesbite ...")

    /// Business logic
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return {
        jobId: job.id,
        jobStatus: "scan-completed",
        url: job.data.url
    }
}, {
    connection
})

worker.on("completed", (job, result) => {
    console.log("Job completed:", job.id, result);
})
worker.on("failed", (job, error) => {
    console.error("Job failed:", job?.id, error.message);
})