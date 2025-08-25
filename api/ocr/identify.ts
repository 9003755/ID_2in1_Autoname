import type { VercelRequest, VercelResponse } from '@vercel/node';
import multer from 'multer';
import { getBaiduOcrService } from '../services/baiduOcr';

// 配置multer使用内存存储
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  },
});

// 包装multer中间件以适配Vercel
function runMiddleware(req: VercelRequest, res: VercelResponse, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    // 运行multer中间件
    await runMiddleware(req, res, upload.single('image'));

    const file = (req as any).file;
    const type = req.body?.type || 'front';

    if (!file) {
      res.status(400).json({
        success: false,
        error: '请上传图片文件'
      });
      return;
    }

    console.log(`收到OCR识别请求: ${type}, 文件大小: ${file.size} bytes`);

    // 获取百度OCR服务
    const baiduOcrService = await getBaiduOcrService();

    if (type === 'front') {
      // 识别身份证正面
      const result = await baiduOcrService.recognizeIdCardFront(file.buffer);
      
      res.status(200).json({
        success: true,
        name: result.name,
        idNumber: result.idNumber,
        gender: result.gender,
        nation: result.nation,
        birthday: result.birthday,
        address: result.address,
        message: '身份证正面识别成功'
      });
    } else if (type === 'back') {
      // 识别身份证反面
      const result = await baiduOcrService.recognizeIdCardBack(file.buffer);
      
      res.status(200).json({
        success: true,
        issueAuthority: result.issueAuthority,
        validPeriod: result.validPeriod,
        keywordDetection: result.keywordDetection,
        message: '身份证反面识别成功'
      });
    } else if (type === 'smart') {
      // 智能识别
      const result = await baiduOcrService.smartRecognizeIdCard(file.buffer);
      
      res.status(200).json({
        success: true,
        frontInfo: result.frontInfo,
        backInfo: result.backInfo,
        frontScore: result.frontScore,
        backScore: result.backScore,
        recommendedSide: result.recommendedSide,
        details: result.details,
        message: '智能识别完成'
      });
    } else {
      res.status(400).json({
        success: false,
        error: '不支持的识别类型'
      });
    }
  } catch (error) {
    console.error('OCR识别失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '识别失败'
    });
  }
}