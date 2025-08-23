import React, { useState } from 'react';
import { Card, Upload, Button, Input, Space, Typography, Row, Col, message, Progress } from 'antd';
import { UploadOutlined, EyeOutlined, FolderOpenOutlined, FileTextOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { OcrRequest, OcrResponse, PdfGenerateRequest, PdfGenerateResponse } from '../../shared/types';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  currentStep: string;
}

export default function SingleProcessMode() {
  const [images, setImages] = useState<{ front: UploadFile | null; back: UploadFile | null }>({
    front: null,
    back: null
  });
  const [outputPath, setOutputPath] = useState<string>('');
  const [extractedName, setExtractedName] = useState<string>('');
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
      
      // 如果只有一个文件，默认设为正面
      if (files.length === 1) {
        newImages.front = files[0];
        // 自动识别姓名
        recognizeName(files[0]);
      } else if (files.length === 2) {
        // 两个文件时，第一个为正面，第二个为反面
        newImages.front = files[0];
        newImages.back = files[1];
        // 自动识别姓名
        recognizeName(files[0]);
      }
      
      setImages(newImages);
    }
  };

  // 设置图片类型（正面/反面）
  const setImageType = (file: UploadFile, type: 'front' | 'back') => {
    setImages(prev => ({
      ...prev,
      [type]: file
    }));
    
    // 如果设置为正面，自动识别姓名
    if (type === 'front') {
      recognizeName(file);
    }
  };

  // 移除图片
  const removeImage = (type: 'front' | 'back') => {
    setImages(prev => ({
      ...prev,
      [type]: null
    }));
  };

  // 识别身份证姓名
  const recognizeName = async (file: UploadFile) => {
    if (!file.originFileObj) return;

    try {
      setProcessing({
        isProcessing: true,
        progress: 30,
        currentStep: '正在识别身份证信息...'
      });

      const formData = new FormData();
      formData.append('image', file.originFileObj);
      formData.append('type', 'front');

      const response = await fetch('/api/ocr/identify', {
        method: 'POST',
        body: formData,
      });

      const result: OcrResponse = await response.json();
      
      if (result.success && result.name) {
        setExtractedName(result.name);
        message.success(`识别成功：${result.name}`);
      } else {
        message.warning('未能识别到姓名，请手动输入');
      }
    } catch (error) {
      console.error('识别失败:', error);
      message.error('识别失败，请手动输入姓名');
    } finally {
      setProcessing({
        isProcessing: false,
        progress: 0,
        currentStep: ''
      });
    }
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
    if (!images.front?.originFileObj || !images.back?.originFileObj) {
      message.error('请上传身份证正反面照片');
      return;
    }

    if (!extractedName.trim()) {
      message.error('请输入姓名');
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
      formData.append('front', images.front.originFileObj);
      formData.append('back', images.back.originFileObj);
      formData.append('name', extractedName);
      formData.append('outputPath', outputPath);

      setProcessing(prev => ({ ...prev, progress: 60, currentStep: '正在生成PDF...' }));

      const response = await fetch('/api/pdf/generate', {
        method: 'POST',
        body: formData,
      });

      const result: PdfGenerateResponse = await response.json();
      
      if (result.success) {
        setProcessing(prev => ({ ...prev, progress: 100, currentStep: '生成完成！' }));
        message.success(`PDF生成成功：${result.filePath}`);
        
        // 重置表单
        setTimeout(() => {
          setImages({ front: null, back: null });
          setExtractedName('');
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
    <Card title="单个处理模式" className="shadow-sm">
      <Space direction="vertical" size="large" className="w-full">
        {/* 照片上传区域 */}
        <Card size="small" title="身份证照片上传">
          <div className="text-center mb-4">
            <Upload {...uploadProps} onChange={handleImageUpload}>
              <Button icon={<UploadOutlined />} size="large" className="mb-4">
                选择身份证照片（可同时选择正反面）
              </Button>
            </Upload>
            <Text type="secondary" className="block">
              支持同时选择多张图片，或分别上传正反面照片
            </Text>
          </div>
          
          {/* 图片预览区域 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[200px] flex flex-col items-center justify-center">
                <Title level={5} className="mb-2">正面</Title>
                {images.front ? (
                  <div className="w-full">
                    <img
                      src={URL.createObjectURL(images.front.originFileObj!)}
                      alt="身份证正面"
                      className="max-w-full max-h-48 object-contain mx-auto mb-2"
                    />
                    <div className="text-sm text-gray-600 text-center mb-2">
                      {images.front.name}
                    </div>
                    <div className="text-center">
                      <Button size="small" danger onClick={() => removeImage('front')}>
                        移除
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-center">
                    <EyeOutlined className="text-2xl mb-2" />
                    <div>暂无正面照片</div>
                  </div>
                )}
              </div>
            </Col>
            
            <Col xs={24} md={12}>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[200px] flex flex-col items-center justify-center">
                <Title level={5} className="mb-2">反面</Title>
                {images.back ? (
                  <div className="w-full">
                    <img
                      src={URL.createObjectURL(images.back.originFileObj!)}
                      alt="身份证反面"
                      className="max-w-full max-h-48 object-contain mx-auto mb-2"
                    />
                    <div className="text-sm text-gray-600 text-center mb-2">
                      {images.back.name}
                    </div>
                    <div className="text-center">
                      <Button size="small" danger onClick={() => removeImage('back')}>
                        移除
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-center">
                    <EyeOutlined className="text-2xl mb-2" />
                    <div>暂无反面照片</div>
                  </div>
                )}
              </div>
            </Col>
          </Row>
          
          {/* 如果有未分类的图片，显示分类按钮 */}
          {(images.front || images.back) && (
            <div className="mt-4 text-center">
              <Text type="secondary">
                如需调整图片分类，请点击对应图片下方的"移除"按钮后重新上传
              </Text>
            </div>
          )}
        </Card>

        {/* 姓名输入 */}
        <div>
          <Title level={5}>无需输入，将自动识别身份证姓名</Title>
          <Input
            value={extractedName}
            onChange={(e) => setExtractedName(e.target.value)}
            placeholder="请输入姓名（上传正面照片后自动识别）"
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
            disabled={!images.front || !images.back || !extractedName.trim() || !outputPath.trim()}
            className="px-8"
          >
            生成PDF
          </Button>
        </div>
      </Space>
    </Card>
  );
}