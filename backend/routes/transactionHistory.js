const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../logs/transactions');

// GET /transactions/history
// Returns a list of available Excel files
router.get('/history', async (req, res) => {
    try {
        await fs.promises.access(logsDir);
        const files = await fs.promises.readdir(logsDir);
        // Only return .xlsx files
        const excelFiles = files.filter(f => f.endsWith('.xlsx'));
        res.json(excelFiles);
    } catch (err) {
        // If directory doesn't exist, return empty array
        if (err.code === 'ENOENT') {
            return res.json([]);
        }
        console.error('Error reading logs directory:', err);
        res.status(500).json({ error: 'Failed to read history' });
    }
});

// GET /transactions/download/:file
// Downloads a specific Excel file
router.get('/download/:file', (req, res) => {
    const fileName = req.params.file;
    // Basic validation to prevent path traversal
    if (!fileName || !fileName.endsWith('.xlsx') || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        return res.status(400).send('Invalid file name');
    }

    const filePath = path.join(logsDir, fileName);

    res.download(filePath, fileName, (err) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.status(404).send('File not found');
            } else {
                console.error('Error downloading file:', err);
                // Headers might have already been sent, so we can't reliably send a 500 response
                if (!res.headersSent) {
                    res.status(500).send('Failed to serve file');
                }
            }
        }
    });
});

module.exports = router;
