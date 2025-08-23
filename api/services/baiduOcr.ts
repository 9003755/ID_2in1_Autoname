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

    const baiduSdk = await import('baidu-aip-sdk');
    const AipOcr = baiduSdk.default.ocr;
    const client = new AipOcr(appId, apiKey, secretKey);
    
    return new BaiduOcrService(client);
  }

  /**
   * 识别身份证正面
   * @param imageBuffer 图片buffer
   * @returns 身份证信息
   */
  async recognizeIdCardFront(imageBuffer: Buffer): Promise<IdCardInfo> {
    try {
      const base64Image = imageBuffer.toString('base64');
      
      const result = await this.client.idcard(base64Image, 'front', {
        detect_direction: true,
        detect_risk: false
      });

      if (result.error_code) {
        throw new Error(`百度OCR识别失败: ${result.error_msg}`);
      }

      const words = result.words_result;
      
      return {
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
    } catch (error) {
      console.error('百度OCR识别错误:', error);
      throw new Error(`身份证识别失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 识别身份证背面
   * @param imageBuffer 图片buffer
   * @returns 身份证信息
   */
  async recognizeIdCardBack(imageBuffer: Buffer): Promise<Partial<IdCardInfo>> {
    try {
      const base64Image = imageBuffer.toString('base64');
      
      const result = await this.client.idcard(base64Image, 'back', {
        detect_direction: true,
        detect_risk: false
      });

      if (result.error_code) {
        throw new Error(`百度OCR识别失败: ${result.error_msg}`);
      }

      const words = result.words_result;
      
      return {
        id: `ocr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        name: '',
        idNumber: '',
        gender: '',
        nation: '',
        birthday: '',
        address: '',
        frontImagePath: '',
        backImagePath: '',
        issueAuthority: words?.签发机关?.words || '',
        validPeriod: words?.签发日期?.words || ''
      };
    } catch (error) {
      console.error('百度OCR识别错误:', error);
      throw new Error(`身份证识别失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
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
  if (!baiduOcrInstance) {
    baiduOcrInstance = await BaiduOcrService.create();
  }
  return baiduOcrInstance;
}