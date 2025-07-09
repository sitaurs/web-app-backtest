import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  apiKeys: {
    geminiPro: string;
    geminiFlash: string;
  };
  externalApis: {
    ohlcvUrl: string;
    chartUrl: string;
    geminiProUrl: string;
    geminiFlashUrl: string;
  };
  simulation: {
    defaultSkipCandles: number;
    analysisWindowHours: number;
    orderExpiryMinutes: number;
  };
  cache: {
    enabled: boolean;
    ttlMinutes: number;
  };
  database: {
    url: string;
  };
}

const config: AppConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  apiKeys: {
    geminiPro: process.env.API_KEY_GEMINI_PRO || '',
    geminiFlash: process.env.API_KEY_GEMINI_FLASH || '',
  },
  externalApis: {
    ohlcvUrl: process.env.OHLCV_API_URL || 'https://api.mt5.flx.web.id/fetch_data_range',
    chartUrl: process.env.CHART_API_URL || 'https://api.chart-img.com/v2/tradingview/advanced-chart',
    geminiProUrl: process.env.GEMINI_PRO_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
    geminiFlashUrl: process.env.GEMINI_FLASH_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
  },
  simulation: {
    defaultSkipCandles: parseInt(process.env.DEFAULT_SKIP_CANDLES || '6', 10),
    analysisWindowHours: parseInt(process.env.ANALYSIS_WINDOW_HOURS || '20', 10),
    orderExpiryMinutes: parseInt(process.env.ORDER_EXPIRY_MINUTES || '180', 10),
  },
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
    ttlMinutes: parseInt(process.env.CACHE_TTL_MINUTES || '60', 10),
  },
  database: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017/forex-backtest',
  },
};

// Validate required configuration
export function validateConfig(): void {
  const requiredFields = [
    'jwtSecret',
    'apiKeys.geminiPro',
    'apiKeys.geminiFlash'
  ];

  const missingFields: string[] = [];

  if (!config.jwtSecret || config.jwtSecret === 'fallback-secret-key') {
    missingFields.push('JWT_SECRET');
  }
  
  if (!config.apiKeys.geminiPro) {
    missingFields.push('API_KEY_GEMINI_PRO');
  }
  
  if (!config.apiKeys.geminiFlash) {
    missingFields.push('API_KEY_GEMINI_FLASH');
  }

  if (missingFields.length > 0) {
    throw new Error(`Missing required environment variables: ${missingFields.join(', ')}`);
  }
}

export default config;
