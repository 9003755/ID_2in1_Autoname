import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

/**
 * 文件上传错误处理中间件
 */
export function handleMulterError(error: any, req: Request, res: Response, next: NextFunction) {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          error: '文件大小超过限制（最大10MB）'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          error: '文件数量超过限制'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          error: '意外的文件字段'
        });
      default:
        return res.status(400).json({
          success: false,
          error: `文件上传错误: ${error.message}`
        });
    }
  }
  
  if (error.message === '只允许上传图片文件') {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  
  next(error);
}

/**
 * 请求体验证中间件
 */
export function validateRequiredFields(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必需字段: ${missingFields.join(', ')}`
      });
    }
    
    next();
  };
}

/**
 * 请求体验证中间件（别名）
 */
export function validateRequestBody(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必需字段: ${missingFields.join(', ')}`
      });
    }
    
    next();
  };
}

/**
 * 文件上传验证中间件
 */
export function validateFileUpload(requiredFiles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[];
    
    if (!files) {
      return res.status(400).json({
        success: false,
        error: '请上传文件'
      });
    }
    
    // 检查单个文件
    if (req.file && requiredFiles.length === 1) {
      return next();
    }
    
    // 检查多个文件
    if (typeof files === 'object' && !Array.isArray(files)) {
      const missingFiles = requiredFiles.filter(field => !files[field] || files[field].length === 0);
      
      if (missingFiles.length > 0) {
        return res.status(400).json({
          success: false,
          error: `缺少必需文件: ${missingFiles.join(', ')}`
        });
      }
    }
    
    next();
  };
}

/**
 * 文件验证中间件（别名）
 */
export function validateFiles(requiredFiles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[];
    
    if (!files) {
      return res.status(400).json({
        success: false,
        error: '请上传文件'
      });
    }
    
    // 检查单个文件
    if (req.file && requiredFiles.length === 1) {
      return next();
    }
    
    // 检查多个文件
    if (typeof files === 'object' && !Array.isArray(files)) {
      const missingFiles = requiredFiles.filter(field => !files[field] || files[field].length === 0);
      
      if (missingFiles.length > 0) {
        return res.status(400).json({
          success: false,
          error: `缺少必需文件: ${missingFiles.join(', ')}`
        });
      }
    }
    
    next();
  };
}

/**
 * 异步错误处理包装器
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 路径安全验证中间件
 */
export function validatePath(req: Request, res: Response, next: NextFunction) {
  const { outputPath, folders } = req.body;
  
  // 检查输出路径
  if (outputPath && (outputPath.includes('..') || outputPath.includes('~'))) {
    return res.status(400).json({
      success: false,
      error: '无效的输出路径'
    });
  }
  
  // 检查文件夹路径
  if (folders && Array.isArray(folders)) {
    const invalidPaths = folders.filter((folder: string) => 
      folder.includes('..') || folder.includes('~')
    );
    
    if (invalidPaths.length > 0) {
      return res.status(400).json({
        success: false,
        error: '包含无效的文件夹路径'
      });
    }
  }
  
  next();
}