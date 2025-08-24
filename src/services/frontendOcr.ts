import Tesseract from 'tesseract.js';
import { IdCardInfo } from '../../shared/types';

/**
 * 前端OCR服务类
 * 使用Tesseract.js在浏览器端进行身份证识别
 */
export class FrontendOcrService {
  private static instance: FrontendOcrService;
  private worker: Tesseract.Worker | null = null;

  private constructor() {}

  static getInstance(): FrontendOcrService {
    if (!FrontendOcrService.instance) {
      FrontendOcrService.instance = new FrontendOcrService();
    }
    return FrontendOcrService.instance;
  }

  /**
   * 初始化OCR工作器
   */
  private async initWorker(): Promise<Tesseract.Worker> {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker('chi_sim', 1, {
        logger: m => console.log(m)
      });
    }
    return this.worker;
  }

  /**
   * 识别身份证正面信息
   * @param imageFile 图片文件
   * @returns 身份证信息
   */
  async recognizeIdCardFront(imageFile: File): Promise<IdCardInfo> {
    try {
      const worker = await this.initWorker();
      const { data: { text } } = await worker.recognize(imageFile);
      
      console.log('OCR识别结果:', text);
      
      // 解析身份证信息
      const idCardInfo = this.parseIdCardText(text);
      
      return {
        id: `ocr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        name: idCardInfo.name || '',
        idNumber: idCardInfo.idNumber || '',
        gender: idCardInfo.gender || '',
        nation: idCardInfo.nation || '',
        birthday: idCardInfo.birthday || '',
        address: idCardInfo.address || '',
        frontImagePath: '',
        backImagePath: '',
        issueAuthority: '',
        validPeriod: ''
      };
    } catch (error) {
      console.error('前端OCR识别失败:', error);
      throw new Error('身份证识别失败，请确保图片清晰且为身份证正面');
    }
  }

  /**
   * 解析OCR识别的文本，提取身份证信息
   * @param text OCR识别的原始文本
   * @returns 解析后的身份证信息
   */
  private parseIdCardText(text: string): Partial<IdCardInfo> {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const result: Partial<IdCardInfo> = {
      name: '',
      idNumber: '',
      gender: '',
      nation: '',
      birthday: '',
      address: ''
    };

    // 姓名识别 - 通常在前几行，包含中文字符
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i];
      // 跳过包含"身份证"、"居民"等关键词的行
      if (line.includes('身份证') || line.includes('居民') || line.includes('中华人民共和国')) {
        continue;
      }
      // 查找纯中文姓名（2-4个字符）
      const nameMatch = line.match(/^([\u4e00-\u9fa5]{2,4})$/);
      if (nameMatch && !result.name) {
        result.name = nameMatch[1];
        break;
      }
    }

    // 身份证号码识别
    const idNumberMatch = text.match(/(\d{17}[\dXx])/g);
    if (idNumberMatch) {
      result.idNumber = idNumberMatch[0];
    }

    // 性别识别
    if (text.includes('男')) {
      result.gender = '男';
    } else if (text.includes('女')) {
      result.gender = '女';
    }

    // 民族识别
    const nationMatch = text.match(/([\u4e00-\u9fa5]+族)/);
    if (nationMatch) {
      result.nation = nationMatch[1];
    }

    // 出生日期识别
    const birthdayMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (birthdayMatch) {
      result.birthday = `${birthdayMatch[1]}年${birthdayMatch[2]}月${birthdayMatch[3]}日`;
    }

    // 地址识别 - 查找较长的中文地址
    for (const line of lines) {
      if (line.length > 6 && /[\u4e00-\u9fa5]{6,}/.test(line) && 
          !line.includes('身份证') && !line.includes('居民') && 
          !line.includes('中华人民共和国') && !result.name.includes(line)) {
        result.address = line;
        break;
      }
    }

    return result;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

// 导出单例实例
export const frontendOcrService = FrontendOcrService.getInstance();