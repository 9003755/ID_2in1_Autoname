import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { asyncHandler } from '../middleware/validation';
import { getTempDir } from '../utils/fileUtils';
import { BatchResult, BatchSummary, IdCardInfo, PdfGenerationOptions } from '../../shared/types';
import { getBaiduOcrService, BaiduOcrService } from '../services/baiduOcr';
import { PdfService } from '../services/pdfService';

const router = express.Router();

// 配置multer用于处理文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
    files: 100 // 最多100个文件
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
}).any(); // 使用any()来接收任意字段名的文件

interface FolderFiles {
  folderName: string;
  files: Express.Multer.File[];
}

/**
 * POST /api/batch/process-files
 * 批量处理身份证文件（接收文件内容）
 */
router.post('/process-files', upload, asyncHandler(async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { outputDir, folderStructure } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请上传文件'
      });
    }

    // 解析文件夹结构
    let folderData: FolderFiles[] = [];
    
    console.log('🚀 开始处理批量文件请求');
    console.log('📄 接收到的所有文件:', files.map(f => ({
      originalname: f.originalname,
      fieldname: f.fieldname,
      size: f.size,
      mimetype: f.mimetype
    })));
    console.log('📁 接收到的文件夹结构:', folderStructure);
    
    // 详细调试文件名信息
    console.log('\n🔍 详细文件名分析:');
    files.forEach((file, index) => {
      console.log(`文件 ${index + 1}:`);
      console.log(`  - originalname: "${file.originalname}"`);
      console.log(`  - fieldname: "${file.fieldname}"`);
      console.log(`  - 包含斜杠(/): ${file.originalname.includes('/')}`);
      console.log(`  - 包含反斜杠(\\): ${file.originalname.includes('\\')}`);
      
      // 检查对应的文件夹信息字段
      const folderField = `${file.fieldname}_folder`;
      const filenameField = `${file.fieldname}_filename`;
      console.log(`  - 文件夹字段 (${folderField}): "${req.body[folderField] || 'undefined'}"`);
      console.log(`  - 文件名字段 (${filenameField}): "${req.body[filenameField] || 'undefined'}"`);
    });
    
    console.log('\n📋 所有body字段:');
    Object.keys(req.body).forEach(key => {
      console.log(`  - ${key}: "${req.body[key]}"`);
    });
    
    if (folderStructure) {
      try {
        const parsedStructure = JSON.parse(folderStructure);
        console.log('📁 解析后的文件夹结构:', JSON.stringify(parsedStructure, null, 2));
        
        folderData = parsedStructure.map((folder: { folderName: string; files: string[] }) => {
          console.log(`\n🔍 处理文件夹: "${folder.folderName}", 期望文件数量: ${folder.files.length}`);
          console.log('期望的文件列表:', folder.files);
          
          // 根据文件夹名称和文件名匹配实际的文件对象
          const matchedFiles = files.filter(file => {
            // 从对应的字段中获取文件夹信息
            const folderField = `${file.fieldname}_folder`;
            const filenameField = `${file.fieldname}_filename`;
            const extractedFolderName = req.body[folderField] || 'default';
            const extractedFileName = req.body[filenameField] || file.originalname;
            
            console.log(`  📋 检查文件: "${file.originalname}"`);
            console.log(`    - 字段名: "${file.fieldname}"`);
            console.log(`    - 提取的文件夹名: "${extractedFolderName}"`);
            console.log(`    - 提取的文件名: "${extractedFileName}"`);
            console.log(`    - 目标文件夹: "${folder.folderName}"`);
            
            // 文件夹名匹配检查（不区分大小写）
            const folderMatches = extractedFolderName.toLowerCase() === folder.folderName.toLowerCase();
            console.log(`    - 文件夹匹配: ${folderMatches}`);
            
            // 文件名匹配检查（不区分大小写）
            const fileMatches = folder.files.some(expectedFile => 
              expectedFile.toLowerCase() === extractedFileName.toLowerCase()
            );
            console.log(`    - 文件名匹配: ${fileMatches}`);
            
            const isMatch = folderMatches && fileMatches;
            console.log(`    - 最终匹配结果: ${isMatch}`);
            
            return isMatch;
          });
          
          console.log(`✅ 文件夹 "${folder.folderName}" 匹配到 ${matchedFiles.length} 个文件`);
          if (matchedFiles.length === 0) {
            console.log(`❌ 警告: 文件夹 "${folder.folderName}" 没有匹配到任何文件!`);
            console.log('可能的原因:');
            console.log('1. 文件名格式不匹配');
            console.log('2. 文件夹名称不匹配');
            console.log('3. 前端传递的文件结构与实际文件不符');
          }
          
          return {
            folderName: folder.folderName,
            files: matchedFiles
          };
        });
      } catch (error) {
        console.error('❌ 解析文件夹结构失败:', error);
        return res.status(400).json({
          success: false,
          error: '文件夹结构数据格式错误: ' + (error instanceof Error ? error.message : '未知错误')
        });
      }
    } else {
      console.log('📂 没有提供文件夹结构，按文件名自动分组');
      // 如果没有提供文件夹结构，按文件名分组
      const fileGroups = new Map<string, Express.Multer.File[]>();
      
      files.forEach(file => {
        // 从文件名中提取文件夹名
        let folderName = 'default';
        
        if (file.originalname.includes('/')) {
          // 格式: "folderName/fileName"
          folderName = file.originalname.split('/')[0];
        } else if (file.originalname.includes('\\')) {
          // 格式: "folderName\\fileName" (Windows路径)
          folderName = file.originalname.split('\\')[0];
        }
        
        console.log(`📁 文件 "${file.originalname}" 分组到文件夹: "${folderName}"`);
        
        if (!fileGroups.has(folderName)) {
          fileGroups.set(folderName, []);
        }
        fileGroups.get(folderName)!.push(file);
      });
      
      console.log(`📊 自动分组结果: 共 ${fileGroups.size} 个文件夹`);
      fileGroups.forEach((files, folderName) => {
        console.log(`  - 文件夹 "${folderName}": ${files.length} 个文件`);
      });
      
      folderData = Array.from(fileGroups.entries()).map(([folderName, files]) => ({
        folderName,
        files
      }));
    }
    
    console.log(`\n📋 最终处理的文件夹数据:`);
    folderData.forEach((folder, index) => {
      console.log(`${index + 1}. 文件夹: "${folder.folderName}", 文件数量: ${folder.files.length}`);
      folder.files.forEach((file, fileIndex) => {
        console.log(`   ${fileIndex + 1}. ${file.originalname} (${file.size} bytes)`);
      });
    });

    const results: BatchResult[] = [];
    const summary: BatchSummary = {
      total: folderData.length,
      success: 0,
      failed: 0,
      failedFolders: []
    };

    // 初始化服务
    const ocrService = await getBaiduOcrService();
    const pdfService = new PdfService();
    const defaultOutputDir = outputDir || getTempDir();

    // 确保输出目录存在
    if (!fs.existsSync(defaultOutputDir)) {
      fs.mkdirSync(defaultOutputDir, { recursive: true });
    }

    // 处理每个文件夹
    console.log(`\n🔄 开始处理 ${folderData.length} 个文件夹`);
    for (const folder of folderData) {
      try {
        console.log(`\n📁 处理文件夹: "${folder.folderName}"`);
        console.log(`📊 文件数量: ${folder.files.length}`);
        
        if (folder.files.length < 2) {
          console.log(`❌ 文件夹 "${folder.folderName}" 文件数量不足`);
          console.log(`   需要至少2张图片，当前只有${folder.files.length}张`);
          
          if (folder.files.length === 0) {
            console.log(`   可能原因: 文件匹配失败，没有找到任何匹配的文件`);
          } else {
            console.log(`   当前文件列表:`);
            folder.files.forEach((file, index) => {
              console.log(`     ${index + 1}. ${file.originalname}`);
            });
          }
          
          const errorResult: BatchResult = {
            folderPath: folder.folderName,
            success: false,
            errorMessage: `文件夹 "${folder.folderName}" 中的图片文件不足，需要至少2张图片，当前只有${folder.files.length}张。${folder.files.length === 0 ? '可能是文件匹配失败导致。' : ''}`
          };
          results.push(errorResult);
          summary.failed++;
          summary.failedFolders.push(folder.folderName);
          continue;
        }
        
        console.log(`✅ 文件夹 "${folder.folderName}" 文件数量充足，开始处理...`);
        folder.files.forEach((file, index) => {
          console.log(`   ${index + 1}. ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
        });

        // 处理文件夹中的图片
        const processResult = await processFolderFiles(
          folder.folderName,
          folder.files,
          defaultOutputDir,
          ocrService,
          pdfService
        );

        if (processResult.success) {
          // 构建可访问的PDF下载URL
          const pdfFileName = processResult.fileName;
          const pdfDownloadUrl = `/api/pdf/download/${encodeURIComponent(pdfFileName!)}`;
          
          const idCard: IdCardInfo = {
            id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            name: processResult.extractedName || '',
            idNumber: '',
            frontImagePath: processResult.frontImagePath || '',
            backImagePath: processResult.backImagePath || '',
            pdfPath: pdfDownloadUrl
          };
          const successResult: BatchResult = {
            folderPath: folder.folderName,
            success: true,
            idCard
          };
          results.push(successResult);
          summary.success++;
        } else {
          const errorResult: BatchResult = {
            folderPath: folder.folderName,
            success: false,
            errorMessage: processResult.error!
          };
          results.push(errorResult);
          summary.failed++;
          summary.failedFolders.push(folder.folderName);
        }

      } catch (error) {
        const errorResult: BatchResult = {
          folderPath: folder.folderName,
          success: false,
          errorMessage: error instanceof Error ? error.message : '未知错误'
        };
        results.push(errorResult);
        summary.failed++;
        summary.failedFolders.push(folder.folderName);
      }
    }

    res.json({
      success: true,
      message: `批处理完成，成功处理${summary.success}个文件夹，失败${summary.failed}个`,
      data: {
        results,
        summary
      }
    });

  } catch (error) {
    console.error('批处理失败:', error);
    
    // 根据错误类型返回不同的状态码和错误信息
    if (error instanceof Error) {
      if (error.message.includes('百度OCR配置缺失')) {
        res.status(503).json({ 
          success: false, 
          error: '服务配置错误：百度OCR配置缺失，请联系管理员',
          details: error.message
        });
      } else if (error.message.includes('识别失败')) {
        res.status(422).json({ 
          success: false, 
          error: '图片识别失败，请检查图片质量',
          details: error.message
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: '批量处理失败，请重试',
          details: error.message
        });
      }
    } else {
      res.status(500).json({ 
        success: false, 
        error: '未知错误，请重试'
      });
    }
  }
}));

/**
 * 处理单个文件夹中的身份证图片文件
 */
async function processFolderFiles(
  folderName: string,
  files: Express.Multer.File[],
  outputDir: string,
  ocrService: BaiduOcrService,
  pdfService: PdfService
): Promise<{
  success: boolean;
  fileName?: string;
  filePath?: string;
  extractedName?: string;
  frontImagePath?: string;
  backImagePath?: string;
  error?: string;
}> {
  try {
    console.log(`\n🔧 开始处理文件夹: "${folderName}"`);
    console.log(`📁 输出目录: ${outputDir}`);
    console.log(`📄 待处理文件数量: ${files.length}`);
    
    // 创建临时文件夹保存图片
    const tempFolderPath = path.join(getTempDir(), `batch_${Date.now()}_${folderName}`);
    console.log(`📂 临时文件夹: ${tempFolderPath}`);
    
    if (!fs.existsSync(tempFolderPath)) {
      fs.mkdirSync(tempFolderPath, { recursive: true });
      console.log(`✅ 创建临时文件夹成功`);
    }

    // 保存文件到临时目录
    const savedFiles: string[] = [];
    console.log(`💾 开始保存文件到临时目录...`);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // 更好的文件名提取逻辑
      let fileName = file.originalname;
      if (fileName.includes('/')) {
        fileName = fileName.split('/').pop() || `image_${i}.jpg`;
      } else if (fileName.includes('\\')) {
        fileName = fileName.split('\\').pop() || `image_${i}.jpg`;
      }
      
      const filePath = path.join(tempFolderPath, fileName);
      console.log(`  💾 保存文件: ${fileName} -> ${filePath}`);
      
      fs.writeFileSync(filePath, file.buffer);
      savedFiles.push(filePath);
      console.log(`  ✅ 文件保存成功: ${fileName} (${file.buffer.length} bytes)`);
    }
    
    console.log(`✅ 所有文件保存完成，共 ${savedFiles.length} 个文件`);

    // 智能识别身份证正反面
    console.log(`\n🔍 开始智能识别身份证正反面...`);
    let frontImagePath = '';
    let backImagePath = '';
    let extractedName = '';
    let idCardInfo: IdCardInfo | undefined;

    // 存储每张图片的识别结果
    interface ImageRecognitionResult {
      imagePath: string;
      frontScore: number;
      backScore: number;
      frontInfo?: any;
      backInfo?: any;
      recommendedType: 'front' | 'back' | 'unknown';
    }

    const recognitionResults: ImageRecognitionResult[] = [];

    // 对每张图片进行智能识别
    for (let i = 0; i < savedFiles.length; i++) {
      const imagePath = savedFiles[i];
      try {
        console.log(`🔍 智能识别图片 ${i + 1}/${savedFiles.length}: ${path.basename(imagePath)}`);
        const imageBuffer = fs.readFileSync(imagePath);
        console.log(`📄 图片大小: ${imageBuffer.length} bytes`);
        
        // 使用智能识别方法
        console.log(`🤖 调用智能识别服务...`);
        const smartResult = await ocrService.smartRecognizeIdCard(imageBuffer);
        
        recognitionResults.push({
          imagePath,
          frontScore: smartResult.frontScore,
          backScore: smartResult.backScore,
          frontInfo: smartResult.frontInfo,
          backInfo: smartResult.backInfo,
          recommendedType: smartResult.recommendedSide
        });
        
        console.log(`📊 识别结果: ${path.basename(imagePath)}`);
         console.log(`  - 正面评分: ${smartResult.frontScore}`);
         console.log(`  - 反面评分: ${smartResult.backScore}`);
         console.log(`  - 推荐类型: ${smartResult.recommendedSide}`);
         if (smartResult.frontInfo && smartResult.frontInfo.name) {
           console.log(`  - 识别到姓名: "${smartResult.frontInfo.name}"`);
         }
         if (smartResult.backInfo && smartResult.backInfo.issueAuthority) {
           console.log(`  - 识别到签发机关: "${smartResult.backInfo.issueAuthority}"`);
         }
         if (smartResult.backInfo && smartResult.backInfo.keywordDetection) {
           console.log(`  - 关键字段检测: ${smartResult.backInfo.keywordDetection.detected ? '✅ 检测到' : '❌ 未检测到'}`);
           if (smartResult.backInfo.keywordDetection.detected && smartResult.backInfo.keywordDetection.keywords.length > 0) {
             console.log(`  - 检测到的关键词: ${smartResult.backInfo.keywordDetection.keywords.join(', ')}`);
           }
         }
        
      } catch (error) {
        console.warn(`❌ 智能识别失败: ${path.basename(imagePath)}`, error instanceof Error ? error.message : error);
        // 添加默认结果
        recognitionResults.push({
          imagePath,
          frontScore: 0,
          backScore: 0,
          recommendedType: 'unknown'
        });
      }
    }

    // 分析识别结果，选择最佳的正面和反面图片
    console.log(`\n📊 分析识别结果...`);
    
    // 找到最佳正面图片
    const frontCandidates = recognitionResults
      .filter(result => result.recommendedType === 'front' || result.frontScore > 0)
      .sort((a, b) => b.frontScore - a.frontScore);
    
    // 找到最佳反面图片
    const backCandidates = recognitionResults
      .filter(result => result.recommendedType === 'back' || result.backScore > 0)
      .sort((a, b) => b.backScore - a.backScore);
    
    console.log(`📋 正面候选图片数量: ${frontCandidates.length}`);
     frontCandidates.forEach((candidate, index) => {
       console.log(`  ${index + 1}. ${path.basename(candidate.imagePath)} (评分: ${candidate.frontScore})`);
     });
     
     console.log(`📋 反面候选图片数量: ${backCandidates.length}`);
     backCandidates.forEach((candidate, index) => {
       console.log(`  ${index + 1}. ${path.basename(candidate.imagePath)} (评分: ${candidate.backScore})`);
     });
    
    // 选择正面图片和提取姓名
    if (frontCandidates.length > 0) {
      const bestFront = frontCandidates[0];
      frontImagePath = bestFront.imagePath;
      if (bestFront.frontInfo && bestFront.frontInfo.name) {
        extractedName = bestFront.frontInfo.name;
        idCardInfo = bestFront.frontInfo;
      }
      console.log(`✅ 选择正面图片: ${path.basename(frontImagePath)} (评分: ${bestFront.frontScore})`);
      if (extractedName) {
        console.log(`✅ 提取姓名: "${extractedName}"`);
      }
    }
    
    // 选择反面图片
    if (backCandidates.length > 0) {
      const bestBack = backCandidates[0];
      // 确保反面图片不是正面图片
      if (bestBack.imagePath !== frontImagePath) {
        backImagePath = bestBack.imagePath;
        console.log(`✅ 选择反面图片: ${path.basename(backImagePath)} (评分: ${bestBack.backScore})`);
      } else {
        // 如果最佳反面就是正面，选择第二个候选
        const secondBest = backCandidates.find(candidate => candidate.imagePath !== frontImagePath);
        if (secondBest) {
          backImagePath = secondBest.imagePath;
          console.log(`✅ 选择反面图片: ${path.basename(backImagePath)} (评分: ${secondBest.backScore}, 第二候选)`);
        }
      }
    }
    
    // 如果没有找到合适的正面图片，使用传统方法
    if (!frontImagePath) {
      console.log(`⚠️ 智能识别未找到明确的正面图片，使用传统方法...`);
      frontImagePath = savedFiles[0];
      extractedName = folderName;
      console.log(`📸 使用第一张图片作为正面: ${path.basename(frontImagePath)}`);
      console.log(`📝 使用文件夹名称作为姓名: "${extractedName}"`);
    }
    
    // 如果没有找到合适的反面图片，选择剩余图片
    if (!backImagePath) {
      const remainingImages = savedFiles.filter(img => img !== frontImagePath);
      if (remainingImages.length > 0) {
        backImagePath = remainingImages[0];
        console.log(`⚠️ 智能识别未找到明确的反面图片，使用剩余图片: ${path.basename(backImagePath)}`);
      }
    }
    
    // 如果仍然没有姓名，使用文件夹名称
    if (!extractedName) {
      extractedName = folderName;
      console.log(`📝 使用文件夹名称作为姓名: "${extractedName}"`);
    }

    // 验证是否有足够的图片生成PDF
    if (!backImagePath) {
      console.log(`❌ 错误: 未找到合适的反面图片`);
      return {
        success: false,
        error: `文件夹 "${folderName}" 中未找到合适的身份证反面图片。请确保文件夹中包含清晰的身份证正面和反面图片。`
      };
    }
    
    console.log(`\n📋 最终选择结果:`);
    console.log(`📸 正面图片: ${path.basename(frontImagePath)}`);
    console.log(`📸 反面图片: ${path.basename(backImagePath)}`);
    console.log(`👤 提取姓名: "${extractedName}"`);

    // 生成PDF
    console.log(`\n📄 开始生成PDF文件...`);
    const pdfOptions: PdfGenerationOptions = {
      frontImagePath,
      backImagePath,
      name: extractedName,
      outputDir,
      idCardInfo
    };
    console.log(`📝 PDF生成选项:`, {
      frontImagePath: path.basename(frontImagePath),
      backImagePath: path.basename(backImagePath),
      name: extractedName,
      outputDir
    });

    console.log(`🔧 调用PDF服务生成文件...`);
    const pdfResult = await pdfService.generateIdCardPdf(pdfOptions);
    
    if (pdfResult.success) {
      console.log(`✅ PDF文件生成成功!`);
      console.log(`📄 文件名: ${pdfResult.fileName}`);
      console.log(`📁 文件路径: ${pdfResult.filePath}`);
    } else {
      console.error(`❌ PDF生成失败:`, pdfResult.error);
    }

    // 清理临时文件
    console.log(`🧹 清理临时文件夹: ${tempFolderPath}`);
    try {
      for (const filePath of savedFiles) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      if (fs.existsSync(tempFolderPath)) {
        fs.rmdirSync(tempFolderPath);
      }
      console.log(`✅ 临时文件清理完成`);
    } catch (cleanupError) {
      console.warn('⚠️ 清理临时文件失败:', cleanupError);
    }

    if (pdfResult.success) {
      console.log(`🎉 文件夹 "${folderName}" 处理完成!`);
      console.log(`📄 生成的PDF: ${pdfResult.fileName}`);
      console.log(`👤 识别的姓名: ${extractedName}`);
      
      return {
        success: true,
        fileName: pdfResult.fileName,
        filePath: pdfResult.filePath,
        extractedName,
        frontImagePath,
        backImagePath
      };
    } else {
      return {
        success: false,
        error: pdfResult.error || 'PDF生成失败'
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '处理失败'
    };
  }
}

export default router;