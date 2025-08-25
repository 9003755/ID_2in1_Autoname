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

/**
 * 调试版OCR识别端点
 * 包含详细的日志和错误追踪
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugLog: any[] = [];
  const startTime = Date.now();
  
  function log(message: string, data?: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      data,
      elapsed: Date.now() - startTime
    };
    debugLog.push(logEntry);
    console.log(`[OCR-DEBUG] ${message}`, data || '');
  }

  log('OCR调试端点开始处理请求', {
    method: req.method,
    url: req.url,
    headers: Object.keys(req.headers)
  });

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    log('处理OPTIONS请求');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    log('请求方法不允许', { method: req.method });
    res.status(405).json({ 
      success: false, 
      error: 'Method not allowed',
      debug: debugLog
    });
    return;
  }

  try {
    // 检查环境变量
    log('检查环境变量');
    const envCheck = {
      BAIDU_APP_ID: !!process.env.BAIDU_APP_ID,
      BAIDU_API_KEY: !!process.env.BAIDU_API_KEY,
      BAIDU_SECRET_KEY: !!process.env.BAIDU_SECRET_KEY
    };
    log('环境变量检查结果', envCheck);

    if (!envCheck.BAIDU_APP_ID || !envCheck.BAIDU_API_KEY || !envCheck.BAIDU_SECRET_KEY) {
      log('环境变量缺失');
      res.status(500).json({
        success: false,
        error: '百度API环境变量未正确配置',
        debug: debugLog,
        envCheck
      });
      return;
    }

    // 运行multer中间件
    log('开始处理文件上传');
    await runMiddleware(req, res, upload.single('image'));
    log('文件上传处理完成');

    const file = (req as any).file;
    const { type } = req.body;

    log('请求参数检查', {
      hasFile: !!file,
      fileSize: file?.size,
      fileMimetype: file?.mimetype,
      type
    });

    if (!file) {
      log('未找到上传的图片文件');
      res.status(400).json({
        success: false,
        error: '请上传图片文件',
        debug: debugLog
      });
      return;
    }

    if (!type || !['front', 'back', 'smart'].includes(type)) {
      log('识别类型参数无效', { type });
      res.status(400).json({
        success: false,
        error: '请指定有效的识别类型 (front, back, smart)',
        debug: debugLog
      });
      return;
    }

    // 获取百度OCR服务
    log('初始化百度OCR服务');
    let baiduOcrService;
    try {
      baiduOcrService = getBaiduOcrService();
      log('百度OCR服务初始化成功');
    } catch (error) {
      log('百度OCR服务初始化失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: '百度OCR服务初始化失败',
        debug: debugLog
      });
      return;
    }

    // 执行OCR识别
    log(`开始执行${type}类型的OCR识别`, { fileSize: file.size });
    let result;
    try {
      switch (type) {
        case 'front':
          result = await baiduOcrService.recognizeIdCardFront(file.buffer);
          break;
        case 'back':
          result = await baiduOcrService.recognizeIdCardBack(file.buffer);
          break;
        case 'smart':
          result = await baiduOcrService.smartRecognizeIdCard(file.buffer);
          break;
      }
      log('OCR识别成功', { resultKeys: Object.keys(result || {}) });
    } catch (error) {
      log('OCR识别失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'OCR识别失败',
        debug: debugLog
      });
      return;
    }

    log('请求处理完成', { totalElapsed: Date.now() - startTime });
    res.status(200).json({
      success: true,
      data: result,
      debug: debugLog
    });

  } catch (error) {
    log('未捕获的错误', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器内部错误',
      debug: debugLog
    });
  }
}