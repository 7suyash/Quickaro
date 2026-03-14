const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const logsDir = path.join(__dirname, '../logs/transactions');

// Ensure log directory exists asynchronously
async function ensureDir() {
    try {
        await fs.promises.access(logsDir);
    } catch {
        await fs.promises.mkdir(logsDir, { recursive: true });
    }
}

// Ensure the directory is created at startup
ensureDir().catch(console.error);

// Queue for transaction logs to prevent race conditions on file write
const logQueue = [];
let isProcessingLog = false;

async function processLogQueue() {
    if (isProcessingLog || logQueue.length === 0) return;
    
    isProcessingLog = true;
    const tradeData = logQueue.shift();

    try {
        const date = new Date(tradeData.timestamp);
        // Construct filename: transactions_YYYY_MM_DD.xlsx
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const fileName = `transactions_${year}_${month}_${day}.xlsx`;
        const filePath = path.join(logsDir, fileName);

        const workbook = new ExcelJS.Workbook();
        let worksheet;

        if (fs.existsSync(filePath)) {
            await workbook.xlsx.readFile(filePath);
            worksheet = workbook.getWorksheet('SettlementLogs');
        } 
        
        if (!worksheet) {
            worksheet = workbook.addWorksheet('SettlementLogs');
            worksheet.columns = [
                { header: 'Trade ID', key: 'tradeId', width: 10 },
                { header: 'Timestamp', key: 'timestamp', width: 25 },
                { header: 'Buyer Address', key: 'buyerAddress', width: 45 },
                { header: 'Seller Address', key: 'sellerAddress', width: 45 },
                { header: 'Asset Symbol', key: 'assetSymbol', width: 15 },
                { header: 'Quantity', key: 'quantity', width: 15 },
                { header: 'Price', key: 'price', width: 15 },
                { header: 'Total Value', key: 'totalValue', width: 15 },
                { header: 'Transaction Hash', key: 'txHash', width: 68 },
                { header: 'Settlement Status', key: 'status', width: 20 }
            ];
        }

        // Add row
        worksheet.addRow({
            tradeId: tradeData.tradeId,
            timestamp: tradeData.timestamp,
            buyerAddress: tradeData.buyerAddress,
            sellerAddress: tradeData.sellerAddress,
            assetSymbol: tradeData.assetSymbol,
            quantity: tradeData.quantity,
            price: tradeData.price,
            totalValue: tradeData.totalValue,
            txHash: tradeData.txHash,
            status: tradeData.status
        });

        // Save workbook
        await ensureDir(); // Double-check just in case
        await workbook.xlsx.writeFile(filePath);
        
    } catch (err) {
        console.error('Failed to log transaction to Excel:', err);
    } finally {
        isProcessingLog = false;
        // Process next item in queue
        processLogQueue();
    }
}

function logTransaction(tradeData) {
    logQueue.push(tradeData);
    processLogQueue();
}

module.exports = { logTransaction };
