import React, { useState } from 'react';
import { Layout, Card, Radio, Typography, Space } from 'antd';
import { FileTextOutlined, FolderOpenOutlined, PictureOutlined } from '@ant-design/icons';
import SingleProcessMode from '../components/SingleProcessMode';
import BatchProcessMode from '../components/BatchProcessMode';
import SimpleProcessMode from '../components/SimpleProcessMode';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

type ProcessMode = 'single' | 'simple' | 'batch';

export default function Home() {
  const [mode, setMode] = useState<ProcessMode>('single');

  return (
    <Layout className="min-h-screen bg-gray-50">
      <Header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-between items-center">
            <Title level={2} className="!mb-0 !text-gray-800 !mt-2">
              身份证正反两面合并、自动命名PDF的工具
            </Title>
            <Text className="text-gray-600">
              作者：海边的飞行器
            </Text>
          </div>
        </div>
      </Header>
      
      <Content className="max-w-6xl mx-auto px-4 py-8 w-full">
        <Space direction="vertical" size="large" className="w-full">
          {/* 模式选择 */}
          <Card className="shadow-sm">
            <div className="text-center">
              <Title level={3} className="!mb-4">
                选择处理模式
              </Title>
              <Radio.Group
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                size="large"
                className="mb-4"
              >
                <Radio.Button value="single" className="h-12 px-6">
                  <Space>
                    <FileTextOutlined />
                    单个处理
                  </Space>
                </Radio.Button>
                <Radio.Button value="simple" className="h-12 px-6">
                  <Space>
                    <PictureOutlined />
                    单个简单处理
                  </Space>
                </Radio.Button>
                <Radio.Button value="batch" className="h-12 px-6">
                  <Space>
                    <FolderOpenOutlined />
                    批量处理
                  </Space>
                </Radio.Button>
              </Radio.Group>
              
              <div className="text-gray-600">
                {mode === 'single' ? (
                  <Text>处理单个身份证，上传正反面照片生成PDF</Text>
                ) : mode === 'simple' ? (
                  <Text>简单合并两张图片为PDF，无需身份证识别</Text>
                ) : (
                  <Text>批量处理多个文件夹中的身份证照片</Text>
                )}
              </div>
            </div>
          </Card>

          {/* 处理模式组件 */}
          {mode === 'single' ? (
            <SingleProcessMode />
          ) : mode === 'simple' ? (
            <SimpleProcessMode />
          ) : (
            <BatchProcessMode />
          )}
        </Space>
      </Content>
    </Layout>
  );
}