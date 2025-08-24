import React, { useState } from 'react';
import { Card, Button, Input, Space, Typography, Table, Progress, message, Tag, Divider } from 'antd';
import { FolderOpenOutlined, PlayCircleOutlined, DeleteOutlined, FileTextOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { BatchResult, BatchSummary } from '../../shared/types';
import JSZip from 'jszip';

// FileSystem API 类型声明
declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<any>;
  }
}

const { Title, Text } = Typography;
const { TextArea } = Input;

interface FolderItem {
  id: string;
  name: string;
  handle?: FileSystemDirectoryHandle;
  files: File[];
  status: 'pending' | 'processing' | 'success' | 'error';
  result?: BatchResult;
}

interface ProcessingState {
  isProcessing: boolean;
  currentFolder: string;
  progress: number;
  processedCount: number;
  totalCount: number;
}

export default function BatchProcessMode() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [folderInput, setFolderInput] = useState<string>('');
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    currentFolder: '',
    progress: 0,
    processedCount: 0,
    totalCount: 0
  });
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [pdfFiles, setPdfFiles] = useState<Array<{name: string, data: Blob}>>([]);

  // 读取文件夹中的所有图片文件
  const readFolderFiles = async (dirHandle: FileSystemDirectoryHandle): Promise<File[]> => {
    const files: File[] = [];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];
    
    console.log(`开始读取文件夹: ${dirHandle.name}`);
    console.log('支持的图片扩展名:', imageExtensions);
    
    try {
      // 检查 FileSystemDirectoryHandle API 是否可用
      if (!dirHandle || typeof (dirHandle as any).entries !== 'function') {
        throw new Error('FileSystemDirectoryHandle API 不可用或不支持');
      }
      
      let totalEntries = 0;
      let fileEntries = 0;
      let imageFiles = 0;
      
      // 使用正确的迭代方法
      for await (const [name, handle] of (dirHandle as any).entries()) {
        totalEntries++;
        console.log(`发现条目 ${totalEntries}: ${name}, 类型: ${handle.kind}`);
        
        if (handle.kind === 'file') {
          fileEntries++;
          const dotIndex = name.lastIndexOf('.');
          if (dotIndex === -1) {
            console.log(`文件 "${name}" 没有扩展名，跳过`);
            continue;
          }
          const fileExtension = name.toLowerCase().substring(dotIndex);
          console.log(`文件 "${name}" 的扩展名: "${fileExtension}"`);
          
          // 忽略大小写比较扩展名
          if (imageExtensions.some(ext => ext.toLowerCase() === fileExtension.toLowerCase())) {
            imageFiles++;
            console.log(`✓ 识别为图片文件: ${name}`);
            try {
              const fileHandle = handle as FileSystemFileHandle;
              const file = await fileHandle.getFile();
              console.log(`✓ 成功读取文件: ${file.name}, 大小: ${file.size} bytes, 类型: ${file.type}`);
              files.push(file);
            } catch (fileError) {
              console.error(`✗ 读取文件失败: ${name}`, fileError);
            }
          } else {
            console.log(`✗ 跳过非图片文件: ${name}`);
          }
        } else {
          console.log(`跳过目录: ${name}`);
        }
      }
      
      console.log(`文件夹读取完成:`);
      console.log(`- 总条目数: ${totalEntries}`);
      console.log(`- 文件数: ${fileEntries}`);
      console.log(`- 图片文件数: ${imageFiles}`);
      console.log(`- 成功读取的文件数: ${files.length}`);
      
      if (files.length === 0 && fileEntries > 0) {
        console.warn('警告: 文件夹中有文件但没有识别到图片文件，请检查文件扩展名');
      }
      
    } catch (error) {
      console.error('读取文件夹失败:', error);
      console.error('错误详情:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
    
    return files;
  };

  // ZIP打包下载功能
  const downloadZipFile = async () => {
    if (pdfFiles.length === 0) {
      message.error('没有可下载的PDF文件');
      return;
    }

    try {
      const zip = new JSZip();
      
      // 将所有PDF文件添加到ZIP中
      pdfFiles.forEach(pdfFile => {
        zip.file(pdfFile.name, pdfFile.data);
      });
      
      // 生成ZIP文件
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // 创建下载链接
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      
      // 生成带时间戳的文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `身份证批量处理结果_${timestamp}.zip`;
      
      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 清理URL对象
      URL.revokeObjectURL(url);
      
      message.success('ZIP文件下载成功！');
    } catch (error) {
      console.error('ZIP打包失败:', error);
      message.error('ZIP打包失败，请重试');
    }
  };

  // 添加文件夹
  const addFolder = () => {
    if (!folderInput.trim()) {
      message.warning('请输入文件夹名称');
      return;
    }

    const newFolder: FolderItem = {
      id: Date.now().toString(),
      name: folderInput.trim(),
      files: [],
      status: 'pending'
    };

    setFolders(prev => [...prev, newFolder]);
    setFolderInput('');
    message.success('文件夹已添加');
  };

  // 选择单个文件夹
  const selectFolder = async () => {
    try {
      // 检查浏览器是否支持File System Access API
      if ('showDirectoryPicker' in window) {
        setIsLoadingFiles(true);
        const dirHandle = await window.showDirectoryPicker();
        
        try {
          console.log(`准备读取文件夹: ${dirHandle.name}`);
          const files = await readFolderFiles(dirHandle);
          
          console.log(`文件夹 "${dirHandle.name}" 读取结果: ${files.length} 个文件`);
          
          if (files.length === 0) {
            console.warn(`文件夹 "${dirHandle.name}" 中没有找到图片文件`);
            message.warning(`文件夹 "${dirHandle.name}" 中没有找到图片文件`);
            return;
          }
          
          const newFolder: FolderItem = {
            id: Date.now().toString(),
            name: dirHandle.name,
            handle: dirHandle,
            files: files,
            status: 'pending'
          };
          
          setFolders(prev => [...prev, newFolder]);
          message.success(`已添加文件夹 "${dirHandle.name}"，包含 ${files.length} 个图片文件`);
        } catch (error) {
          console.error('读取文件夹内容失败:', error);
          console.error('错误详情:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          });
          message.error(`读取文件夹内容失败: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          setIsLoadingFiles(false);
        }
      } else {
        // 降级到传统的文件选择方式
        selectMultipleFoldersLegacy();
      }
    } catch (error) {
      setIsLoadingFiles(false);
      console.error('选择文件夹失败:', error);
      if (error instanceof Error && error.name === 'AbortError') {
        // 用户取消选择，显示友好提示
        message.info('已取消文件夹选择');
        return;
      }
      message.error(`选择文件夹失败: ${error instanceof Error ? error.message : '请重试'}`);
    }
  };

  // 降级方案：使用webkitdirectory选择文件夹
  const selectMultipleFoldersLegacy = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;
      
      input.onchange = (e) => {
        const fileList = (e.target as HTMLInputElement).files;
        if (fileList && fileList.length > 0) {
          setIsLoadingFiles(true);
          
          // 按文件夹分组文件
          const folderMap = new Map<string, File[]>();
          
          for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const pathParts = file.webkitRelativePath.split('/');
            if (pathParts.length > 1) {
              const folderName = pathParts[0];
              const dotIndex = file.name.lastIndexOf('.');
              if (dotIndex === -1) {
                continue; // 跳过没有扩展名的文件
              }
              const fileExtension = file.name.toLowerCase().substring(dotIndex);
              const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];
              
              if (imageExtensions.includes(fileExtension)) {
                if (!folderMap.has(folderName)) {
                  folderMap.set(folderName, []);
                }
                folderMap.get(folderName)!.push(file);
              }
            }
          }
          
          // 创建文件夹项
          const newFolders: FolderItem[] = Array.from(folderMap.entries())
            .filter(([_, files]) => files.length > 0)
            .map(([name, files]) => ({
              id: `${Date.now()}-${Math.random()}`,
              name,
              files,
              status: 'pending' as const
            }));
          
          setFolders(prev => [...prev, ...newFolders]);
          setIsLoadingFiles(false);
          
          if (newFolders.length > 0) {
            const totalFiles = newFolders.reduce((sum, folder) => sum + folder.files.length, 0);
            message.success(`已添加 ${newFolders.length} 个文件夹，共 ${totalFiles} 个图片文件`);
          } else {
            message.warning('所选文件夹中没有找到图片文件');
          }
        }
      };
      
      input.click();
    } catch (error) {
      setIsLoadingFiles(false);
      console.error('选择文件夹失败:', error);
      message.error('选择文件夹失败');
    }
  };

  // 删除文件夹
  const removeFolder = (id: string) => {
    setFolders(prev => prev.filter(folder => folder.id !== id));
  };

  // 重置所有状态
  const resetAll = () => {
    // 清理所有状态
    setFolders([]);
    setFolderInput('');
    setBatchSummary(null);
    setPdfFiles([]);
    setProcessing({
      isProcessing: false,
      currentFolder: '',
      progress: 0,
      processedCount: 0,
      totalCount: 0
    });
    setIsLoadingFiles(false);
    
    // 清理文件输入元素的值，确保可以重新选择相同文件
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
      (input as HTMLInputElement).value = '';
    });
    
    // 强制重新渲染
    setTimeout(() => {
      message.success('已重置，可以重新开始');
    }, 100);
  };



  // 批量处理
  const startBatchProcess = async () => {
    if (folders.length === 0) {
      message.error('请添加要处理的文件夹');
      return;
    }

    // 检查是否有文件夹没有文件
    const emptyFolders = folders.filter(folder => folder.files.length === 0);
    if (emptyFolders.length > 0) {
      message.error(`以下文件夹没有图片文件：${emptyFolders.map(f => f.name).join(', ')}`);
      return;
    }

    try {
      setProcessing({
        isProcessing: true,
        currentFolder: '',
        progress: 0,
        processedCount: 0,
        totalCount: folders.length
      });

      // 重置文件夹状态
      setFolders(prev => prev.map(folder => ({ ...folder, status: 'pending' as const })));
      setBatchSummary(null);
      setPdfFiles([]);

      setProcessing(prev => ({ ...prev, currentFolder: '正在准备文件...' }));

      // 创建FormData
      const formData = new FormData();
      
      // 添加输出路径
      
      
      // 创建文件夹结构信息（匹配后端期望的FolderFiles[]格式）
      const folderStructure: Array<{ folderName: string; files: string[] }> = [];
      
      // 添加所有文件到FormData
      folders.forEach((folder, folderIndex) => {
        const fileNames: string[] = [];
        
        folder.files.forEach((file, fileIndex) => {
          // 使用包含文件夹索引和文件索引的字段名
          const fieldName = `folder_${folderIndex}_file_${fileIndex}`;
          formData.append(fieldName, file, `${folder.name}/${file.name}`);
          fileNames.push(file.name);
          
          // 同时添加文件夹信息作为单独的字段
          formData.append(`${fieldName}_folder`, folder.name);
          formData.append(`${fieldName}_filename`, file.name);
        });
        
        folderStructure.push({
          folderName: folder.name,
          files: fileNames
        });
      });
      
      // 添加文件夹结构信息
      formData.append('folderStructure', JSON.stringify(folderStructure));
      
      setProcessing(prev => ({ ...prev, currentFolder: '正在上传文件...' }));

      const response = await fetch('/api/batch/process-files', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (!response.ok) {
        // 处理HTTP错误状态码
        throw new Error(result.error || result.details || `服务器错误 (${response.status})`);
      }
      
      if (result.success) {
        const { results, summary } = result.data;
        
        // 收集成功生成的PDF文件
        const generatedPdfs: Array<{name: string, data: Blob}> = [];
        
        console.log('开始收集PDF文件，批量处理结果:', results);
        console.log('成功的结果数量:', results.filter((r: any) => r.success).length);
        
        for (const batchResult of results) {
          console.log('处理批量结果:', {
            success: batchResult.success,
            hasIdCard: !!batchResult.idCard,
            pdfPath: batchResult.idCard?.pdfPath,
            folderPath: batchResult.folderPath
          });
          
          if (batchResult.success && batchResult.idCard && batchResult.idCard.pdfPath) {
            try {
              console.log(`正在获取PDF文件: ${batchResult.idCard.pdfPath}`);
              // 从服务器获取PDF文件
              const pdfResponse = await fetch(batchResult.idCard.pdfPath);
              console.log(`PDF响应状态: ${pdfResponse.status}`);
              
              if (pdfResponse.ok) {
                const pdfBlob = await pdfResponse.blob();
                // 使用后端返回的实际文件名，而不是文件夹名
                const actualFileName = batchResult.idCard.fileName || `${batchResult.idCard.name}身份证.pdf`;
                console.log(`成功获取PDF文件: ${actualFileName}, 大小: ${pdfBlob.size} bytes`);
                generatedPdfs.push({
                  name: actualFileName,
                  data: pdfBlob
                });
              } else {
                console.error(`PDF文件响应失败: ${pdfResponse.status} ${pdfResponse.statusText}`);
              }
            } catch (error) {
              console.error(`获取PDF文件失败: ${batchResult.folderPath}`, error);
            }
          } else {
            console.log('跳过此结果，原因:', {
              success: batchResult.success,
              hasIdCard: !!batchResult.idCard,
              hasPdfPath: !!(batchResult.idCard?.pdfPath)
            });
          }
        }
        
        console.log(`收集到的PDF文件数量: ${generatedPdfs.length}`);
        console.log('PDF文件列表:', generatedPdfs.map(pdf => ({ name: pdf.name, size: pdf.data.size })));
        
        setPdfFiles(generatedPdfs);
        
        // 立即检查状态更新
        setTimeout(() => {
          console.log('状态更新后的pdfFiles长度:', generatedPdfs.length);
        }, 100);
        
        // 更新文件夹状态和结果
        setFolders(prev => prev.map(folder => {
          const batchResult = results.find((r: BatchResult) => r.folderPath === folder.name);
          return {
            ...folder,
            status: batchResult?.success ? 'success' as const : 'error' as const,
            result: batchResult
          };
        }));

        setBatchSummary(summary);
        
        setProcessing({
          isProcessing: false,
          currentFolder: '',
          progress: 100,
          processedCount: summary.total,
          totalCount: summary.total
        });

        message.success(`批处理完成！成功：${summary.success}个，失败：${summary.failed}个`);
      } else {
        throw new Error(result.error || '批处理失败');
      }
    } catch (error) {
      console.error('批处理失败:', error);
      
      let errorMessage = '批处理失败';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      // 如果是网络错误，尝试解析响应中的错误信息
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = '网络连接失败，请检查服务器是否正常运行';
      }
      
      message.error(errorMessage);
      setProcessing({
        isProcessing: false,
        currentFolder: '',
        progress: 0,
        processedCount: 0,
        totalCount: 0
      });
    }
  };

  // 表格列定义
  const columns: ColumnsType<FolderItem> = [
    {
      title: '文件夹名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record) => (
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-xs text-gray-500">
            {record.files.length} 个图片文件
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusConfig = {
          pending: { color: 'default', text: '待处理' },
          processing: { color: 'processing', text: '处理中' },
          success: { color: 'success', text: '成功' },
          error: { color: 'error', text: '失败' }
        };
        const config = statusConfig[status as keyof typeof statusConfig];
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '结果',
      key: 'result',
      width: 200,
      render: (_, record) => {
        if (!record.result) return '-';
        
        if (record.result.success && record.result.idCard) {
          return (
            <div>
              <div className="text-sm font-medium">{record.result.idCard.name}</div>
              <div className="text-xs text-gray-500 truncate">
                {record.result.idCard.pdfPath}
              </div>
            </div>
          );
        } else {
          return (
            <div className="text-red-500 text-sm">
              {record.result.errorMessage}
            </div>
          );
        }
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeFolder(record.id)}
          disabled={processing.isProcessing}
        />
      )
    }
  ];

  return (
    <Card title="批量处理模式" className="shadow-sm">
      <Space direction="vertical" size="large" className="w-full">
        {/* 使用说明 */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <Title level={5} className="text-blue-800 mb-2">使用说明：</Title>
          <ul className="text-sm text-blue-700 space-y-1 mb-0">
            <li>• 点击"添加文件夹"选择包含身份证图片的文件夹，可以逐一添加多个文件夹</li>
            <li>• 每个文件夹必须包含同一人的身份证正反面图片，否则会出错</li>
            <li>• 点击"开始批量处理"按钮开始处理所有文件夹</li>
            <li>• 处理完成后，点击"下载ZIP压缩包"按钮下载所有生成的PDF文件</li>
          </ul>
        </div>
        
        {/* 文件夹添加 */}
        <div>
          <Title level={5}>添加文件夹</Title>
          <Space direction="vertical" size="middle" className="w-full">
            {/* 选择文件夹按钮 */}
            <Space className="w-full">
              <Button
                type="primary"
                icon={<FolderOpenOutlined />}
                onClick={selectFolder}
                size="large"
                disabled={processing.isProcessing || isLoadingFiles}
                loading={isLoadingFiles}
              >
                {isLoadingFiles ? '正在读取文件...' : '添加文件夹'}
              </Button>
              <Button
                icon={<DeleteOutlined />}
                onClick={() => setFolders([])}
                size="large"
                disabled={folders.length === 0 || processing.isProcessing}
              >
                清空列表
              </Button>
            </Space>
            
            {/* 手动输入路径 */}
            <div>
              <Text type="secondary" className="text-sm mb-2 block">
                或手动输入文件夹名称：
              </Text>
              <Space.Compact className="w-full">
                <Input
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="请输入文件夹名称"
                  size="large"
                  onPressEnter={addFolder}
                />
                <Button
                  type="default"
                  onClick={addFolder}
                  size="large"
                  disabled={processing.isProcessing}
                >
                  添加
                </Button>
              </Space.Compact>
            </div>
          </Space>
          <Text type="secondary" className="text-sm mt-2 block">
            每个文件夹应包含至少2张身份证照片（正反面）。如需选择多个文件夹，需逐选择添加，不能一次多选
          </Text>
        </div>



        {/* 文件夹列表 */}
        {folders.length > 0 && (
          <div>
            <Title level={5}>待处理文件夹 ({folders.length}个)</Title>
            <Table
              columns={columns}
              dataSource={folders}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
            />
          </div>
        )}

        {/* 处理进度 */}
        {processing.isProcessing && (
          <div>
            <Title level={5}>处理进度</Title>
            <div className="mb-2">
              <Text>当前：{processing.currentFolder}</Text>
            </div>
            <Progress
              percent={Math.round((processing.processedCount / processing.totalCount) * 100)}
              status="active"
              format={() => `${processing.processedCount}/${processing.totalCount}`}
            />
          </div>
        )}

        {/* 处理结果统计 */}
        {batchSummary && (
          <div>
            <Title level={5}>处理结果</Title>
            <div className="bg-gray-50 p-4 rounded-lg">
              <Space size="large">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{batchSummary.total}</div>
                  <div className="text-sm text-gray-600">总计</div>
                </div>
                <Divider type="vertical" className="h-12" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{batchSummary.success}</div>
                  <div className="text-sm text-gray-600">成功</div>
                </div>
                <Divider type="vertical" className="h-12" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{batchSummary.failed}</div>
                  <div className="text-sm text-gray-600">失败</div>
                </div>
              </Space>
              
              {batchSummary.failedFolders.length > 0 && (
                <div className="mt-4">
                  <Text type="secondary">失败的文件夹：</Text>
                  <div className="mt-2">
                    {batchSummary.failedFolders.map((folder, index) => (
                      <Tag key={index} color="red" className="mb-1">
                        {folder}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="text-center">
          <Space size="large">
            <Button
               type="primary"
               size="large"
               icon={<PlayCircleOutlined />}
               onClick={startBatchProcess}
               loading={processing.isProcessing}
               disabled={folders.length === 0}
               className="px-8"
             >
              {processing.isProcessing ? '处理中...' : '开始批量处理'}
            </Button>
            
            {pdfFiles.length > 0 && (
              <Button 
                type="default" 
                size="large"
                icon={<DownloadOutlined />}
                onClick={downloadZipFile}
                disabled={processing.isProcessing}
              >
                下载ZIP压缩包 ({pdfFiles.length}个文件)
              </Button>
            )}
            
            <Button 
              icon={<ReloadOutlined />}
              onClick={resetAll}
              disabled={processing.isProcessing}
              size="large"
              className="px-6"
            >
              重置
            </Button>
          </Space>
        </div>
      </Space>
    </Card>
  );
}