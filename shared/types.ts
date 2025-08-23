// 身份证信息接口
export interface IdCardInfo {
  id: string;
  name: string;
  idNumber: string;
  gender?: string;
  nation?: string;
  birthday?: string;
  address?: string;
  issueAuthority?: string;
  validPeriod?: string;
  frontImagePath: string;
  backImagePath: string;
  pdfPath?: string;
}

// 处理任务接口
export interface ProcessingTask {
  id: string;
  type: 'single' | 'batch';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  idCards: IdCardInfo[];
}

// 批处理结果接口
export interface BatchResult {
  folderPath: string;
  success: boolean;
  errorMessage?: string;
  idCard?: IdCardInfo;
}

// 批处理统计接口
export interface BatchSummary {
  total: number;
  success: number;
  failed: number;
  failedFolders: string[];
}

// OCR识别请求接口
export interface OcrRequest {
  image: File;
  type: 'front' | 'back';
}

// OCR识别响应接口
export interface OcrResponse {
  success: boolean;
  name?: string;
  idNumber?: string;
  gender?: string;
  nation?: string;
  birthday?: string;
  address?: string;
  issueAuthority?: string;
  validPeriod?: string;
  error?: string;
}

// PDF生成请求接口
export interface PdfGenerateRequest {
  frontImage: File;
  backImage: File;
  name: string;
  outputPath: string;
}

// PDF生成响应接口
export interface PdfGenerateResponse {
  success: boolean;
  filePath?: string;
  error?: string;
}

// PDF生成选项接口
export interface PdfGenerationOptions {
  frontImagePath: string;
  backImagePath: string;
  name: string;
  outputDir: string;
  idCardInfo?: IdCardInfo;
}

// 批处理请求接口
export interface BatchProcessRequest {
  folders: string[];
}

// 批处理响应接口
export interface BatchProcessResponse {
  success: boolean;
  results: BatchResult[];
  summary: BatchSummary;
}

// 文件上传接口
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

// 应用状态接口
export interface AppState {
  currentMode: 'single' | 'batch';
  isProcessing: boolean;
  progress: number;
  currentTask?: ProcessingTask;
}

// 单个处理模式状态
export interface SingleModeState {
  frontImage?: File;
  backImage?: File;
  outputPath?: string;
  recognizedName?: string;
  isRecognizing: boolean;
}

// 批处理模式状态
export interface BatchModeState {
  selectedFolders: string[];
  isProcessing: boolean;
  progress: number;
  results?: BatchResult[];
  summary?: BatchSummary;
}

// API错误响应接口
export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

// 通用API响应接口
export type ApiResponse<T> = T | ApiError;

// 文件选择选项
export interface FileSelectOptions {
  accept?: string;
  multiple?: boolean;
}

// 进度信息接口
export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
  percentage: number;
}