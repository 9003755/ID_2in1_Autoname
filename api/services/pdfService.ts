import { jsPDF } from 'jspdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { IdCardInfo } from '../../shared/types';
import { ensureDirectoryExists, generateUniqueFileName } from '../utils/fileUtils';

export interface PdfGenerationOptions {
  frontImagePath: string;
  backImagePath: string;
  name: string;
  outputDir: string;
  idCardInfo?: IdCardInfo;
}

export interface PdfGenerationResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
}

export interface SimplePdfGenerationOptions {
  image1Path: string;
  image2Path: string;
  fileName: string;
  outputDir: string;
}

export class PdfService {
  private static readonly A4_WIDTH = 595.28; // A4宽度（点）
  private static readonly A4_HEIGHT = 841.89; // A4高度（点）
  private static readonly MARGIN = 50; // 页边距
  private static readonly CARD_WIDTH = 300; // 身份证显示宽度
  private static readonly CARD_HEIGHT = 190; // 身份证显示高度

  /**
   * 生成包含身份证正反面的PDF文件
   */
  async generateIdCardPdf(options: PdfGenerationOptions): Promise<PdfGenerationResult> {
    try {
      const { frontImagePath, backImagePath, name, outputDir, idCardInfo } = options;

      // 验证输入文件
      if (!fs.existsSync(frontImagePath)) {
        throw new Error('身份证正面图片文件不存在');
      }
      if (!fs.existsSync(backImagePath)) {
        throw new Error('身份证反面图片文件不存在');
      }

      // 确保输出目录存在
      ensureDirectoryExists(outputDir);

      // 生成PDF文件名（简化格式，不包含时间戳）
      const fileName = `${name}_身份证.pdf`;
      const outputPath = path.join(outputDir, fileName);

      // 创建PDF文档
      const pdfDoc = await PDFDocument.create();
      
      // 注册fontkit以支持自定义字体
      pdfDoc.registerFontkit(fontkit);
      
      // 尝试嵌入中文字体
      let chineseFont;
      try {
        // 尝试使用系统字体路径（Windows）
        const fontPaths = [
          'C:/Windows/Fonts/simhei.ttf',  // 黑体
          'C:/Windows/Fonts/simsun.ttc',  // 宋体
          'C:/Windows/Fonts/msyh.ttc',    // 微软雅黑
          'C:/Windows/Fonts/simkai.ttf'   // 楷体
        ];
        
        let fontBytes = null;
        for (const fontPath of fontPaths) {
          if (fs.existsSync(fontPath)) {
            fontBytes = fs.readFileSync(fontPath);
            break;
          }
        }
        
        if (fontBytes) {
          chineseFont = await pdfDoc.embedFont(fontBytes);
        } else {
          // 如果没有找到系统字体，使用标准字体
          console.warn('未找到中文字体，使用标准字体');
          chineseFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        }
      } catch (error) {
        console.warn('字体加载失败，使用标准字体:', error);
        chineseFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      }
      
      const page = pdfDoc.addPage([PdfService.A4_WIDTH, PdfService.A4_HEIGHT]);

      // 读取图片文件
      const frontImageBytes = fs.readFileSync(frontImagePath);
      const backImageBytes = fs.readFileSync(backImagePath);

      // 嵌入图片到PDF
      let frontImage, backImage;
      try {
        // 尝试作为JPEG处理
        frontImage = await pdfDoc.embedJpg(frontImageBytes);
        backImage = await pdfDoc.embedJpg(backImageBytes);
      } catch {
        try {
          // 如果JPEG失败，尝试作为PNG处理
          frontImage = await pdfDoc.embedPng(frontImageBytes);
          backImage = await pdfDoc.embedPng(backImageBytes);
        } catch (error) {
          throw new Error('不支持的图片格式，请使用JPEG或PNG格式');
        }
      }

      // 计算图片位置（居中显示）
      const frontImageDims = frontImage.scale(1);
      const backImageDims = backImage.scale(1);

      // 计算缩放比例以适应指定尺寸
      const frontScale = Math.min(
        PdfService.CARD_WIDTH / frontImageDims.width,
        PdfService.CARD_HEIGHT / frontImageDims.height
      );
      const backScale = Math.min(
        PdfService.CARD_WIDTH / backImageDims.width,
        PdfService.CARD_HEIGHT / backImageDims.height
      );

      const frontScaledWidth = frontImageDims.width * frontScale;
      const frontScaledHeight = frontImageDims.height * frontScale;
      const backScaledWidth = backImageDims.width * backScale;
      const backScaledHeight = backImageDims.height * backScale;

      // 计算居中位置
      const frontX = (PdfService.A4_WIDTH - frontScaledWidth) / 2;
      const frontY = PdfService.A4_HEIGHT - PdfService.MARGIN - frontScaledHeight - 50;
      
      const backX = (PdfService.A4_WIDTH - backScaledWidth) / 2;
      const backY = frontY - backScaledHeight - 30;

      // 添加标题
      page.drawText('身份证信息', {
        x: (PdfService.A4_WIDTH - 100) / 2,
        y: PdfService.A4_HEIGHT - 30,
        size: 16,
        color: rgb(0, 0, 0),
        font: chineseFont,
      });

      // 添加正面标签
      page.drawText('正面:', {
        x: frontX,
        y: frontY + frontScaledHeight + 10,
        size: 12,
        color: rgb(0, 0, 0),
        font: chineseFont,
      });

      // 绘制身份证正面
      page.drawImage(frontImage, {
        x: frontX,
        y: frontY,
        width: frontScaledWidth,
        height: frontScaledHeight,
      });

      // 添加反面标签
      page.drawText('反面:', {
        x: backX,
        y: backY + backScaledHeight + 10,
        size: 12,
        color: rgb(0, 0, 0),
        font: chineseFont,
      });

      // 绘制身份证反面
      page.drawImage(backImage, {
        x: backX,
        y: backY,
        width: backScaledWidth,
        height: backScaledHeight,
      });

      // 如果有身份证信息，添加文字信息
      if (idCardInfo) {
        this.addIdCardInfo(page, idCardInfo, backY - 50, chineseFont);
      }

      // 保存PDF
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(outputPath, pdfBytes);

      return {
        success: true,
        filePath: outputPath,
        fileName: fileName
      };

    } catch (error) {
      console.error('PDF生成失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 在PDF中添加身份证文字信息
   */
  private addIdCardInfo(page: any, idCardInfo: IdCardInfo, startY: number, font: any) {
    const leftX = PdfService.MARGIN;
    const rightX = PdfService.A4_WIDTH / 2 + 20;
    let currentY = startY;
    const lineHeight = 20;
    const fontSize = 10;

    // 添加信息标题
    page.drawText('身份证信息:', {
      x: leftX,
      y: currentY,
      size: 12,
      color: rgb(0, 0, 0),
      font: font,
    });
    currentY -= lineHeight * 1.5;

    // 左列信息
    const leftInfo = [
      { label: '姓名:', value: idCardInfo.name || '' },
      { label: '性别:', value: idCardInfo.gender || '' },
      { label: '民族:', value: idCardInfo.nation || '' },
      { label: '出生日期:', value: idCardInfo.birthday || '' }
    ];

    // 右列信息
    const rightInfo = [
      { label: '身份证号:', value: idCardInfo.idNumber || '' },
      { label: '住址:', value: idCardInfo.address || '' },
      { label: '签发机关:', value: idCardInfo.issueAuthority || '' },
      { label: '有效期限:', value: idCardInfo.validPeriod || '' }
    ];

    // 绘制左列
    leftInfo.forEach((info, index) => {
      const y = currentY - index * lineHeight;
      page.drawText(info.label, {
        x: leftX,
        y: y,
        size: fontSize,
        color: rgb(0, 0, 0),
        font: font,
      });
      page.drawText(info.value, {
        x: leftX + 60,
        y: y,
        size: fontSize,
        color: rgb(0.2, 0.2, 0.2),
        font: font,
      });
    });

    // 绘制右列
    rightInfo.forEach((info, index) => {
      const y = currentY - index * lineHeight;
      page.drawText(info.label, {
        x: rightX,
        y: y,
        size: fontSize,
        color: rgb(0, 0, 0),
        font: font,
      });
      page.drawText(info.value, {
        x: rightX + 60,
        y: y,
        size: fontSize,
        color: rgb(0.2, 0.2, 0.2),
        font: font,
      });
    });
  }

  /**
   * 生成简单的两张图片合并PDF文件
   */
  async generateSimplePdf(options: SimplePdfGenerationOptions): Promise<PdfGenerationResult> {
    try {
      const { image1Path, image2Path, fileName, outputDir } = options;

      // 验证输入文件
      if (!fs.existsSync(image1Path)) {
        throw new Error('第一张图片文件不存在');
      }
      if (!fs.existsSync(image2Path)) {
        throw new Error('第二张图片文件不存在');
      }

      // 确保输出目录存在
      ensureDirectoryExists(outputDir);

      // 生成PDF文件名
      const pdfFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
      const outputPath = path.join(outputDir, pdfFileName);

      // 创建PDF文档
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([PdfService.A4_WIDTH, PdfService.A4_HEIGHT]);

      // 读取图片文件
      const image1Bytes = fs.readFileSync(image1Path);
      const image2Bytes = fs.readFileSync(image2Path);

      // 嵌入图片到PDF
      let image1, image2;
      try {
        // 尝试作为JPEG处理
        image1 = await pdfDoc.embedJpg(image1Bytes);
        image2 = await pdfDoc.embedJpg(image2Bytes);
      } catch {
        try {
          // 如果JPEG失败，尝试作为PNG处理
          image1 = await pdfDoc.embedPng(image1Bytes);
          image2 = await pdfDoc.embedPng(image2Bytes);
        } catch (error) {
          throw new Error('不支持的图片格式，请使用JPEG或PNG格式');
        }
      }

      // 计算图片尺寸和位置（居中显示）
      const image1Dims = image1.scale(1);
      const image2Dims = image2.scale(1);

      // 计算可用空间（为两张图片留出空间）
      const availableHeight = PdfService.A4_HEIGHT - 2 * PdfService.MARGIN - 30; // 30为图片间距
      const maxImageHeight = availableHeight / 2;
      const maxImageWidth = PdfService.A4_WIDTH - 2 * PdfService.MARGIN;

      // 计算第一张图片的缩放比例
      const image1Scale = Math.min(
        maxImageWidth / image1Dims.width,
        maxImageHeight / image1Dims.height
      );
      const image1ScaledWidth = image1Dims.width * image1Scale;
      const image1ScaledHeight = image1Dims.height * image1Scale;

      // 计算第二张图片的缩放比例
      const image2Scale = Math.min(
        maxImageWidth / image2Dims.width,
        maxImageHeight / image2Dims.height
      );
      const image2ScaledWidth = image2Dims.width * image2Scale;
      const image2ScaledHeight = image2Dims.height * image2Scale;

      // 计算第一张图片的居中位置（上半部分）
      const image1X = (PdfService.A4_WIDTH - image1ScaledWidth) / 2;
      const image1Y = PdfService.A4_HEIGHT - PdfService.MARGIN - image1ScaledHeight;

      // 计算第二张图片的居中位置（下半部分）
      const image2X = (PdfService.A4_WIDTH - image2ScaledWidth) / 2;
      const image2Y = image1Y - image1ScaledHeight - 30 - image2ScaledHeight;

      // 绘制第一张图片
      page.drawImage(image1, {
        x: image1X,
        y: image1Y,
        width: image1ScaledWidth,
        height: image1ScaledHeight,
      });

      // 绘制第二张图片
      page.drawImage(image2, {
        x: image2X,
        y: image2Y,
        width: image2ScaledWidth,
        height: image2ScaledHeight,
      });

      // 保存PDF
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(outputPath, pdfBytes);

      return {
        success: true,
        filePath: outputPath,
        fileName: pdfFileName
      };

    } catch (error) {
      console.error('简单PDF生成失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 清理临时文件
   */
  static async cleanupTempFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`清理临时文件失败: ${filePath}`, error);
      }
    }
  }

  /**
   * 验证图片文件格式
   */
  static isValidImageFormat(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.jpg', '.jpeg', '.png'].includes(ext);
  }
}