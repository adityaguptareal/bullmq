import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq"

export const connection: ConnectionOptions = {
    host: "192.168.1.1",
    port: 6379
}

export const seoScanQueue = new Queue("seo-scan", { connection })
