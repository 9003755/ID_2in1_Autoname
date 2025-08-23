import express, { Request, Response } from 'express';
import multer from 'multer';
import { OcrRequest, OcrResponse } from '../../shared/types.js';
import { getBaiduOcrService } from '../services/baiduOcr.js';
import { asyncHandler, handleMulterError } from '../middleware/validation.js';

const router = express.Router();

// 配置multer用于文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  },
});

/**
 * 身份证OCR识别接口
 * POST /api/ocr/identify
 */
router.post('/identify', 
  upload.single('image'), 
  handleMulterError,
  asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.body;
    const imageFile = req.file;

    if (!imageFile) {
      return res.status(400).json({
        success: false,
        error: '请上传图片文件'
      } as OcrResponse);
    }

    if (!type || !['front', 'back'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: '请指定识别类型：front 或 back'
      } as OcrResponse);
    }

    try {
      const ocrService = await getBaiduOcrService();
      
      if (type === 'front') {
        // 识别身份证正面
        const idCardInfo = await ocrService.recognizeIdCardFront(imageFile.buffer);
        
        const response: OcrResponse = {
          success: true,
          name: idCardInfo.name,
          idNumber: idCardInfo.idNumber,
          gender: idCardInfo.gender,
          nation: idCardInfo.nation,
          birthday: idCardInfo.birthday,
          address: idCardInfo.address
        };
        
        res.json(response);
      } else {
        // 识别身份证背面
        const idCardInfo = await ocrService.recognizeIdCardBack(imageFile.buffer);
        
        const response: OcrResponse = {
          success: true,
          issueAuthority: idCardInfo.issueAuthority,
          validPeriod: idCardInfo.validPeriod
        };
        
        res.json(response);
      }
    } catch (error) {
      console.error('OCR识别错误:', error);
      
      // 如果是配置错误，返回更具体的错误信息
      if (error instanceof Error && error.message.includes('配置缺失')) {
        return res.status(500).json({
          success: false,
          error: '百度OCR服务配置错误，请联系管理员'
        } as OcrResponse);
      }
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '身份证识别失败'
      } as OcrResponse);
    }
  })
);

export default router;