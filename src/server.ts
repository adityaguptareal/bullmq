import express from 'express'
import type { BulkScanRequest } from './types/types.js';
import { seoScanQueue } from './config/bullmq.js';
const app = express()
const port = process.env.port || 3000;

const AllUrls = []

app.use(express.json())
app.get("/health", (req, res) => {
    res.json({ message: "Api is working properly" })
})

app.post("/bulkScan", async (req, res) => {
    const { userUrls } = req.body as BulkScanRequest
    if (!userUrls || userUrls.length == 0) {
        res.json({ message: "Enter at leat 1 url" })
        return
    }
    if (userUrls.length > 20) {
        res.json({ message: "You can submit at max 20 url" })
        return
    }
    const jobs = await seoScanQueue.addBulk(userUrls.map((url) => ({
        name: "scan-url",
        data: { url }
    })))
    res.status(201).json({
        message: "URL Recived",
        length: userUrls.length,
        urls: userUrls
    })

})

app.listen(port, () => {
    console.log("App is running at", port)
})