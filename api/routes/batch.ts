import express from 'express';
import path from 'path';
import fs from 'fs';
import { asyncHandler } from '../middleware/validation';
import { getImageFiles, isImageFile, getTempDir } from '../utils/fileUtils';
import { BatchResult, BatchSummary, IdCardInfo, PdfGenerationOptions } from '../../shared/types';
import { getBaiduOcrService, BaiduOcrService } from '../services/baiduOcr.js';
import { PdfService } from '../services/pdfService';

const router = express.Router();

/**
 * POST /api/batch/process
 * 批量处理身份证文件夹
 */
router.post('/process', asyncHandler(async (req, res) => {
  try {
    const { folderPaths, outputDir } = req.body;

    if (!folderPaths || !Array.isArray(folderPaths) || folderPaths.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请提供有效的文件夹路径数组'
      });
    }

    const results: BatchResult[] = [];
    const summary: BatchSummary = {
      total: folderPaths.length,
      success: 0,
      failed: 0,
      failedFolders: []
    };

    // 初始化服务
    const ocrService = await getBaiduOcrService();
    const pdfService = new PdfService();
    const defaultOutputDir = outputDir || getTempDir();

    // 遍历每个文件夹
    for (const folderPath of folderPaths) {
      try {
        // 构建完整的文件夹路径
        // 如果folderPath是相对路径（只是文件夹名），则在outputDir的父目录中查找
        let fullFolderPath = folderPath;
        
        if (!path.isAbsolute(folderPath)) {
           // 如果是相对路径，尝试在输出目录的父目录中查找
           const outputParentDir = path.dirname(outputDir);
           fullFolderPath = path.join(outputParentDir, folderPath);
           
           // 如果在输出目录父目录中找不到，尝试在输出目录中查找
           if (!fs.existsSync(fullFolderPath)) {
             fullFolderPath = path.join(outputDir, folderPath);
           }
          
          // 如果还是找不到，尝试在当前工作目录中查找
          if (!fs.existsSync(fullFolderPath)) {
            fullFolderPath = path.join(process.cwd(), folderPath);
          }
        }
        
        // 检查文件夹是否存在
        if (!fs.existsSync(fullFolderPath) || !fs.statSync(fullFolderPath).isDirectory()) {
          const errorResult: BatchResult = {
            folderPath,
            success: false,
            errorMessage: `文件夹不存在或不是有效目录。尝试的路径：${fullFolderPath}`
          };
          results.push(errorResult);
          summary.failed++;
          summary.failedFolders.push(folderPath);
          continue;
        }

        // 获取文件夹中的图片文件
        const imageFiles = await getImageFiles(fullFolderPath);
        
        if (imageFiles.length < 2) {
          const errorResult: BatchResult = {
            folderPath,
            success: false,
            errorMessage: `文件夹中的图片文件不足，需要至少2张图片，当前只有${imageFiles.length}张`
          };
          results.push(errorResult);
          summary.failed++;
          summary.failedFolders.push(folderPath);
          continue;
        }

        // 识别身份证信息并生成PDF
        const processResult = await processFolderImages(
          fullFolderPath,
          imageFiles,
          defaultOutputDir,
          ocrService,
          pdfService
        );

        if (processResult.success) {
          const idCard: IdCardInfo = {
            id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            name: processResult.extractedName || '',
            idNumber: '',
            frontImagePath: processResult.frontImagePath || '',
            backImagePath: processResult.backImagePath || '',
            pdfPath: processResult.filePath
          };
          const successResult: BatchResult = {
            folderPath,
            success: true,
            idCard
          };
          results.push(successResult);
          summary.success++;
        } else {
          const errorResult: BatchResult = {
            folderPath,
            success: false,
            errorMessage: processResult.error!
          };
          results.push(errorResult);
          summary.failed++;
          summary.failedFolders.push(folderPath);
        }

      } catch (error) {
        const errorResult: BatchResult = {
          folderPath,
          success: false,
          errorMessage: error instanceof Error ? error.message : '未知错误'
        };
        results.push(errorResult);
        summary.failed++;
        summary.failedFolders.push(folderPath);
      }
    }

    res.json({
      success: true,
      message: `批处理完成，成功处理${summary.success}个文件夹，失败${summary.failed}个`,
      data: {
        results,
        summary
      }
    });

  } catch (error) {
    console.error('批处理失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器内部错误'
    });
  }
}));

/**
 * 处理单个文件夹中的身份证图片
 */
async function processFolderImages(
  folderPath: string,
  imageFiles: string[],
  outputDir: string,
  ocrService: BaiduOcrService,
  pdfService: PdfService
): Promise<{
  success: boolean;
  fileName?: string;
  filePath?: string;
  extractedName?: string;
  frontImagePath?: string;
  backImagePath?: string;
  error?: string;
}> {
  try {
    // 尝试识别身份证正面信息
    let frontImagePath = '';
    let backImagePath = '';
    let extractedName = '';
    let idCardInfo: IdCardInfo | undefined;

    // 尝试从图片中识别身份证信息
    for (const imagePath of imageFiles) {
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        
        // 尝试识别为身份证正面
        const frontResult = await ocrService.recognizeIdCardFront(imageBuffer);
        if (frontResult.name) {
          frontImagePath = imagePath;
          extractedName = frontResult.name;
          idCardInfo = frontResult;
          break;
        }
      } catch (error) {
        // 继续尝试下一张图片
        console.warn(`识别图片失败: ${imagePath}`, error);
      }
    }

    // 如果没有识别到姓名，使用文件夹名称
    if (!extractedName) {
      extractedName = path.basename(folderPath);
      frontImagePath = imageFiles[0];
    }

    // 选择反面图片（选择不是正面的第一张图片）
    backImagePath = imageFiles.find(img => img !== frontImagePath) || imageFiles[1] || imageFiles[0];

    // 生成PDF
    const pdfOptions: PdfGenerationOptions = {
      frontImagePath,
      backImagePath,
      name: extractedName,
      outputDir,
      idCardInfo
    };

    const pdfResult = await pdfService.generateIdCardPdf(pdfOptions);

    if (pdfResult.success) {
      return {
        success: true,
        fileName: pdfResult.fileName,
        filePath: pdfResult.filePath,
        extractedName,
        frontImagePath,
        backImagePath
      };
    } else {
      return {
        success: false,
        error: pdfResult.error || 'PDF生成失败'
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理失败'
    };
  }
}

export default router;