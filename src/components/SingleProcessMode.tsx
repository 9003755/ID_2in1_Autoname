import React, { useState, useRef, useEffect } from 'react';
import { Card, Upload, Button, Input, Space, Typography, Row, Col, message, Progress } from 'antd';
import { UploadOutlined, EyeOutlined, FileTextOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
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
  const [extractedName, setExtractedName] = useState<string>('');
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    currentStep: ''
  });
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [uploadKey, setUploadKey] = useState<number>(0); // 用于强制重新渲染Upload组件
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  // 重置表单
  const resetForm = () => {
    // 清理所有状态
    setImages({ front: null, back: null });
    setExtractedName('');
    setPdfBlob(null);
    setPdfFileName('');
    setProcessing({ isProcessing: false, progress: 0, currentStep: '' });
    
    // 清理可能存在的定时器
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    
    // 强制重新渲染
    setTimeout(() => {
      message.success('表单已重置，可以重新开始');
    }, 100);
  };

  // 手动重置功能
  const handleManualReset = () => {
    // 清理所有状态
    setImages({ front: null, back: null });
    setExtractedName('');
    setPdfBlob(null);
    setPdfFileName('');
    setProcessing({ isProcessing: false, progress: 0, currentStep: '' });
    
    // 清理可能存在的定时器
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    
    // 强制重新渲染Upload组件
    setUploadKey(prev => prev + 1);
    
    // 清理所有可能的URL对象
    const imgElements = document.querySelectorAll('img[src^="blob:"]');
    imgElements.forEach(img => {
      URL.revokeObjectURL((img as HTMLImageElement).src);
    });
    
    message.success('已重置，可以重新开始');
  };

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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: OcrResponse = await response.json();
      
      if (result.success && result.name) {
        setExtractedName(result.name);
        message.success(`识别成功：${result.name}`);
      } else {
        const errorMsg = result.error || '未能识别到姓名';
        message.warning(`${errorMsg}，请手动输入`);
        console.warn('OCR识别结果:', result);
      }
    } catch (error) {
      console.error('识别失败:', error);
      if (error instanceof Error && error.message.includes('配置')) {
        message.error('百度OCR服务未配置，请联系管理员配置API密钥');
      } else {
        message.error('识别失败，请手动输入姓名');
      }
    } finally {
      setProcessing({
        isProcessing: false,
        progress: 0,
        currentStep: ''
      });
    }
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
      // 添加fileName字段以确保PDF文件名正确生成
      formData.append('fileName', `${extractedName}身份证.pdf`);

      setProcessing(prev => ({ ...prev, progress: 60, currentStep: '正在生成PDF...' }));

      const response = await fetch('/api/pdf/download', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      setPdfBlob(blob);
      setPdfFileName(`${extractedName}身份证`);
      
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
  };

  return (
    <Card title="单个处理模式" className="shadow-sm">
      <Space direction="vertical" size="large" className="w-full">
        {/* 照片上传区域 */}
        <Card size="small" title="身份证照片上传">
          <div className="text-center mb-4">
            <Upload key={uploadKey} {...uploadProps} onChange={handleImageUpload}>
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

        {/* 下载区域 */}
        {pdfBlob && (
          <div>
            <Title level={5}>下载PDF文件</Title>
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
              disabled={!images.front || !images.back || !extractedName.trim()}
              className="px-8"
            >
              生成PDF
            </Button>
            <Button 
              icon={<ReloadOutlined />}
              onClick={handleManualReset}
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