// 测试百度OCR API调用
const fs = require('fs');
const path = require('path');

// 测试OCR API调用
async function testOcrApi() {
  console.log('开始测试百度OCR API调用...');
  
  try {
    // 检查环境变量
    require('dotenv').config();
    
    const appId = process.env.BAIDU_APP_ID;
    const apiKey = process.env.BAIDU_API_KEY;
    const secretKey = process.env.BAIDU_SECRET_KEY;
    
    console.log('环境变量检查:');
    console.log('BAIDU_APP_ID:', appId ? '已配置' : '未配置');
    console.log('BAIDU_API_KEY:', apiKey ? '已配置' : '未配置');
    console.log('BAIDU_SECRET_KEY:', secretKey ? '已配置' : '未配置');
    
    if (!appId || !apiKey || !secretKey) {
      console.error('❌ 百度OCR环境变量配置不完整');
      return;
    }
    
    // 测试OCR服务初始化
    console.log('\n正在测试百度OCR服务配置...');
    
    // 由于是TypeScript模块，我们直接测试API端点
    console.log('✅ 百度OCR环境变量配置完整');
    
    // 测试API端点
    console.log('\n测试OCR API端点...');
    const response = await fetch('http://localhost:3001/api/ocr/identify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    if (response.status === 400) {
      console.log('✅ OCR API端点响应正常（返回400是因为缺少必需参数）');
    } else {
      console.log('OCR API端点状态:', response.status);
    }
    
    console.log('\n🎉 百度OCR配置检查完成！');
    console.log('建议：在前端上传身份证图片进行实际测试');
    
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
    if (error.message.includes('配置缺失')) {
      console.log('请检查.env文件中的百度OCR配置');
    }
  }
}

// 运行测试
testOcrApi();