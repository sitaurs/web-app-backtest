import axios, { AxiosResponse } from 'axios';
import config from '../utils/configUtils';
import logger from '../utils/logger';
import { DateUtils } from '../utils/dateUtils';

export interface ChartRequest {
  symbol: string;
  interval: string;
  start: Date;
  end: Date;
  studies: ChartStudy[];
  width?: number;
  height?: number;
}

export interface ChartStudy {
  name: string;
  input?: { [key: string]: any };
  forceOverlay?: boolean;
}

export interface ChartResponse {
  success: boolean;
  imageBase64?: string;
  error?: string;
  cached?: boolean;
}

export interface MultiChartResponse {
  image1h: ChartResponse;
  image5m: ChartResponse;
  image15m_ema: ChartResponse;
  image15m_bb: ChartResponse;
}

export class ChartService {
  private static readonly BASE_URL = config.externalApis.chartUrl;
  private static readonly REQUEST_TIMEOUT = 45000; // 45 seconds for image generation
  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_DELAY = 2000; // 2 seconds

  // Default chart configurations as specified in the requirements
  private static readonly CHART_CONFIGS = {
    image1h: {
      interval: '1h',
      studies: [
        { 
          name: 'Moving Average Exponential', 
          input: { length: 50 } 
        },
        { 
          name: 'Relative Strength Index', 
          forceOverlay: false, 
          input: { length: 14 } 
        }
      ]
    },
    image5m: {
      interval: '5m',
      studies: [] // Clean chart
    },
    image15m_ema: {
      interval: '15m',
      studies: [
        { 
          name: 'Moving Average Exponential', 
          input: { length: 21 } 
        },
        { 
          name: 'Moving Average Exponential', 
          input: { length: 50 } 
        }
      ]
    },
    image15m_bb: {
      interval: '15m',
      studies: [
        { 
          name: 'Bollinger Bands', 
          input: { in_0: 20, in_1: 2 } 
        },
        { 
          name: 'Relative Strength Index', 
          forceOverlay: false, 
          input: { length: 14 } 
        }
      ]
    }
  };

  /**
   * Generate all four required chart images for analysis
   */
  static async generateAnalysisCharts(
    symbol: string,
    start: Date,
    end: Date
  ): Promise<MultiChartResponse> {
    logger.info('Generating analysis charts', {
      symbol,
      start: start.toISOString(),
      end: end.toISOString()
    });

    try {
      // Generate all charts in parallel for efficiency
      const [image1h, image5m, image15m_ema, image15m_bb] = await Promise.all([
        this.generateChart(symbol, start, end, this.CHART_CONFIGS.image1h),
        this.generateChart(symbol, start, end, this.CHART_CONFIGS.image5m),
        this.generateChart(symbol, start, end, this.CHART_CONFIGS.image15m_ema),
        this.generateChart(symbol, start, end, this.CHART_CONFIGS.image15m_bb)
      ]);

      const result: MultiChartResponse = {
        image1h,
        image5m,
        image15m_ema,
        image15m_bb
      };

      // Validate that all charts were generated successfully
      const allSuccessful = Object.values(result).every(chart => chart.success);
      
      if (allSuccessful) {
        logger.info('All analysis charts generated successfully', { symbol });
      } else {
        logger.warn('Some charts failed to generate', {
          symbol,
          failures: Object.entries(result)
            .filter(([, chart]) => !chart.success)
            .map(([name]) => name)
        });
      }

      return result;

    } catch (error) {
      logger.error('Failed to generate analysis charts', {
        symbol,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return failed responses for all charts
      const failedResponse: ChartResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      return {
        image1h: failedResponse,
        image5m: failedResponse,
        image15m_ema: failedResponse,
        image15m_bb: failedResponse
      };
    }
  }

  /**
   * Generate a single chart image
   */
  static async generateChart(
    symbol: string,
    start: Date,
    end: Date,
    config: { interval: string; studies: ChartStudy[] },
    width: number = 800,
    height: number = 600
  ): Promise<ChartResponse> {
    try {
      const request: ChartRequest = {
        symbol,
        interval: config.interval,
        start,
        end,
        studies: config.studies,
        width,
        height
      };

      logger.debug('Generating chart', {
        symbol,
        interval: config.interval,
        studiesCount: config.studies.length
      });

      const payload = this.buildChartPayload(request);
      const response = await this.makeChartRequestWithRetry(payload);

      if (!response.data) {
        throw new Error('No image data received from chart API');
      }

      // Convert binary response to base64
      const imageBase64 = this.convertToBase64(response.data);

      logger.debug('Chart generated successfully', {
        symbol,
        interval: config.interval,
        imageSize: imageBase64.length
      });

      return {
        success: true,
        imageBase64
      };

    } catch (error) {
      logger.error('Failed to generate chart', {
        symbol,
        interval: config.interval,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Build chart API payload
   */
  private static buildChartPayload(request: ChartRequest): any {
    return {
      symbol: request.symbol.toUpperCase(),
      interval: request.interval,
      range: {
        from: DateUtils.formatForAPI(request.start),
        to: DateUtils.formatForAPI(request.end)
      },
      studies: request.studies,
      theme: 'dark', // Modern dark theme
      width: request.width || 800,
      height: request.height || 600,
      timezone: 'UTC',
      locale: 'en',
      style: {
        bars: 'candles',
        grid: true,
        crosshair: true,
        volume: false // Disable volume for cleaner charts
      }
    };
  }

  /**
   * Make chart API request with retry logic
   */
  private static async makeChartRequestWithRetry(
    payload: any,
    retryCount: number = 0
  ): Promise<AxiosResponse> {
    try {
      const response = await axios.post(this.BASE_URL, payload, {
        timeout: this.REQUEST_TIMEOUT,
        responseType: 'arraybuffer', // For binary image data
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Forex-Backtest-Platform/1.0',
          'Accept': 'image/png'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;

    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        logger.warn(`Chart request failed, retrying (${retryCount + 1}/${this.MAX_RETRIES})`, {
          payload: { symbol: payload.symbol, interval: payload.interval },
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        await this.delay(this.RETRY_DELAY * (retryCount + 1));
        return this.makeChartRequestWithRetry(payload, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Convert binary data to base64 string
   */
  private static convertToBase64(binaryData: ArrayBuffer): string {
    try {
      const buffer = Buffer.from(binaryData);
      return buffer.toString('base64');
    } catch (error) {
      logger.error('Failed to convert image to base64', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Failed to process image data');
    }
  }

  /**
   * Validate chart configuration
   */
  static validateChartConfig(config: { interval: string; studies: ChartStudy[] }): boolean {
    const validIntervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
    
    if (!validIntervals.includes(config.interval)) {
      return false;
    }

    // Validate studies
    for (const study of config.studies) {
      if (!study.name || typeof study.name !== 'string') {
        return false;
      }
    }

    return true;
  }

  /**
   * Get available chart intervals
   */
  static getAvailableIntervals(): string[] {
    return ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
  }

  /**
   * Get available technical indicators
   */
  static getAvailableIndicators(): string[] {
    return [
      'Moving Average Exponential',
      'Moving Average Simple',
      'Bollinger Bands',
      'Relative Strength Index',
      'MACD',
      'Stochastic',
      'Williams %R',
      'Commodity Channel Index',
      'Average True Range',
      'Parabolic SAR'
    ];
  }

  /**
   * Create custom chart configuration
   */
  static createCustomChartConfig(
    interval: string,
    indicators: Array<{ name: string; params?: any }>
  ): { interval: string; studies: ChartStudy[] } {
    const studies: ChartStudy[] = indicators.map(indicator => ({
      name: indicator.name,
      input: indicator.params || {},
      forceOverlay: this.shouldForceOverlay(indicator.name)
    }));

    return {
      interval,
      studies
    };
  }

  /**
   * Determine if indicator should be overlaid on price chart
   */
  private static shouldForceOverlay(indicatorName: string): boolean {
    const overlayIndicators = [
      'Moving Average Exponential',
      'Moving Average Simple',
      'Bollinger Bands',
      'Parabolic SAR'
    ];

    return overlayIndicators.includes(indicatorName);
  }

  /**
   * Estimate chart generation time based on complexity
   */
  static estimateGenerationTime(studiesCount: number): number {
    // Base time + additional time per study
    const baseTime = 5000; // 5 seconds
    const timePerStudy = 2000; // 2 seconds per study
    
    return baseTime + (studiesCount * timePerStudy);
  }

  /**
   * Validate chart image quality
   */
  static validateChartImage(imageBase64: string): {
    valid: boolean;
    size: number;
    format: string;
    error?: string;
  } {
    try {
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return {
          valid: false,
          size: 0,
          format: 'unknown',
          error: 'Invalid base64 string'
        };
      }

      const buffer = Buffer.from(imageBase64, 'base64');
      const size = buffer.length;

      // Check minimum size (should be at least 10KB for a valid chart)
      if (size < 10240) {
        return {
          valid: false,
          size,
          format: 'unknown',
          error: 'Image too small, likely corrupted'
        };
      }

      // Check maximum size (should not exceed 5MB)
      if (size > 5242880) {
        return {
          valid: false,
          size,
          format: 'unknown',
          error: 'Image too large'
        };
      }

      // Basic PNG header check
      const isPNG = buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
      
      return {
        valid: isPNG,
        size,
        format: isPNG ? 'PNG' : 'unknown',
        error: isPNG ? undefined : 'Invalid PNG format'
      };

    } catch (error) {
      return {
        valid: false,
        size: 0,
        format: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
    }
  }

  /**
   * Utility function for delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get chart generation statistics
   */
  static getGenerationStats(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageGenerationTime: number;
  } {
    // This would typically be stored in a database or cache
    // For now, return mock data
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageGenerationTime: 0
    };
  }
}

export default ChartService;
