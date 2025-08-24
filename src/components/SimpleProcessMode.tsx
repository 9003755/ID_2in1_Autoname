import React, { useState } from 'react';
import { Card, Upload, Button, Input, Space, Typography, Row, Col, message, Progress } from 'antd';
import { UploadOutlined, EyeOutlined, DownloadOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';

const { Title, Text } = Typography;

interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  currentStep: string;
}

export default function SimpleProcessMode() {
  const [images, setImages] = useState<{ first: UploadFile | null; second: UploadFile | null }>({
    first: null,
    second: null
  });
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [uploadKey, setUploadKey] = useState<number>(0); // 用于强制重新渲染Upload组件
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    currentStep: ''
  });

  // 文件上传配置
  const uploadProps: UploadProps = {
    accept: 'image/*',
    beforeUpload: () => false, // 阻止自动上传
    showUploadList: false,
    multiple: true,
    maxCount: 2,
  };

  // 处理照片上传
  const handleImageUpload: UploadProps['onChange'] = (info) => {
    const files = info.fileList;
    if (files.length > 0) {
      const newImages = { ...images };
      
      // 如果只有一个文件，设为第一张
      if (files.length === 1) {
        newImages.first = files[0];
      } else if (files.length === 2) {
        // 两个文件时，第一个为第一张，第二个为第二张
        newImages.first = files[0];
        newImages.second = files[1];
      }
      
      setImages(newImages);
    }
  };

  // 移除图片
  const removeImage = (type: 'first' | 'second') => {
    setImages(prev => ({
      ...prev,
      [type]: null
    }));
  };

  // 下载PDF文件
  const downloadPdf = () => {
    if (!pdfBlob || !pdfFileName) {
      message.error('没有可下载的PDF文件');
      return;
    }

    try {
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${pdfFileName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success('PDF文件下载成功');
    } catch (error) {
      console.error('下载失败:', error);
      message.error('下载失败，请重试');
    }
  };

  // 获取目录完整路径的辅助函数
  const getDirectoryPath = async (directoryHandle: any): Promise<string> => {
    try {
      // 尝试多种方法获取完整路径
      if (directoryHandle.resolve) {
        const path = await directoryHandle.resolve();
        if (Array.isArray(path)) {
          return path.join('\\');
        }
      }
      
      // 尝试通过queryPermission获取路径信息
      if (directoryHandle.queryPermission) {
        await directoryHandle.queryPermission({ mode: 'readwrite' });
      }
      
      // 如果有name属性，尝试构建路径
      if (directoryHandle.name) {
        // 在Windows系统中，通常选择的是完整路径
        // 但API只返回文件夹名称，我们需要提示用户
        console.log('选择的文件夹:', directoryHandle.name);
        return directoryHandle.name;
      }
      
      return '未知路径';
    } catch (error) {
      console.warn('无法获取完整路径:', error);
      return directoryHandle.name || '未知路径';
    }
  };

  // 手动重置所有状态
  const resetAll = () => {
    // 清理所有状态
    setImages({ first: null, second: null });
    setPdfFileName('');
    setPdfBlob(null);
    setProcessing({ isProcessing: false, progress: 0, currentStep: '' });
    
    // 强制重新渲染Upload组件
    setUploadKey(prev => prev + 1);
    
    // 清理所有可能的URL对象
    const imgElements = document.querySelectorAll('img[src^="blob:"]');
    imgElements.forEach(img => {
      URL.revokeObjectURL((img as HTMLImageElement).src);
    });
    
    message.success('已重置，可以重新开始');
  };

  // 生成PDF
  const generatePdf = async () => {
    if (images.first?.originFileObj && images.second?.originFileObj && pdfFileName.trim()) {
      try {
        setProcessing({
          isProcessing: true,
          progress: 20,
          currentStep: '正在上传文件...'
        });

        const formData = new FormData();
        formData.append('first', images.first.originFileObj);
        formData.append('second', images.second.originFileObj);
        formData.append('fileName', pdfFileName);

        setProcessing(prev => ({ ...prev, progress: 60, currentStep: '正在生成PDF...' }));

        const response = await fetch('/api/pdf/simple-download', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        setPdfBlob(blob);
        
        setProcessing(prev => ({ ...prev, progress: 100, currentStep: 'PDF生成完成！点击下载按钮下载文件' }));
        message.success('PDF生成成功，可以下载了');
        
        // 停止处理状态，但保持成功状态显示
        setTimeout(() => {
          setProcessing(prev => ({ ...prev, isProcessing: false }));
        }, 1000);
      } catch (error) {
        console.error('生成PDF失败:', error);
        message.error(error instanceof Error ? error.message : 'PDF生成失败');
        setProcessing({ isProcessing: false, progress: 0, currentStep: '' });
      }
    } else {
      message.error('请确保已上传两张图片并输入文件名');
    }
  };

  return (
    <Card title="单个简单处理" className="shadow-sm">
      <Space direction="vertical" size="large" className="w-full">
        {/* 照片上传区域 */}
        <Card size="small" title="图片上传">
          <div className="text-center mb-4">
            <Upload key={uploadKey} {...uploadProps} onChange={handleImageUpload}>
              <Button icon={<UploadOutlined />} size="large" className="mb-4">
                选择图片（可同时选择两张）
              </Button>
            </Upload>
            <Text type="secondary" className="block">
              支持同时选择多张图片，或分别上传两张图片
            </Text>
          </div>
          
          {/* 图片预览区域 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[200px] flex flex-col items-center justify-center">
                <Title level={5} className="mb-2">第一张图片</Title>
                {images.first ? (
                  <div className="w-full">
                    <img
                      src={URL.createObjectURL(images.first.originFileObj!)}
                      alt="第一张图片"
                      className="max-w-full max-h-48 object-contain mx-auto mb-2"
                    />
                    <div className="text-sm text-gray-600 text-center mb-2">
                      {images.first.name}
                    </div>
                    <div className="text-center">
                      <Button size="small" danger onClick={() => removeImage('first')}>
                        移除
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-center">
                    <EyeOutlined className="text-2xl mb-2" />
                    <div>暂无图片</div>
                  </div>
                )}
              </div>
            </Col>
            
            <Col xs={24} md={12}>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[200px] flex flex-col items-center justify-center">
                <Title level={5} className="mb-2">第二张图片</Title>
                {images.second ? (
                  <div className="w-full">
                    <img
                      src={URL.createObjectURL(images.second.originFileObj!)}
                      alt="第二张图片"
                      className="max-w-full max-h-48 object-contain mx-auto mb-2"
                    />
                    <div className="text-sm text-gray-600 text-center mb-2">
                      {images.second.name}
                    </div>
                    <div className="text-center">
                      <Button size="small" danger onClick={() => removeImage('second')}>
                        移除
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-center">
                    <EyeOutlined className="text-2xl mb-2" />
                    <div>暂无图片</div>
                  </div>
                )}
              </div>
            </Col>
          </Row>
        </Card>

        {/* PDF文件名输入 */}
        <div>
          <Title level={5}>PDF文件名</Title>
          <Input
            value={pdfFileName}
            onChange={(e) => setPdfFileName(e.target.value)}
            placeholder="请输入PDF文件名（不需要包含.pdf后缀）"
            size="large"
          />
        </div>

        {/* 下载区域 */}
        {pdfBlob && (
          <div>
            <Title level={5}>下载PDF</Title>
            <Button 
              icon={<DownloadOutlined />} 
              onClick={downloadPdf}
              type="primary"
              size="large"
              className="w-full"
            >
              下载PDF文件
            </Button>
          </div>
        )}

        {/* 进度显示 */}
        {processing.isProcessing && (
          <div>
            <Text className="block mb-2">{processing.currentStep}</Text>
            <Progress percent={processing.progress} status="active" />
          </div>
        )}

        {/* 生成按钮 */}
        <div className="text-center">
          <Space size="large">
            <Button
              type="primary"
              size="large"
              icon={<FileTextOutlined />}
              onClick={generatePdf}
              loading={processing.isProcessing}
              disabled={!images.first || !images.second || !pdfFileName.trim()}
              className="px-8"
            >
              生成PDF
            </Button>
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