import { IdCardInfo } from '../../shared/types.js';

/**
 * 百度OCR服务类
 */
export class BaiduOcrService {
  private client: any;

  private constructor(client: any) {
    this.client = client;
  }

  /**
   * 创建百度OCR服务实例
   */
  static async create(): Promise<BaiduOcrService> {
    const appId = process.env.BAIDU_APP_ID || '';
    const apiKey = process.env.BAIDU_API_KEY || '';
    const secretKey = process.env.BAIDU_SECRET_KEY || '';

    if (!appId || !apiKey || !secretKey) {
      throw new Error('百度OCR配置缺失，请检查环境变量 BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY');
    }

    console.log('初始化百度OCR服务:', { appId, apiKey: apiKey.substring(0, 8) + '...', secretKey: secretKey.substring(0, 8) + '...' });

    const baiduSdk = await import('baidu-aip-sdk');
    const AipOcr = baiduSdk.default.ocr;
    const client = new AipOcr(appId, apiKey, secretKey);
    
    // 设置超时时间
    client.timeout = 60000;
    
    return new BaiduOcrService(client);
  }

  /**
   * 验证身份证正面信息的完整性
   * @param idCardInfo 身份证信息
   * @returns 验证结果和评分
   */
  private validateIdCardFrontInfo(idCardInfo: IdCardInfo): { isValid: boolean; score: number; details: string[] } {
    const details: string[] = [];
    let score = 0;
    
    // 必需字段验证
    if (idCardInfo.name && idCardInfo.name.trim().length >= 2) {
      score += 30;
      details.push(`✅ 姓名: "${idCardInfo.name}"`);
    } else {
      details.push(`❌ 姓名缺失或无效`);
    }
    
    if (idCardInfo.idNumber && /^\d{17}[\dXx]$/.test(idCardInfo.idNumber.replace(/\s/g, ''))) {
      score += 30;
      details.push(`✅ 身份证号码: "${idCardInfo.idNumber}"`);
    } else {
      details.push(`❌ 身份证号码缺失或格式无效`);
    }
    
    if (idCardInfo.gender && ['男', '女'].includes(idCardInfo.gender)) {
      score += 15;
      details.push(`✅ 性别: "${idCardInfo.gender}"`);
    } else {
      details.push(`❌ 性别缺失或无效`);
    }
    
    // 可选字段验证
    if (idCardInfo.nation && idCardInfo.nation.trim().length > 0) {
      score += 10;
      details.push(`✅ 民族: "${idCardInfo.nation}"`);
    }
    
    if (idCardInfo.birthday && idCardInfo.birthday.trim().length > 0) {
      score += 10;
      details.push(`✅ 出生日期: "${idCardInfo.birthday}"`);
    }
    
    if (idCardInfo.address && idCardInfo.address.trim().length > 0) {
      score += 5;
      details.push(`✅ 住址: "${idCardInfo.address.substring(0, 20)}..."`);
    }
    
    const isValid = score >= 60; // 至少需要60分才认为是有效的正面
    return { isValid, score, details };
  }

  /**
   * 识别身份证正面
   * @param imageBuffer 图片buffer
   * @returns 身份证信息
   */
  async recognizeIdCardFront(imageBuffer: Buffer): Promise<IdCardInfo> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`百度OCR识别尝试 ${attempt}/${maxRetries}`);
        const base64Image = imageBuffer.toString('base64');
        
        const result = await this.client.idcard(base64Image, 'front', {
          detect_direction: true,
          detect_risk: false
        });

        console.log('百度OCR响应:', { error_code: result.error_code, error_msg: result.error_msg });

        if (result.error_code) {
          const errorMsg = `百度OCR识别失败: ${result.error_msg} (错误码: ${result.error_code})`;
          console.error(errorMsg);
          
          // 如果是IAM认证失败，等待后重试
          if (result.error_msg && result.error_msg.includes('IAM')) {
            if (attempt < maxRetries) {
              console.log(`IAM认证失败，等待 ${attempt * 2} 秒后重试...`);
              await new Promise(resolve => setTimeout(resolve, attempt * 2000));
              continue;
            }
          }
          
          throw new Error(errorMsg);
        }

        const words = result.words_result;
        console.log('OCR识别成功，提取到的字段:', Object.keys(words || {}));
        
        const idCardInfo: IdCardInfo = {
          id: `ocr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          name: words?.姓名?.words || '',
          idNumber: words?.公民身份号码?.words || '',
          gender: words?.性别?.words || '',
          nation: words?.民族?.words || '',
          birthday: words?.出生?.words || '',
          address: words?.住址?.words || '',
          frontImagePath: '',
          backImagePath: '',
          issueAuthority: '',
          validPeriod: ''
        };
        
        // 验证身份证正面信息的完整性
        const validation = this.validateIdCardFrontInfo(idCardInfo);
        console.log(`身份证正面验证结果: ${validation.isValid ? '✅ 通过' : '❌ 失败'} (评分: ${validation.score}/100)`);
        validation.details.forEach(detail => console.log(`  ${detail}`));
        
        return idCardInfo;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('未知错误');
        console.error(`百度OCR识别错误 (尝试 ${attempt}/${maxRetries}):`, lastError.message);
        
        if (attempt < maxRetries) {
          console.log(`等待 ${attempt * 2} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
      }
    }

    throw new Error(`身份证识别失败，已重试 ${maxRetries} 次: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 检测身份证反面关键字段
   * @param imageBuffer 图片buffer
   * @returns 检测结果
   */
  private async detectIdCardBackKeywords(imageBuffer: Buffer): Promise<{ hasKeywords: boolean; detectedKeywords: string[]; details: string[] }> {
    const details: string[] = [];
    const detectedKeywords: string[] = [];
    
    try {
      console.log('🔍 检测身份证反面关键字段...');
      const recognizedTexts = await this.recognizeGeneral(imageBuffer);
      const allText = recognizedTexts.join(' ');
      
      console.log('识别到的文字:', recognizedTexts);
      
      // 检查关键字段
      const keywords = ['中华人民共和国', '居民身份证'];
      
      for (const keyword of keywords) {
        if (allText.includes(keyword)) {
          detectedKeywords.push(keyword);
          details.push(`✅ 检测到关键字段: "${keyword}"`);
        }
      }
      
      const hasKeywords = detectedKeywords.length > 0;
      
      if (hasKeywords) {
        details.push(`🎯 身份证反面判定: 通过 (检测到 ${detectedKeywords.length} 个关键字段)`);
      } else {
        details.push(`❌ 身份证反面判定: 未通过 (未检测到关键字段)`);
      }
      
      return { hasKeywords, detectedKeywords, details };
    } catch (error) {
      const errorMsg = `关键字段检测失败: ${error instanceof Error ? error.message : '未知错误'}`;
      details.push(`❌ ${errorMsg}`);
      console.error(errorMsg);
      return { hasKeywords: false, detectedKeywords: [], details };
    }
  }

  /**
   * 验证身份证反面信息的完整性
   * @param backInfo 身份证反面信息
   * @param keywordDetection 关键字段检测结果
   * @returns 验证结果和评分
   */
  private validateIdCardBackInfo(
    backInfo: { issueAuthority: string; validPeriod: string },
    keywordDetection?: { hasKeywords: boolean; detectedKeywords: string[]; details: string[] }
  ): { isValid: boolean; score: number; details: string[] } {
    const details: string[] = [];
    let score = 0;
    
    // 优先使用关键字段检测结果
    if (keywordDetection) {
      details.push(...keywordDetection.details);
      
      if (keywordDetection.hasKeywords) {
        score += 80; // 检测到关键字段给高分
        details.push(`🎯 基于关键字段判定为身份证反面`);
      } else {
        details.push(`⚠️ 未检测到身份证反面关键字段，尝试传统验证方式`);
      }
    }
    
    // 签发机关验证（作为补充验证）
    if (backInfo.issueAuthority && backInfo.issueAuthority.trim().length > 0) {
      // 检查是否包含常见的签发机关关键词
      const authorityKeywords = ['公安局', '派出所', '分局', '公安分局', '公安厅', '公安部'];
      const hasValidKeyword = authorityKeywords.some(keyword => 
        backInfo.issueAuthority.includes(keyword)
      );
      
      if (hasValidKeyword) {
        score += 30;
        details.push(`✅ 签发机关: "${backInfo.issueAuthority}"`);
      } else {
        score += 10; // 有内容但不确定是否为有效签发机关
        details.push(`⚠️ 签发机关: "${backInfo.issueAuthority}" (格式可能不标准)`);
      }
    } else {
      details.push(`❌ 签发机关缺失`);
    }
    
    // 有效期验证
    if (backInfo.validPeriod && backInfo.validPeriod.trim().length > 0) {
      // 检查是否包含有效期的常见格式
      const validPeriodPatterns = [
        /\d{4}\.\d{2}\.\d{2}[-—]\d{4}\.\d{2}\.\d{2}/, // 2020.01.01-2030.01.01
        /\d{4}\.\d{2}\.\d{2}[-—]长期/, // 2020.01.01-长期
        /\d{8}[-—]\d{8}/, // 20200101-20300101
        /\d{8}[-—]长期/, // 20200101-长期
        /长期/ // 长期
      ];
      
      const hasValidFormat = validPeriodPatterns.some(pattern => 
        pattern.test(backInfo.validPeriod)
      );
      
      if (hasValidFormat) {
        score += 20;
        details.push(`✅ 有效期: "${backInfo.validPeriod}"`);
      } else {
        score += 10; // 有内容但格式可能不标准
        details.push(`⚠️ 有效期: "${backInfo.validPeriod}" (格式可能不标准)`);
      }
    } else {
      details.push(`❌ 有效期缺失`);
    }
    
    // 如果有关键字段检测，降低传统验证的要求
    const requiredScore = keywordDetection?.hasKeywords ? 80 : 70;
    const isValid = score >= requiredScore;
    
    return { isValid, score, details };
  }

  /**
   * 识别身份证背面
   * @param imageBuffer 图片buffer
   * @returns 身份证背面信息
   */
  async recognizeIdCardBack(imageBuffer: Buffer): Promise<{ issueAuthority: string; validPeriod: string; keywordDetection?: { detected: boolean; keywords: string[] } }> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    // 首先进行关键字段检测
    const keywordDetection = await this.detectIdCardBackKeywords(imageBuffer);
    console.log('关键字段检测结果:', keywordDetection);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`百度OCR背面识别尝试 ${attempt}/${maxRetries}`);
        const base64Image = imageBuffer.toString('base64');
        
        const result = await this.client.idcard(base64Image, 'back', {
          detect_direction: true,
          detect_risk: false
        });

        console.log('百度OCR背面响应:', { error_code: result.error_code, error_msg: result.error_msg });

        if (result.error_code) {
          const errorMsg = `百度OCR背面识别失败: ${result.error_msg} (错误码: ${result.error_code})`;
          console.error(errorMsg);
          
          // 如果是IAM认证失败，等待后重试
          if (result.error_msg && result.error_msg.includes('IAM')) {
            if (attempt < maxRetries) {
              console.log(`IAM认证失败，等待 ${attempt * 2} 秒后重试...`);
              await new Promise(resolve => setTimeout(resolve, attempt * 2000));
              continue;
            }
          }
          
          throw new Error(errorMsg);
        }

        const words = result.words_result;
        console.log('OCR背面识别成功，提取到的字段:', Object.keys(words || {}));
        
        const backInfo = {
          issueAuthority: words?.签发机关?.words || '',
          validPeriod: words?.有效期限?.words || '',
          keywordDetection: {
            detected: keywordDetection.hasKeywords,
            keywords: keywordDetection.detectedKeywords
          }
        };
        
        // 验证身份证反面信息的完整性（包含关键字段检测结果）
        const validation = this.validateIdCardBackInfo(backInfo, keywordDetection);
        console.log(`身份证反面验证结果: ${validation.isValid ? '✅ 通过' : '❌ 失败'} (评分: ${validation.score}/100)`);
        validation.details.forEach(detail => console.log(`  ${detail}`));
        
        return backInfo;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('未知错误');
        console.error(`百度OCR背面识别错误 (尝试 ${attempt}/${maxRetries}):`, lastError.message);
        
        if (attempt < maxRetries) {
          console.log(`等待 ${attempt * 2} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
      }
    }

    throw new Error(`身份证背面识别失败，已重试 ${maxRetries} 次: ${lastError?.message || '未知错误'}`);
  }

  /**
   * 智能识别身份证图片是正面还是反面
   * @param imageBuffer 图片buffer
   * @returns 识别结果包含正面和反面信息及评分
   */
  async smartRecognizeIdCard(imageBuffer: Buffer): Promise<{
    frontInfo: IdCardInfo | null;
    backInfo: { issueAuthority: string; validPeriod: string; keywordDetection?: { detected: boolean; keywords: string[] } } | null;
    frontScore: number;
    backScore: number;
    recommendedSide: 'front' | 'back' | 'unknown';
    details: string[];
  }> {
    const details: string[] = [];
    let frontInfo: IdCardInfo | null = null;
    let backInfo: { issueAuthority: string; validPeriod: string; keywordDetection?: { detected: boolean; keywords: string[] } } | null = null;
    let frontScore = 0;
    let backScore = 0;

    // 尝试识别正面
    try {
      console.log('🔍 尝试识别身份证正面...');
      frontInfo = await this.recognizeIdCardFront(imageBuffer);
      const frontValidation = this.validateIdCardFrontInfo(frontInfo);
      frontScore = frontValidation.score;
      details.push(`正面识别: ${frontValidation.isValid ? '✅ 成功' : '❌ 失败'} (评分: ${frontScore})`);
    } catch (error) {
      details.push(`正面识别: ❌ 失败 - ${error instanceof Error ? error.message : '未知错误'}`);
      console.log('正面识别失败:', error instanceof Error ? error.message : '未知错误');
    }

    // 尝试识别反面（包含关键字段检测）
    try {
      console.log('🔍 尝试识别身份证反面...');
      
      // 先进行关键字段检测
      const keywordDetection = await this.detectIdCardBackKeywords(imageBuffer);
      
      // 如果检测到关键字段，直接判定为反面
      if (keywordDetection.hasKeywords) {
        backScore = 90; // 关键字段检测成功给高分
        details.push(`反面识别: ✅ 成功 (关键字段检测) (评分: ${backScore})`);
        details.push(`检测到关键字段: ${keywordDetection.detectedKeywords.join(', ')}`);
        
        // 仍然尝试获取签发机关和有效期信息
        try {
          backInfo = await this.recognizeIdCardBack(imageBuffer);
        } catch (error) {
          // 如果传统识别失败，创建一个基本的反面信息
          backInfo = { 
            issueAuthority: '', 
            validPeriod: '',
            keywordDetection: {
              detected: keywordDetection.hasKeywords,
              keywords: keywordDetection.detectedKeywords
            }
          };
        }
      } else {
        // 没有检测到关键字段，使用传统方式识别
        backInfo = await this.recognizeIdCardBack(imageBuffer);
        const backValidation = this.validateIdCardBackInfo(backInfo, keywordDetection);
        backScore = backValidation.score;
        details.push(`反面识别: ${backValidation.isValid ? '✅ 成功' : '❌ 失败'} (评分: ${backScore})`);
      }
    } catch (error) {
      details.push(`反面识别: ❌ 失败 - ${error instanceof Error ? error.message : '未知错误'}`);
      console.log('反面识别失败:', error instanceof Error ? error.message : '未知错误');
    }

    // 判断推荐的面
    let recommendedSide: 'front' | 'back' | 'unknown' = 'unknown';
    
    if (frontScore > backScore && frontScore >= 60) {
      recommendedSide = 'front';
      details.push(`🎯 推荐判断: 正面 (正面评分 ${frontScore} > 反面评分 ${backScore})`);
    } else if (backScore > frontScore && backScore >= 70) {
      recommendedSide = 'back';
      details.push(`🎯 推荐判断: 反面 (反面评分 ${backScore} > 正面评分 ${frontScore})`);
    } else if (frontScore === backScore && frontScore > 0) {
      // 评分相同时，优先选择正面（因为正面信息更重要）
      recommendedSide = 'front';
      details.push(`🎯 推荐判断: 正面 (评分相同，优先选择正面)`);
    } else {
      details.push(`❓ 无法确定正反面 (正面评分: ${frontScore}, 反面评分: ${backScore})`);
    }

    console.log('🧠 智能识别结果:');
    details.forEach(detail => console.log(`  ${detail}`));

    return {
      frontInfo,
      backInfo,
      frontScore,
      backScore,
      recommendedSide,
      details
    };
  }

  /**
   * 通用文字识别
   * @param imageBuffer 图片buffer
   * @returns 识别结果
   */
  async recognizeGeneral(imageBuffer: Buffer): Promise<string[]> {
    try {
      const base64Image = imageBuffer.toString('base64');
      
      const result = await this.client.generalBasic(base64Image, {
        detect_direction: true,
        probability: false
      });

      if (result.error_code) {
        throw new Error(`百度OCR识别失败: ${result.error_msg}`);
      }

      return result.words_result?.map((item: any) => item.words) || [];
    } catch (error) {
      console.error('百度OCR识别错误:', error);
      throw new Error(`文字识别失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
}

// 导出单例实例
let baiduOcrInstance: BaiduOcrService | null = null;

export async function getBaiduOcrService(): Promise<BaiduOcrService> {
  // 每次都重新创建实例，避免认证缓存问题
  try {
    baiduOcrInstance = await BaiduOcrService.create();
    return baiduOcrInstance;
  } catch (error) {
    console.error('创建百度OCR服务失败:', error);
    throw error;
  }
}