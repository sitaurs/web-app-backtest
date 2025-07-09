import { BacktestSession, BacktestSessionManager } from '../models/BacktestSession';
import { Trade } from '../models/Trade';
import { DataService } from './dataService';
import { ChartService } from './chartService';
import { AIService, AIAnalysisRequest } from './aiService';
import { TradeManager } from './tradeManager';
import { CacheService } from './cacheService';
import { DateUtils } from '../utils/dateUtils';
import config from '../utils/configUtils';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';

export interface BacktestConfiguration {
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialBalance: number;
  skipCandles: number;
  analysisWindowHours: number;
  prompts: {
    analysisPrompt: string;
    extractorPrompt: string;
  };
  userId?: string;
}

export interface SimulationProgress {
  sessionId: string;
  currentCandle: number;
  totalCandles: number;
  completedAnalyses: number;
  tradesExecuted: number;
  currentBalance: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  estimatedTimeRemaining: number;
}

export class SimulationEngine {
  private static readonly RESULTS_DIR = path.join(__dirname, '../../results');
  private static readonly ANALYSIS_DIR = path.join(__dirname, '../../analysis');

  /**
   * Initialize simulation engine
   */
  static async initialize(): Promise<void> {
    try {
      // Create results and analysis directories
      if (!fs.existsSync(this.RESULTS_DIR)) {
        fs.mkdirSync(this.RESULTS_DIR, { recursive: true });
      }
      
      if (!fs.existsSync(this.ANALYSIS_DIR)) {
        fs.mkdirSync(this.ANALYSIS_DIR, { recursive: true });
      }

      // Initialize cache service
      await CacheService.initialize();

      logger.info('Simulation engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize simulation engine', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Run backtest simulation - Main orchestrator function
   */
  static async runBacktest(config: BacktestConfiguration): Promise<{
    success: boolean;
    sessionId?: string;
    error?: string;
  }> {
    let session: BacktestSession | null = null;
    let tradeManager: TradeManager | null = null;

    try {
      logger.info('Starting backtest simulation', {
        symbol: config.symbol,
        startDate: config.startDate.toISOString(),
        endDate: config.endDate.toISOString(),
        initialBalance: config.initialBalance
      });

      // Validate configuration
      const validation = this.validateConfiguration(config);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Create backtest session
      session = BacktestSessionManager.createSession(
        config.symbol,
        config.startDate,
        config.endDate,
        config.initialBalance,
        config.skipCandles,
        config.analysisWindowHours,
        {
          analysis_prompt: config.prompts.analysisPrompt,
          extractor_prompt: config.prompts.extractorPrompt
        },
        config.userId
      );

      // Initialize trade manager
      tradeManager = new TradeManager(
        session.metadata.test_id,
        config.symbol,
        config.initialBalance
      );

      // Fetch M15 data for entire simulation period
      logger.info('Fetching M15 data for simulation period');
      const m15DataResponse = await DataService.fetchOHLCVData({
        symbol: config.symbol,
        timeframe: 'M15',
        start: config.startDate,
        end: config.endDate
      });

      if (!m15DataResponse.success || m15DataResponse.data.length === 0) {
        throw new Error('Failed to fetch M15 data for simulation');
      }

      const m15Candles = m15DataResponse.data;
      logger.info('M15 data fetched successfully', {
        candleCount: m15Candles.length,
        sessionId: session.metadata.test_id
      });

      // Main simulation loop
      let currentIndex = 0;
      let analysisCount = 0;
      const startTime = Date.now();

      while (currentIndex < m15Candles.length) {
        const currentCandle = m15Candles[currentIndex];
        const currentTime = new Date(currentCandle.time);

        try {
          // Update trade manager with current candle
          const tradeUpdate = tradeManager.updateWithCandle(currentCandle);

          // Process completed trades
          if (tradeUpdate.positionUpdate?.closed && tradeUpdate.positionUpdate.trade) {
            BacktestSessionManager.addTrade(session, tradeUpdate.positionUpdate.trade);
            this.saveTradeToFile(session.metadata.test_id, tradeUpdate.positionUpdate.trade);
          }

          // Check if we need to perform analysis (no active position)
          if (tradeManager.canPlaceOrder()) {
            const analysisResult = await this.performAnalysisCycle(
              config,
              session,
              currentTime,
              analysisCount
            );

            if (analysisResult.success && analysisResult.decision === 'TRADE' && analysisResult.tradeDetails) {
              // Place pending order based on AI decision
              const orderId = tradeManager.addPendingOrder(
                this.determineOrderType(analysisResult.tradeDetails),
                analysisResult.tradeDetails.entryPrice,
                analysisResult.tradeDetails.stopLoss,
                analysisResult.tradeDetails.takeProfit,
                analysisResult.tradeDetails.lotSize,
                analysisResult.analysisId,
                currentTime
              );

              logger.info('Order placed based on AI analysis', {
                sessionId: session.metadata.test_id,
                orderId,
                analysisId: analysisResult.analysisId
              });
            }

            if (analysisResult.success) {
              analysisCount++;
              BacktestSessionManager.addAnalysisLog(session, analysisResult.analysisId);

              // Skip candles if decision is NO_TRADE
              if (analysisResult.decision === 'NO_TRADE') {
                currentIndex += config.skipCandles;
                logger.debug('Skipping candles due to NO_TRADE decision', {
                  sessionId: session.metadata.test_id,
                  skippedCandles: config.skipCandles
                });
                continue;
              }
            } else {
              BacktestSessionManager.addErrorLog(session, `Analysis failed: ${analysisResult.error}`);
            }
          }

          // Progress to next candle
          currentIndex++;

          // Log progress periodically
          if (currentIndex % 100 === 0) {
            const progress = this.calculateProgress(
              session.metadata.test_id,
              currentIndex,
              m15Candles.length,
              analysisCount,
              session.trades.length,
              tradeManager.getState().balance,
              startTime
            );

            logger.info('Simulation progress', progress);
          }

        } catch (error) {
          logger.error('Error in simulation loop', {
            sessionId: session.metadata.test_id,
            currentIndex,
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          BacktestSessionManager.addErrorLog(
            session,
            `Loop error at candle ${currentIndex}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );

          // Continue with next candle
          currentIndex++;
        }
      }

      // Complete the session
      BacktestSessionManager.completeSession(session);
      BacktestSessionManager.calculateAdvancedMetrics(session);

      // Save final results
      await this.saveSessionResults(session);

      const duration = Date.now() - startTime;
      logger.info('Backtest simulation completed successfully', {
        sessionId: session.metadata.test_id,
        duration,
        totalTrades: session.trades.length,
        finalBalance: session.performance_summary.net_profit_loss + config.initialBalance,
        winRate: session.performance_summary.win_rate_percent
      });

      return {
        success: true,
        sessionId: session.metadata.test_id
      };

    } catch (error) {
      logger.error('Backtest simulation failed', {
        sessionId: session?.metadata.test_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (session) {
        BacktestSessionManager.failSession(session, error instanceof Error ? error.message : 'Unknown error');
        await this.saveSessionResults(session);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Perform single analysis cycle (20-hour window)
   */
  private static async performAnalysisCycle(
    config: BacktestConfiguration,
    session: BacktestSession,
    currentTime: Date,
    analysisCount: number
  ): Promise<{
    success: boolean;
    analysisId: string;
    decision?: 'TRADE' | 'NO_TRADE';
    tradeDetails?: any;
    error?: string;
  }> {
    try {
      logger.debug('Starting analysis cycle', {
        sessionId: session.metadata.test_id,
        currentTime: currentTime.toISOString(),
        analysisCount
      });

      // Get 20-hour analysis window
      const analysisWindow = DateUtils.getAnalysisWindow(currentTime, config.analysisWindowHours);

      // Fetch multi-timeframe OHLCV data
      const ohlcvData = await DataService.fetchMultiTimeframeData(
        config.symbol,
        analysisWindow.start,
        analysisWindow.end
      );

      // Validate data synchronization
      const allDataValid = Object.values(ohlcvData).every(response => response.success);
      if (!allDataValid) {
        throw new Error('Failed to fetch synchronized OHLCV data');
      }

      // Generate chart images
      const chartImages = await ChartService.generateAnalysisCharts(
        config.symbol,
        analysisWindow.start,
        analysisWindow.end
      );

      // Validate chart generation
      const allChartsValid = Object.values(chartImages).every(chart => chart.success);
      if (!allChartsValid) {
        logger.warn('Some charts failed to generate, proceeding with available charts', {
          sessionId: session.metadata.test_id
        });
      }

      // Prepare AI analysis request
      const aiRequest: AIAnalysisRequest = {
        symbol: config.symbol,
        ohlcvData: {
          h1: ohlcvData.H1?.data || [],
          m15: ohlcvData.M15?.data || [],
          m5: ohlcvData.M5?.data || []
        },
        chartImages,
        analysisPrompt: config.prompts.analysisPrompt,
        extractorPrompt: config.prompts.extractorPrompt,
        timestamp: currentTime
      };

      // Perform AI analysis
      const aiResponse = await AIService.performAnalysis(aiRequest);

      if (!aiResponse.success) {
        throw new Error(`AI analysis failed: ${aiResponse.error}`);
      }

      // Save analysis results
      await this.saveAnalysisResults(session.metadata.test_id, aiResponse);

      logger.debug('Analysis cycle completed', {
        sessionId: session.metadata.test_id,
        analysisId: aiResponse.analysisId,
        decision: aiResponse.stage2Response?.decision,
        processingTime: aiResponse.processingTime
      });

      return {
        success: true,
        analysisId: aiResponse.analysisId,
        decision: aiResponse.stage2Response?.decision,
        tradeDetails: aiResponse.stage2Response?.tradeDetails
      };

    } catch (error) {
      const analysisId = `failed_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      logger.error('Analysis cycle failed', {
        sessionId: session.metadata.test_id,
        analysisId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        analysisId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Determine order type based on trade details
   */
  private static determineOrderType(tradeDetails: any): 'BUY_STOP' | 'SELL_STOP' | 'BUY_LIMIT' | 'SELL_LIMIT' {
    // Simplified logic - can be enhanced based on AI recommendations
    if (tradeDetails.type === 'BUY') {
      return 'BUY_STOP'; // Assuming breakout strategy
    } else {
      return 'SELL_STOP'; // Assuming breakdown strategy
    }
  }

  /**
   * Calculate simulation progress
   */
  private static calculateProgress(
    sessionId: string,
    currentCandle: number,
    totalCandles: number,
    completedAnalyses: number,
    tradesExecuted: number,
    currentBalance: number,
    startTime: number
  ): SimulationProgress {
    const elapsed = Date.now() - startTime;
    const progress = currentCandle / totalCandles;
    const estimatedTotal = progress > 0 ? elapsed / progress : 0;
    const estimatedTimeRemaining = Math.max(0, estimatedTotal - elapsed);

    return {
      sessionId,
      currentCandle,
      totalCandles,
      completedAnalyses,
      tradesExecuted,
      currentBalance,
      status: 'RUNNING',
      estimatedTimeRemaining
    };
  }

  /**
   * Validate backtest configuration
   */
  private static validateConfiguration(config: BacktestConfiguration): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate symbol
    if (!DataService.validateSymbol(config.symbol)) {
      errors.push('Invalid symbol format');
    }

    // Validate date range
    const dateValidation = DateUtils.validateDateRange(config.startDate, config.endDate);
    if (!dateValidation.valid) {
      errors.push(dateValidation.error || 'Invalid date range');
    }

    // Validate balance
    if (config.initialBalance <= 0) {
      errors.push('Initial balance must be positive');
    }

    // Validate skip candles
    if (config.skipCandles < 1 || config.skipCandles > 100) {
      errors.push('Skip candles must be between 1 and 100');
    }

    // Validate analysis window
    if (config.analysisWindowHours < 1 || config.analysisWindowHours > 168) {
      errors.push('Analysis window must be between 1 and 168 hours');
    }

    // Validate prompts
    if (!config.prompts.analysisPrompt || config.prompts.analysisPrompt.length < 10) {
      errors.push('Analysis prompt is required and must be at least 10 characters');
    }

    if (!config.prompts.extractorPrompt || config.prompts.extractorPrompt.length < 10) {
      errors.push('Extractor prompt is required and must be at least 10 characters');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Save session results to file
   */
  private static async saveSessionResults(session: BacktestSession): Promise<void> {
    try {
      const filePath = path.join(this.RESULTS_DIR, `${session.metadata.test_id}.json`);
      const jsonData = JSON.stringify(session, null, 2);
      
      fs.writeFileSync(filePath, jsonData, 'utf8');
      
      logger.info('Session results saved', {
        sessionId: session.metadata.test_id,
        filePath
      });
    } catch (error) {
      logger.error('Failed to save session results', {
        sessionId: session.metadata.test_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Save individual trade to file
   */
  private static async saveTradeToFile(sessionId: string, trade: Trade): Promise<void> {
    try {
      const tradesDir = path.join(this.RESULTS_DIR, 'trades');
      if (!fs.existsSync(tradesDir)) {
        fs.mkdirSync(tradesDir, { recursive: true });
      }

      const filePath = path.join(tradesDir, `${sessionId}_${trade.tradeId}.json`);
      const jsonData = JSON.stringify(trade, null, 2);
      
      fs.writeFileSync(filePath, jsonData, 'utf8');
      
      logger.debug('Trade saved to file', {
        sessionId,
        tradeId: trade.tradeId,
        filePath
      });
    } catch (error) {
      logger.error('Failed to save trade to file', {
        sessionId,
        tradeId: trade.tradeId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Save analysis results to file
   */
  private static async saveAnalysisResults(sessionId: string, analysisResult: any): Promise<void> {
    try {
      const filePath = path.join(this.ANALYSIS_DIR, `${sessionId}_${analysisResult.analysisId}.json`);
      const jsonData = JSON.stringify(analysisResult, null, 2);
      
      fs.writeFileSync(filePath, jsonData, 'utf8');
      
      logger.debug('Analysis results saved', {
        sessionId,
        analysisId: analysisResult.analysisId,
        filePath
      });
    } catch (error) {
      logger.error('Failed to save analysis results', {
        sessionId,
        analysisId: analysisResult.analysisId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Load session results from file
   */
  static async loadSessionResults(sessionId: string): Promise<BacktestSession | null> {
    try {
      const filePath = path.join(this.RESULTS_DIR, `${sessionId}.json`);
      
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const jsonData = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(jsonData) as BacktestSession;
    } catch (error) {
      logger.error('Failed to load session results', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Get all session IDs
   */
  static async getAllSessionIds(): Promise<string[]> {
    try {
      if (!fs.existsSync(this.RESULTS_DIR)) {
        return [];
      }

      const files = fs.readdirSync(this.RESULTS_DIR);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      logger.error('Failed to get session IDs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Delete session results
   */
  static async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const filePath = path.join(this.RESULTS_DIR, `${sessionId}.json`);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('Session deleted', { sessionId });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to delete session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}

export default SimulationEngine;
