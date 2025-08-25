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
  fileName?: string;
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
      
      console.log('开始生成PDF:', { frontImagePath, backImagePath, name, outputDir });

      // 验证输入文件
      if (!fs.existsSync(frontImagePath)) {
        const error = '身份证正面图片文件不存在';
        console.error(error, frontImagePath);
        throw new Error(error);
      }
      if (!fs.existsSync(backImagePath)) {
        const error = '身份证反面图片文件不存在';
        console.error(error, backImagePath);
        throw new Error(error);
      }

      // 确保输出目录存在
      try {
        ensureDirectoryExists(outputDir);
        console.log('输出目录已确保存在:', outputDir);
      } catch (dirError) {
        console.error('创建输出目录失败:', dirError);
        throw new Error('无法创建输出目录');
      }

      // 生成PDF文件名（使用传入的fileName或默认格式：身份证姓名+身份证）
      const fileName = options.fileName || `${name}身份证.pdf`;
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

      // 计算图片尺寸和位置（智能缩放：只有超出PDF尺寸时才缩放）
      const pageWidth = PdfService.A4_WIDTH;
      const pageHeight = PdfService.A4_HEIGHT;
      const margin = PdfService.MARGIN;
      const maxWidth = pageWidth - 2 * margin;
      const titleHeight = 80; // 标题区域高度
      const infoHeight = idCardInfo ? 120 : 0; // 身份证信息区域高度
      const availableHeight = pageHeight - 2 * margin - titleHeight - infoHeight;
      const imageSpacing = 30; // 图片间距
      
      // 首先检查两张图片原始尺寸是否能放入PDF
      const totalOriginalHeight = frontImage.height + backImage.height + imageSpacing;
      const maxOriginalWidth = Math.max(frontImage.width, backImage.width);
      
      // 判断是否需要缩放
      const needsScaling = totalOriginalHeight > availableHeight || maxOriginalWidth > maxWidth;
      
      let frontScaledWidth, frontScaledHeight, backScaledWidth, backScaledHeight;
      
      if (needsScaling) {
        // 需要缩放：计算缩放比例以适应页面
        const maxImageHeight = (availableHeight - imageSpacing) / 2; // 每张图片的最大高度
        
        // 正面图片缩放
        const frontScaleX = maxWidth / frontImage.width;
        const frontScaleY = maxImageHeight / frontImage.height;
        const frontScale = Math.min(frontScaleX, frontScaleY, 1); // 不放大，只缩小
        frontScaledWidth = frontImage.width * frontScale;
        frontScaledHeight = frontImage.height * frontScale;
        
        // 反面图片缩放
        const backScaleX = maxWidth / backImage.width;
        const backScaleY = maxImageHeight / backImage.height;
        const backScale = Math.min(backScaleX, backScaleY, 1); // 不放大，只缩小
        backScaledWidth = backImage.width * backScale;
        backScaledHeight = backImage.height * backScale;
        
        console.log('身份证图片需要缩放以适应PDF尺寸');
      } else {
        // 不需要缩放：保持原始尺寸
        frontScaledWidth = frontImage.width;
        frontScaledHeight = frontImage.height;
        backScaledWidth = backImage.width;
        backScaledHeight = backImage.height;
        
        console.log('身份证图片保持原始尺寸，无需缩放');
      }
      
      // 计算居中位置
      const totalContentHeight = frontScaledHeight + backScaledHeight + imageSpacing;
      const contentStartY = pageHeight - margin - titleHeight - (availableHeight - totalContentHeight) / 2;
      
      const frontX = (pageWidth - frontScaledWidth) / 2; // 水平居中
      const frontY = contentStartY - frontScaledHeight; // 正面图片位置
      const backX = (pageWidth - backScaledWidth) / 2; // 水平居中
      const backY = frontY - imageSpacing - backScaledHeight; // 反面图片位置（在正面下方，留有间距）

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
        const infoStartY = backY - 30; // 在反面图片下方留30像素间距
        this.addIdCardInfo(page, idCardInfo, infoStartY, chineseFont);
      }

      // 保存PDF
      console.log('开始保存PDF到:', outputPath);
      const pdfBytes = await pdfDoc.save();
      
      try {
        fs.writeFileSync(outputPath, pdfBytes);
        console.log('PDF保存成功:', outputPath);
        
        // 验证文件是否真的被创建
        if (!fs.existsSync(outputPath)) {
          throw new Error('PDF文件保存失败：文件未创建');
        }
        
        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
          throw new Error('PDF文件保存失败：文件大小为0');
        }
        
        console.log('PDF文件验证成功，大小:', stats.size, 'bytes');
        
        return {
          success: true,
          filePath: outputPath,
          fileName: fileName
        };
      } catch (saveError) {
        console.error('PDF保存失败:', saveError);
        throw new Error('PDF文件保存失败: ' + (saveError instanceof Error ? saveError.message : '未知错误'));
      }

    } catch (error) {
      console.error('PDF生成失败:', error);
      console.error('错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');
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
      
      console.log('开始生成简单PDF:', { image1Path, image2Path, fileName, outputDir });

      // 验证输入文件
      if (!fs.existsSync(image1Path)) {
        const error = '第一张图片文件不存在';
        console.error(error, image1Path);
        throw new Error(error);
      }
      if (!fs.existsSync(image2Path)) {
        const error = '第二张图片文件不存在';
        console.error(error, image2Path);
        throw new Error(error);
      }

      // 确保输出目录存在
      try {
        ensureDirectoryExists(outputDir);
        console.log('输出目录已确保存在:', outputDir);
      } catch (dirError) {
        console.error('创建输出目录失败:', dirError);
        throw new Error('无法创建输出目录');
      }

      // 生成PDF文件名（格式：身份证姓名+身份证）
      const baseName = fileName.endsWith('.pdf') ? fileName.slice(0, -4) : fileName;
      const pdfFileName = `${baseName}身份证.pdf`;
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

      // 计算图片尺寸和位置（智能缩放：只有超出PDF尺寸时才缩放）
      const pageWidth = PdfService.A4_WIDTH;
      const pageHeight = PdfService.A4_HEIGHT;
      const margin = PdfService.MARGIN;
      const maxWidth = pageWidth - 2 * margin;
      const availableHeight = pageHeight - 2 * margin;
      const imageSpacing = 20; // 图片间距
      
      // 首先检查两张图片原始尺寸是否能放入PDF
      const totalOriginalHeight = image1.height + image2.height + imageSpacing;
      const maxOriginalWidth = Math.max(image1.width, image2.width);
      
      // 判断是否需要缩放
      const needsScaling = totalOriginalHeight > availableHeight || maxOriginalWidth > maxWidth;
      
      let image1ScaledWidth, image1ScaledHeight, image2ScaledWidth, image2ScaledHeight;
      
      if (needsScaling) {
        // 需要缩放：计算缩放比例以适应页面
        const maxImageHeight = (availableHeight - imageSpacing) / 2; // 每张图片的最大高度
        
        // 第一张图片缩放
        const firstScaleX = maxWidth / image1.width;
        const firstScaleY = maxImageHeight / image1.height;
        const firstScale = Math.min(firstScaleX, firstScaleY, 1); // 不放大，只缩小
        image1ScaledWidth = image1.width * firstScale;
        image1ScaledHeight = image1.height * firstScale;
        
        // 第二张图片缩放
        const secondScaleX = maxWidth / image2.width;
        const secondScaleY = maxImageHeight / image2.height;
        const secondScale = Math.min(secondScaleX, secondScaleY, 1); // 不放大，只缩小
        image2ScaledWidth = image2.width * secondScale;
        image2ScaledHeight = image2.height * secondScale;
        
        console.log('图片需要缩放以适应PDF尺寸');
      } else {
        // 不需要缩放：保持原始尺寸
        image1ScaledWidth = image1.width;
        image1ScaledHeight = image1.height;
        image2ScaledWidth = image2.width;
        image2ScaledHeight = image2.height;
        
        console.log('图片保持原始尺寸，无需缩放');
      }
      
      // 计算居中位置
      const totalContentHeight = image1ScaledHeight + image2ScaledHeight + imageSpacing;
      const startY = (pageHeight + totalContentHeight) / 2; // 垂直居中起始位置
      
      const image1X = (pageWidth - image1ScaledWidth) / 2; // 水平居中
      const image1Y = startY - image1ScaledHeight; // 第一张图片位置
      const image2X = (pageWidth - image2ScaledWidth) / 2; // 水平居中
      const image2Y = image1Y - imageSpacing - image2ScaledHeight; // 第二张图片位置（在第一张下方，留有间距）

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
      console.log('开始保存简单PDF到:', outputPath);
      const pdfBytes = await pdfDoc.save();
      
      try {
        fs.writeFileSync(outputPath, pdfBytes);
        console.log('简单PDF保存成功:', outputPath);
        
        // 验证文件是否真的被创建
        if (!fs.existsSync(outputPath)) {
          throw new Error('PDF文件保存失败：文件未创建');
        }
        
        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
          throw new Error('PDF文件保存失败：文件大小为0');
        }
        
        console.log('简单PDF文件验证成功，大小:', stats.size, 'bytes');
        
        return {
          success: true,
          filePath: outputPath,
          fileName: pdfFileName
        };
      } catch (saveError) {
        console.error('简单PDF保存失败:', saveError);
        throw new Error('PDF文件保存失败: ' + (saveError instanceof Error ? saveError.message : '未知错误'));
      }

    } catch (error) {
      console.error('简单PDF生成失败:', error);
      console.error('错误堆栈:', error instanceof Error ? error.stack : 'No stack trace');
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 从buffer生成身份证PDF
   */
  async createIdCardPdfFromBuffers(
    frontImageBuffer: Buffer,
    backImageBuffer: Buffer,
    name: string
  ): Promise<Buffer> {
    try {
      console.log(`开始从buffer生成PDF: 姓名=${name}, 正面大小=${frontImageBuffer.length}, 反面大小=${backImageBuffer.length}`);

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

      // 嵌入图片到PDF
      let frontImage, backImage;
      try {
        // 尝试作为JPEG处理
        frontImage = await pdfDoc.embedJpg(frontImageBuffer);
        backImage = await pdfDoc.embedJpg(backImageBuffer);
      } catch {
        try {
          // 如果JPEG失败，尝试作为PNG处理
          frontImage = await pdfDoc.embedPng(frontImageBuffer);
          backImage = await pdfDoc.embedPng(backImageBuffer);
        } catch (error) {
          throw new Error('不支持的图片格式，请使用JPEG或PNG格式');
        }
      }

      // 计算图片尺寸和位置（智能缩放：只有超出PDF尺寸时才缩放）
      const pageWidth = PdfService.A4_WIDTH;
      const pageHeight = PdfService.A4_HEIGHT;
      const margin = PdfService.MARGIN;
      const maxWidth = pageWidth - 2 * margin;
      const titleHeight = 80; // 标题区域高度
      const availableHeight = pageHeight - 2 * margin - titleHeight;
      const imageSpacing = 30; // 图片间距
      
      // 首先检查两张图片原始尺寸是否能放入PDF
      const totalOriginalHeight = frontImage.height + backImage.height + imageSpacing;
      const maxOriginalWidth = Math.max(frontImage.width, backImage.width);
      
      // 判断是否需要缩放
      const needsScaling = totalOriginalHeight > availableHeight || maxOriginalWidth > maxWidth;
      
      let frontScaledWidth, frontScaledHeight, backScaledWidth, backScaledHeight;
      
      if (needsScaling) {
        // 需要缩放：计算缩放比例以适应页面
        const maxImageHeight = (availableHeight - imageSpacing) / 2; // 每张图片的最大高度
        
        // 正面图片缩放
        const frontScaleX = maxWidth / frontImage.width;
        const frontScaleY = maxImageHeight / frontImage.height;
        const frontScale = Math.min(frontScaleX, frontScaleY, 1); // 不放大，只缩小
        frontScaledWidth = frontImage.width * frontScale;
        frontScaledHeight = frontImage.height * frontScale;
        
        // 反面图片缩放
        const backScaleX = maxWidth / backImage.width;
        const backScaleY = maxImageHeight / backImage.height;
        const backScale = Math.min(backScaleX, backScaleY, 1); // 不放大，只缩小
        backScaledWidth = backImage.width * backScale;
        backScaledHeight = backImage.height * backScale;
        
        console.log('身份证图片需要缩放以适应PDF尺寸');
      } else {
        // 不需要缩放：保持原始尺寸
        frontScaledWidth = frontImage.width;
        frontScaledHeight = frontImage.height;
        backScaledWidth = backImage.width;
        backScaledHeight = backImage.height;
        
        console.log('身份证图片保持原始尺寸，无需缩放');
      }
      
      // 计算居中位置
      const totalContentHeight = frontScaledHeight + backScaledHeight + imageSpacing;
      const contentStartY = pageHeight - margin - titleHeight - (availableHeight - totalContentHeight) / 2;
      
      const frontX = (pageWidth - frontScaledWidth) / 2; // 水平居中
      const frontY = contentStartY - frontScaledHeight; // 正面图片位置
      const backX = (pageWidth - backScaledWidth) / 2; // 水平居中
      const backY = frontY - imageSpacing - backScaledHeight; // 反面图片位置（在正面下方，留有间距）

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

      // 绘制正面图片
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

      // 绘制反面图片
      page.drawImage(backImage, {
        x: backX,
        y: backY,
        width: backScaledWidth,
        height: backScaledHeight,
      });

      // 生成PDF字节
      const pdfBytes = await pdfDoc.save();
      
      console.log(`PDF生成成功，大小: ${pdfBytes.length} bytes`);
      
      return Buffer.from(pdfBytes);
    } catch (error) {
      console.error('从buffer生成PDF失败:', error);
      throw new Error(`PDF生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
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