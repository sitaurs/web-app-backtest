import axios, { AxiosResponse } from 'axios';
import config from '../utils/configUtils';
import logger from '../utils/logger';
import { DateUtils } from '../utils/dateUtils';
import { OHLCVCandle } from '../models/Trade';

export interface DataRequest {
  symbol: string;
  timeframe: 'M5' | 'M15' | 'H1' | 'H4' | 'D1';
  start: Date;
  end: Date;
}

export interface DataResponse {
  success: boolean;
  data: OHLCVCandle[];
  error?: string;
  cached?: boolean;
}

export class DataService {
  private static readonly BASE_URL = config.externalApis.ohlcvUrl;
  private static readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000; // 1 second

  /**
   * Fetch OHLCV data from external API
   */
  static async fetchOHLCVData(request: DataRequest): Promise<DataResponse> {
    try {
      logger.info('Fetching OHLCV data', {
        symbol: request.symbol,
        timeframe: request.timeframe,
        start: request.start.toISOString(),
        end: request.end.toISOString()
      });

      const url = this.buildApiUrl(request);
      const response = await this.makeRequestWithRetry(url);

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid response format from OHLCV API');
      }

      const processedData = this.processOHLCVData(response.data);
      
      logger.info('Successfully fetched OHLCV data', {
        symbol: request.symbol,
        timeframe: request.timeframe,
        candleCount: processedData.length
      });

      return {
        success: true,
        data: processedData
      };

    } catch (error) {
      logger.error('Failed to fetch OHLCV data', {
        symbol: request.symbol,
        timeframe: request.timeframe,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Fetch multiple timeframes data synchronously
   */
  static async fetchMultiTimeframeData(
    symbol: string,
    start: Date,
    end: Date,
    timeframes: ('M5' | 'M15' | 'H1')[] = ['M5', 'M15', 'H1']
  ): Promise<{ [key: string]: DataResponse }> {
    const results: { [key: string]: DataResponse } = {};

    // Fetch all timeframes in parallel for efficiency
    const promises = timeframes.map(async (timeframe) => {
      const request: DataRequest = { symbol, timeframe, start, end };
      const response = await this.fetchOHLCVData(request);
      return { timeframe, response };
    });

    const responses = await Promise.all(promises);

    responses.forEach(({ timeframe, response }) => {
      results[timeframe] = response;
    });

    // Validate synchronization
    const isSync = this.validateDataSynchronization(results, start, end);
    if (!isSync) {
      logger.warn('Data synchronization issue detected', {
        symbol,
        timeframes,
        start: start.toISOString(),
        end: end.toISOString()
      });
    }

    return results;
  }

  /**
   * Build API URL with query parameters
   */
  private static buildApiUrl(request: DataRequest): string {
    const params = new URLSearchParams({
      symbol: request.symbol,
      timeframe: request.timeframe,
      start: DateUtils.formatForAPI(request.start),
      end: DateUtils.formatForAPI(request.end)
    });

    return `${this.BASE_URL}?${params.toString()}`;
  }

  /**
   * Make HTTP request with retry logic
   */
  private static async makeRequestWithRetry(url: string, retryCount = 0): Promise<AxiosResponse> {
    try {
      const response = await axios.get(url, {
        timeout: this.REQUEST_TIMEOUT,
        headers: {
          'User-Agent': 'Forex-Backtest-Platform/1.0',
          'Accept': 'application/json'
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;

    } catch (error) {
      if (retryCount < this.MAX_RETRIES) {
        logger.warn(`Request failed, retrying (${retryCount + 1}/${this.MAX_RETRIES})`, {
          url,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        await this.delay(this.RETRY_DELAY * (retryCount + 1));
        return this.makeRequestWithRetry(url, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Process raw OHLCV data from API
   */
  private static processOHLCVData(rawData: any[]): OHLCVCandle[] {
    return rawData
      .map(candle => this.validateAndTransformCandle(candle))
      .filter(candle => candle !== null)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }

  /**
   * Validate and transform individual candle data
   */
  private static validateAndTransformCandle(rawCandle: any): OHLCVCandle | null {
    try {
      // Validate required fields
      if (!rawCandle.time || typeof rawCandle.open !== 'number' || 
          typeof rawCandle.high !== 'number' || typeof rawCandle.low !== 'number' || 
          typeof rawCandle.close !== 'number') {
        logger.warn('Invalid candle data detected', { rawCandle });
        return null;
      }

      // Validate OHLC logic
      if (rawCandle.high < rawCandle.low || 
          rawCandle.high < rawCandle.open || rawCandle.high < rawCandle.close ||
          rawCandle.low > rawCandle.open || rawCandle.low > rawCandle.close) {
        logger.warn('Invalid OHLC values detected', { rawCandle });
        return null;
      }

      return {
        time: rawCandle.time,
        open: Number(rawCandle.open),
        high: Number(rawCandle.high),
        low: Number(rawCandle.low),
        close: Number(rawCandle.close),
        tick_volume: Number(rawCandle.tick_volume || 0),
        real_volume: Number(rawCandle.real_volume || 0),
        spread: Number(rawCandle.spread || 0)
      };

    } catch (error) {
      logger.warn('Error processing candle data', {
        rawCandle,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Validate data synchronization across timeframes
   */
  private static validateDataSynchronization(
    results: { [key: string]: DataResponse },
    start: Date,
    end: Date
  ): boolean {
    const timeframes = Object.keys(results);
    
    if (timeframes.length === 0) return false;

    // Check if all requests were successful
    const allSuccessful = timeframes.every(tf => results[tf].success);
    if (!allSuccessful) return false;

    // Check if all timeframes have data
    const allHaveData = timeframes.every(tf => results[tf].data.length > 0);
    if (!allHaveData) return false;

    // Check time range coverage
    for (const timeframe of timeframes) {
      const data = results[timeframe].data;
      const firstCandle = new Date(data[0].time);
      const lastCandle = new Date(data[data.length - 1].time);

      // Allow some tolerance for time differences
      const tolerance = 60 * 60 * 1000; // 1 hour tolerance
      
      if (firstCandle.getTime() > start.getTime() + tolerance ||
          lastCandle.getTime() < end.getTime() - tolerance) {
        logger.warn('Time range coverage issue', {
          timeframe,
          requestedStart: start.toISOString(),
          requestedEnd: end.toISOString(),
          actualStart: firstCandle.toISOString(),
          actualEnd: lastCandle.toISOString()
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Get data for specific analysis window (20 hours by default)
   */
  static async getAnalysisWindowData(
    symbol: string,
    endTime: Date,
    windowHours: number = 20
  ): Promise<{ [key: string]: DataResponse }> {
    const window = DateUtils.getAnalysisWindow(endTime, windowHours);
    
    logger.info('Fetching analysis window data', {
      symbol,
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      windowHours
    });

    return this.fetchMultiTimeframeData(symbol, window.start, window.end);
  }

  /**
   * Validate symbol format
   */
  static validateSymbol(symbol: string): boolean {
    // Basic forex pair validation (e.g., EURUSD, GBPJPY)
    const forexPattern = /^[A-Z]{6}$/;
    return forexPattern.test(symbol.toUpperCase());
  }

  /**
   * Get available timeframes
   */
  static getAvailableTimeframes(): string[] {
    return ['M5', 'M15', 'H1', 'H4', 'D1'];
  }

  /**
   * Calculate expected candle count for timeframe and duration
   */
  static calculateExpectedCandleCount(
    timeframe: string,
    start: Date,
    end: Date
  ): number {
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = durationMs / (1000 * 60);

    const timeframeMinutes: { [key: string]: number } = {
      'M5': 5,
      'M15': 15,
      'H1': 60,
      'H4': 240,
      'D1': 1440
    };

    const tfMinutes = timeframeMinutes[timeframe];
    if (!tfMinutes) return 0;

    return Math.floor(durationMinutes / tfMinutes);
  }

  /**
   * Utility function for delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get data quality metrics
   */
  static analyzeDataQuality(data: OHLCVCandle[]): {
    totalCandles: number;
    missingCandles: number;
    gapCount: number;
    averageSpread: number;
    qualityScore: number;
  } {
    if (data.length === 0) {
      return {
        totalCandles: 0,
        missingCandles: 0,
        gapCount: 0,
        averageSpread: 0,
        qualityScore: 0
      };
    }

    const totalCandles = data.length;
    let gapCount = 0;
    let totalSpread = 0;

    for (let i = 1; i < data.length; i++) {
      const prevTime = new Date(data[i - 1].time).getTime();
      const currentTime = new Date(data[i].time).getTime();
      const expectedInterval = 15 * 60 * 1000; // 15 minutes for M15

      if (currentTime - prevTime > expectedInterval * 1.5) {
        gapCount++;
      }

      totalSpread += data[i].spread;
    }

    const averageSpread = totalSpread / totalCandles;
    const qualityScore = Math.max(0, 100 - (gapCount * 10) - (averageSpread > 5 ? 20 : 0));

    return {
      totalCandles,
      missingCandles: gapCount, // Simplified calculation
      gapCount,
      averageSpread,
      qualityScore
    };
  }
}

export default DataService;
