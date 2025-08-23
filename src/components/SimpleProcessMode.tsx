import React, { useState } from 'react';
import { Card, Upload, Button, Input, Space, Typography, Row, Col, message, Progress } from 'antd';
import { UploadOutlined, EyeOutlined, FolderOpenOutlined, FileTextOutlined } from '@ant-design/icons';
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
  const [outputPath, setOutputPath] = useState<string>('');
  const [pdfFileName, setPdfFileName] = useState<string>('');
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

  // 选择保存路径
  const selectOutputPath = async () => {
    try {
      // 使用文件系统API选择文件夹
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        setOutputPath(dirHandle.name);
        message.success('保存路径已选择');
      } else {
        // 降级方案：手动输入路径
        message.info('请手动输入保存路径');
      }
    } catch (error) {
      console.error('选择路径失败:', error);
    }
  };

  // 生成PDF
  const generatePdf = async () => {
    if (!images.first?.originFileObj || !images.second?.originFileObj) {
      message.error('请上传两张图片');
      return;
    }

    if (!pdfFileName.trim()) {
      message.error('请输入PDF文件名');
      return;
    }

    if (!outputPath.trim()) {
      message.error('请选择保存路径');
      return;
    }

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
      formData.append('outputPath', outputPath);

      setProcessing(prev => ({ ...prev, progress: 60, currentStep: '正在生成PDF...' }));

      const response = await fetch('/api/pdf/simple-generate', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success) {
        setProcessing(prev => ({ ...prev, progress: 100, currentStep: '生成完成！' }));
        message.success(`PDF生成成功：${result.filePath}`);
        
        // 重置表单
        setTimeout(() => {
          setImages({ first: null, second: null });
          setPdfFileName('');
          setOutputPath('');
          setProcessing({ isProcessing: false, progress: 0, currentStep: '' });
        }, 2000);
      } else {
        throw new Error(result.error || 'PDF生成失败');
      }
    } catch (error) {
      console.error('生成PDF失败:', error);
      message.error(error instanceof Error ? error.message : 'PDF生成失败');
      setProcessing({ isProcessing: false, progress: 0, currentStep: '' });
    }
  };

  return (
    <Card title="单个简单处理" className="shadow-sm">
      <Space direction="vertical" size="large" className="w-full">
        {/* 照片上传区域 */}
        <Card size="small" title="图片上传">
          <div className="text-center mb-4">
            <Upload {...uploadProps} onChange={handleImageUpload}>
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

        {/* 保存路径 */}
        <div>
          <Title level={5}>保存路径</Title>
          <Space.Compact className="w-full">
            <Input
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              placeholder="请选择或输入保存路径"
              size="large"
            />
            <Button
              icon={<FolderOpenOutlined />}
              onClick={selectOutputPath}
              size="large"
            >
              选择文件夹
            </Button>
          </Space.Compact>
        </div>

        {/* 进度显示 */}
        {processing.isProcessing && (
          <div>
            <Text className="block mb-2">{processing.currentStep}</Text>
            <Progress percent={processing.progress} status="active" />
          </div>
        )}

        {/* 生成按钮 */}
        <div className="text-center">
          <Button
            type="primary"
            size="large"
            icon={<FileTextOutlined />}
            onClick={generatePdf}
            loading={processing.isProcessing}
            disabled={!images.first || !images.second || !pdfFileName.trim() || !outputPath.trim()}
            className="px-8"
          >
            生成PDF
          </Button>
        </div>
      </Space>
    </Card>
  );
}