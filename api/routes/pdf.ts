import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { validateRequiredFields, validateFileUpload, asyncHandler, handleMulterError } from '../middleware/validation';
import { getTempDir, generateUniqueFileName } from '../utils/fileUtils';
import { PdfService, PdfGenerationOptions } from '../services/pdfService';
import { IdCardInfo } from '../../shared/types';

const router = express.Router();

// 配置multer用于文件上传
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    files: 2 // 最多2个文件（正反面）
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

/**
 * POST /api/pdf/generate
 * 生成包含身份证正反面的PDF文件
 */
router.post('/generate', 
  upload.fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }]),
  handleMulterError,
  validateRequiredFields(['name']),
  validateFileUpload(['front', 'back']),
  asyncHandler(async (req, res) => {
    const tempFiles: string[] = [];
    
    try {
      const { name, outputPath, idCardInfo } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      const frontFile = files.front?.[0];
      const backFile = files.back?.[0];

      if (!frontFile || !backFile) {
        return res.status(400).json({
          success: false,
          error: '请上传身份证正反面照片'
        });
      }

      // 验证文件格式
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedMimeTypes.includes(frontFile.mimetype) || 
          !allowedMimeTypes.includes(backFile.mimetype)) {
        return res.status(400).json({
          success: false,
          error: '只支持JPEG和PNG格式的图片文件'
        });
      }

      // 保存上传的图片到临时目录
      const tempDir = getTempDir();
      const frontTempPath = path.join(tempDir, generateUniqueFileName('front', '.jpg'));
      const backTempPath = path.join(tempDir, generateUniqueFileName('back', '.jpg'));
      
      fs.writeFileSync(frontTempPath, frontFile.buffer);
      fs.writeFileSync(backTempPath, backFile.buffer);
      tempFiles.push(frontTempPath, backTempPath);

      // 准备PDF生成选项
      const outputDir = outputPath || tempDir;
      const pdfOptions: PdfGenerationOptions = {
        frontImagePath: frontTempPath,
        backImagePath: backTempPath,
        name: name,
        outputDir: outputDir,
        idCardInfo: idCardInfo ? JSON.parse(idCardInfo) as IdCardInfo : undefined
      };

      // 生成PDF
      const pdfService = new PdfService();
      const result = await pdfService.generateIdCardPdf(pdfOptions);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error || 'PDF生成失败'
        });
      }

      // 获取生成的PDF文件信息
      const stats = fs.statSync(result.filePath!);
      
      res.json({
        success: true,
        message: 'PDF生成成功',
        data: {
          fileName: result.fileName,
          filePath: result.filePath,
          fileSize: stats.size
        }
      });

    } catch (error) {
      console.error('PDF生成失败:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '服务器内部错误'
      });
    } finally {
      // 清理临时文件
      if (tempFiles.length > 0) {
        setTimeout(() => {
          PdfService.cleanupTempFiles(tempFiles);
        }, 5000); // 5秒后清理临时文件
      }
    }
  })
);

/**
 * POST /api/pdf/simple-generate
 * 简单合并两张图片为PDF文件
 */
router.post('/simple-generate', 
  upload.fields([{ name: 'first', maxCount: 1 }, { name: 'second', maxCount: 1 }]),
  handleMulterError,
  validateRequiredFields(['fileName']),
  validateFileUpload(['first', 'second']),
  asyncHandler(async (req, res) => {
    const tempFiles: string[] = [];
    
    try {
      const { fileName, outputPath } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      const firstFile = files.first?.[0];
      const secondFile = files.second?.[0];

      if (!firstFile || !secondFile) {
        return res.status(400).json({
          success: false,
          error: '请上传两张图片'
        });
      }

      // 验证文件格式
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedMimeTypes.includes(firstFile.mimetype) || 
          !allowedMimeTypes.includes(secondFile.mimetype)) {
        return res.status(400).json({
          success: false,
          error: '只支持JPEG和PNG格式的图片文件'
        });
      }

      // 保存上传的图片到临时目录
      const tempDir = getTempDir();
      const firstTempPath = path.join(tempDir, generateUniqueFileName('first', '.jpg'));
      const secondTempPath = path.join(tempDir, generateUniqueFileName('second', '.jpg'));
      
      fs.writeFileSync(firstTempPath, firstFile.buffer);
      fs.writeFileSync(secondTempPath, secondFile.buffer);
      tempFiles.push(firstTempPath, secondTempPath);

      // 准备PDF生成选项
      const outputDir = outputPath || tempDir;
      
      // 生成PDF
      const pdfService = new PdfService();
      const result = await pdfService.generateSimplePdf({
        image1Path: firstTempPath,
        image2Path: secondTempPath,
        fileName: fileName,
        outputDir: outputDir
      });

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error || 'PDF生成失败'
        });
      }

      // 获取生成的PDF文件信息
      const stats = fs.statSync(result.filePath!);
      
      res.json({
        success: true,
        message: 'PDF生成成功',
        data: {
          fileName: result.fileName,
          filePath: result.filePath,
          fileSize: stats.size
        }
      });

    } catch (error) {
      console.error('简单PDF生成失败:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '服务器内部错误'
      });
    } finally {
      // 清理临时文件
      if (tempFiles.length > 0) {
        setTimeout(() => {
          PdfService.cleanupTempFiles(tempFiles);
        }, 5000); // 5秒后清理临时文件
      }
    }
  })
);

/**
 * GET /api/pdf/download/:fileName
 * 下载生成的PDF文件
 */
router.get('/download/:fileName', asyncHandler(async (req, res) => {
  try {
    const { fileName } = req.params;
    const { dir } = req.query;
    
    // 验证文件名安全性
    if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: '无效的文件名'
      });
    }

    const fileDir = (dir as string) || getTempDir();
    const filePath = path.join(fileDir, fileName);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: '文件不存在'
      });
    }

    // 设置响应头
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    
    // 发送文件
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('文件下载失败:', error);
    res.status(500).json({
      success: false,
      error: '文件下载失败'
    });
  }
}));

export default router;