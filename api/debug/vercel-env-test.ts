import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel环境调试端点
 * 用于检查环境变量配置和网络连接
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const debugInfo: any = {
    timestamp: new Date().toISOString(),
    environment: 'vercel',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  };

  try {
    // 检查环境变量
    const envVars = {
      BAIDU_APP_ID: process.env.BAIDU_APP_ID,
      BAIDU_API_KEY: process.env.BAIDU_API_KEY,
      BAIDU_SECRET_KEY: process.env.BAIDU_SECRET_KEY
    };

    debugInfo.environmentVariables = {
      BAIDU_APP_ID: {
        exists: !!envVars.BAIDU_APP_ID,
        length: envVars.BAIDU_APP_ID?.length || 0,
        preview: envVars.BAIDU_APP_ID ? envVars.BAIDU_APP_ID.substring(0, 8) + '...' : 'undefined'
      },
      BAIDU_API_KEY: {
        exists: !!envVars.BAIDU_API_KEY,
        length: envVars.BAIDU_API_KEY?.length || 0,
        preview: envVars.BAIDU_API_KEY ? envVars.BAIDU_API_KEY.substring(0, 8) + '...' : 'undefined'
      },
      BAIDU_SECRET_KEY: {
        exists: !!envVars.BAIDU_SECRET_KEY,
        length: envVars.BAIDU_SECRET_KEY?.length || 0,
        preview: envVars.BAIDU_SECRET_KEY ? envVars.BAIDU_SECRET_KEY.substring(0, 8) + '...' : 'undefined'
      }
    };

    // 检查百度SDK是否可以加载
    try {
      const baiduSdk = await import('baidu-aip-sdk');
      debugInfo.baiduSdk = {
        loaded: true,
        hasOcr: !!baiduSdk.default?.ocr,
        version: 'unknown'
      };
    } catch (error) {
      debugInfo.baiduSdk = {
        loaded: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // 测试网络连接到百度API
    try {
      const response = await fetch('https://aip.baidubce.com/oauth/2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: envVars.BAIDU_API_KEY || 'test',
          client_secret: envVars.BAIDU_SECRET_KEY || 'test'
        })
      });

      const responseText = await response.text();
      debugInfo.networkTest = {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        responsePreview: responseText.substring(0, 200)
      };
    } catch (error) {
      debugInfo.networkTest = {
        success: false,
        error: error instanceof Error ? error.message : 'Network test failed'
      };
    }

    // 检查所有环境变量是否配置正确
    const allEnvConfigured = envVars.BAIDU_APP_ID && envVars.BAIDU_API_KEY && envVars.BAIDU_SECRET_KEY;
    debugInfo.configurationStatus = {
      allConfigured: allEnvConfigured,
      missingVars: Object.entries(envVars)
        .filter(([key, value]) => !value)
        .map(([key]) => key)
    };

    res.status(200).json({
      success: true,
      debug: debugInfo
    });

  } catch (error) {
    console.error('调试端点错误:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '调试失败',
      debug: debugInfo
    });
  }
}