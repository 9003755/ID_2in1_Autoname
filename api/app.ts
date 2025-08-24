/**
 * This is a API server
 */

import express, { type Request, type Response, type NextFunction }  from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import ocrRoutes from './routes/ocr.js';
import pdfRoutes from './routes/pdf.js';
import batchRoutes from './routes/batch.js';
import batchFilesRoutes from './routes/batchFiles.js';
import { handleMulterError } from './middleware/validation.js';
import { initDirectories } from './utils/fileUtils.js';

// for esm mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// load env
dotenv.config();


const app: express.Application = express();

// 初始化必要的目录
initDirectories().catch(console.error);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * API Routes
 */
app.use('/api/ocr', ocrRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/batch', batchFilesRoutes);

/**
 * health
 */
app.use('/api/health', (req: Request, res: Response, next: NextFunction): void => {
  res.status(200).json({
    success: true,
    message: 'ok'
  });
});

/**
 * Multer error handler middleware
 */
app.use(handleMulterError);

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('服务器错误:', error);
  res.status(500).json({
    success: false,
    error: 'Server internal error'
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found'
  });
});

export default app;