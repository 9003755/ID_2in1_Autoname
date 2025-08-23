import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM模式下获取__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 确保目录存在
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath);
}

/**
 * 确保目录存在（同步版本）
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 检查文件是否为图片
 */
export function isImageFile(filename: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];
  const ext = path.extname(filename).toLowerCase();
  return imageExtensions.includes(ext);
}

/**
 * 获取文件夹中的所有图片文件
 */
export async function getImageFiles(folderPath: string): Promise<string[]> {
  try {
    const files = await fs.readdir(folderPath);
    return files.filter(isImageFile);
  } catch (error) {
    console.error('读取文件夹失败:', error);
    return [];
  }
}

/**
 * 生成唯一的文件名
 */
export function generateUniqueFileName(baseName: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${baseName}_${timestamp}_${random}${extension}`;
}

/**
 * 获取临时目录路径
 */
export function getTempDir(): string {
  const tempDir = path.join(process.cwd(), 'temp');
  return tempDir;
}

/**
 * 获取上传目录路径
 */
export function getUploadDir(): string {
  const uploadDir = path.join(getTempDir(), 'uploads');
  return uploadDir;
}

/**
 * 获取处理后文件目录路径
 */
export function getProcessedDir(): string {
  const processedDir = path.join(getTempDir(), 'processed');
  return processedDir;
}

/**
 * 清理临时文件
 */
export async function cleanupTempFiles(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const tempDir = getTempDir();
    const exists = await fs.pathExists(tempDir);
    if (!exists) return;

    const files = await fs.readdir(tempDir, { withFileTypes: true });
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(tempDir, file.name);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtime.getTime();

      if (age > maxAge) {
        if (file.isDirectory()) {
          await fs.remove(filePath);
        } else {
          await fs.unlink(filePath);
        }
        console.log(`清理临时文件: ${filePath}`);
      }
    }
  } catch (error) {
    console.error('清理临时文件失败:', error);
  }
}

/**
 * 初始化必要的目录
 */
export async function initDirectories(): Promise<void> {
  await ensureDir(getTempDir());
  await ensureDir(getUploadDir());
  await ensureDir(getProcessedDir());
  await ensureDir(path.join(getTempDir(), 'logs'));
}

/**
 * 验证文件路径是否安全（防止路径遍历攻击）
 */
export function isPathSafe(filePath: string, baseDir: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedBaseDir = path.resolve(baseDir);
  return resolvedPath.startsWith(resolvedBaseDir);
}