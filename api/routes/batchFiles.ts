import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { asyncHandler } from '../middleware/validation';
import { getTempDir } from '../utils/fileUtils';
import { BatchResult, BatchSummary, IdCardInfo, PdfGenerationOptions } from '../../shared/types';
import { getBaiduOcrService, BaiduOcrService } from '../services/baiduOcr.js';
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
          const idCard: IdCardInfo = {
            id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            name: processResult.extractedName || '',
            idNumber: '',
            frontImagePath: processResult.frontImagePath || '',
            backImagePath: processResult.backImagePath || '',
            pdfPath: processResult.filePath
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
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器内部错误'
    });
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

    // 尝试识别身份证正面信息
    console.log(`\n🔍 开始OCR识别身份证信息...`);
    let frontImagePath = '';
    let backImagePath = '';
    let extractedName = '';
    let idCardInfo: IdCardInfo | undefined;

    // 尝试从图片中识别身份证信息
    for (let i = 0; i < savedFiles.length; i++) {
      const imagePath = savedFiles[i];
      try {
        console.log(`🔍 尝试识别图片 ${i + 1}/${savedFiles.length}: ${path.basename(imagePath)}`);
        const imageBuffer = fs.readFileSync(imagePath);
        console.log(`📄 图片大小: ${imageBuffer.length} bytes`);
        
        // 尝试识别为身份证正面
        console.log(`🤖 调用OCR服务识别身份证正面...`);
        const frontResult = await ocrService.recognizeIdCardFront(imageBuffer);
        console.log(`📋 OCR识别结果:`, {
          name: frontResult.name,
          hasName: !!frontResult.name
        });
        
        if (frontResult.name) {
          frontImagePath = imagePath;
          extractedName = frontResult.name;
          idCardInfo = frontResult;
          console.log(`✅ 成功识别到姓名: "${extractedName}"`);
          console.log(`📸 正面图片: ${path.basename(frontImagePath)}`);
          break;
        } else {
          console.log(`⚠️ 未识别到姓名，继续尝试下一张图片`);
        }
      } catch (error) {
        // 继续尝试下一张图片
        console.warn(`❌ 识别图片失败: ${path.basename(imagePath)}`, error instanceof Error ? error.message : error);
      }
    }

    // 如果没有识别到姓名，使用文件夹名称
    if (!extractedName) {
      console.log(`⚠️ 所有图片都未能识别到姓名，使用文件夹名称作为姓名`);
      extractedName = folderName;
      frontImagePath = savedFiles[0];
      console.log(`📝 使用姓名: "${extractedName}"`);
      console.log(`📸 使用正面图片: ${path.basename(frontImagePath)}`);
    }

    // 验证并选择身份证反面图片
    console.log(`\n🔍 开始验证身份证反面图片...`);
    let validBackImagePath = '';
    
    // 遍历所有非正面图片，验证是否为有效的身份证反面
    const candidateBackImages = savedFiles.filter(img => img !== frontImagePath);
    console.log(`📋 候选反面图片数量: ${candidateBackImages.length}`);
    
    for (let i = 0; i < candidateBackImages.length; i++) {
      const candidateImage = candidateBackImages[i];
      try {
        console.log(`🔍 验证候选反面图片 ${i + 1}/${candidateBackImages.length}: ${path.basename(candidateImage)}`);
        const imageBuffer = fs.readFileSync(candidateImage);
        console.log(`📄 图片大小: ${imageBuffer.length} bytes`);
        
        // 尝试识别为身份证反面
        console.log(`🤖 调用OCR服务识别身份证反面...`);
        const backResult = await ocrService.recognizeIdCardBack(imageBuffer);
        console.log(`📋 反面OCR识别结果:`, {
          issueAuthority: backResult.issueAuthority,
          validPeriod: backResult.validPeriod,
          hasIssueAuthority: !!backResult.issueAuthority
        });
        
        // 验证是否包含身份证反面的关键信息（签发机关）
        if (backResult.issueAuthority && backResult.issueAuthority.trim().length > 0) {
          validBackImagePath = candidateImage;
          console.log(`✅ 找到有效的身份证反面图片: ${path.basename(validBackImagePath)}`);
          console.log(`🏛️ 签发机关: "${backResult.issueAuthority}"`);
          if (backResult.validPeriod) {
            console.log(`📅 有效期限: "${backResult.validPeriod}"`);
          }
          break;
        } else {
          console.log(`❌ 图片不是有效的身份证反面，未识别到签发机关`);
        }
      } catch (error) {
        console.warn(`❌ 验证反面图片失败: ${path.basename(candidateImage)}`, error instanceof Error ? error.message : error);
      }
    }
    
    // 如果没有找到有效的反面图片，使用备选方案
    if (!validBackImagePath) {
      console.log(`⚠️ 未找到有效的身份证反面图片`);
      
      // 检查是否有候选图片可用
      if (candidateBackImages.length === 0) {
        console.log(`❌ 错误: 文件夹中只有一张图片，无法生成完整的身份证PDF`);
        return {
          success: false,
          error: `文件夹 "${folderName}" 中只有一张图片，无法生成完整的身份证PDF。请确保文件夹中包含身份证正面和反面图片。`
        };
      }
      
      // 记录详细的验证失败信息
      console.log(`📊 验证失败统计:`);
      console.log(`  - 总图片数量: ${savedFiles.length}`);
      console.log(`  - 正面图片: ${path.basename(frontImagePath)}`);
      console.log(`  - 候选反面图片数量: ${candidateBackImages.length}`);
      candidateBackImages.forEach((img, index) => {
        console.log(`    ${index + 1}. ${path.basename(img)} (验证失败)`);
      });
      
      // 使用宽松模式：选择第一张候选图片作为反面
      validBackImagePath = candidateBackImages[0];
      console.log(`📸 使用宽松模式: 选择第一张候选图片作为反面: ${path.basename(validBackImagePath)}`);
      console.log(`⚠️ 重要警告: 该图片未通过身份证反面验证，可能不是真正的身份证反面`);
      console.log(`⚠️ 建议: 请检查生成的PDF，确认反面图片是否正确`);
    }
    
    backImagePath = validBackImagePath;
    console.log(`📸 最终选择的反面图片: ${path.basename(backImagePath)}`);

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