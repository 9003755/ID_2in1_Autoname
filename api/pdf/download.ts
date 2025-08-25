import type { VercelRequest, VercelResponse } from '@vercel/node';
import multer from 'multer';
import { PdfService } from '../services/pdfService';

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
    // 运行multer中间件处理多文件上传
    await runMiddleware(req, res, upload.fields([
      { name: 'front', maxCount: 1 },
      { name: 'back', maxCount: 1 }
    ]));

    const files = (req as any).files;
    const { name, fileName } = req.body;

    if (!files?.front?.[0] || !files?.back?.[0]) {
      res.status(400).json({
        success: false,
        error: '请上传身份证正反面照片'
      });
      return;
    }

    if (!name?.trim()) {
      res.status(400).json({
        success: false,
        error: '请提供姓名'
      });
      return;
    }

    console.log(`收到PDF生成请求: 姓名=${name}, 正面文件大小=${files.front[0].size}, 反面文件大小=${files.back[0].size}`);

    // 创建PDF服务实例
    const pdfService = new PdfService();

    // 生成PDF
    const pdfBuffer = await pdfService.createIdCardPdfFromBuffers(
      files.front[0].buffer,
      files.back[0].buffer,
      name.trim()
    );

    // 设置响应头
    const finalFileName = fileName || `${name.trim()}身份证.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFileName)}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // 发送PDF文件
    res.status(200).send(pdfBuffer);
    
    console.log(`PDF生成成功: ${finalFileName}`);
  } catch (error) {
    console.error('PDF生成失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'PDF生成失败'
    });
  }
}