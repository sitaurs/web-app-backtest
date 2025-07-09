import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { SimulationEngine, BacktestConfiguration } from '../services/simulationEngine';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { CustomError, validationErrorHandler } from '../middlewares/errorHandler';
import logger from '../utils/logger';
import { DateUtils } from '../utils/dateUtils';

/**
 * Run a new backtest
 */
export const runBacktest = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      validationErrorHandler(errors.array());
    }

    const {
      symbol,
      startDate,
      endDate,
      initialBalance,
      skipCandles,
      analysisWindowHours,
      analysisPrompt,
      extractorPrompt
    } = req.body;

    logger.info('Backtest request received', {
      symbol,
      startDate,
      endDate,
      initialBalance,
      userId: req.user?.id
    });

    // Parse dates
    const parsedStartDate = DateUtils.parseDate(startDate);
    const parsedEndDate = DateUtils.parseDate(endDate);

    // Validate date range
    const dateValidation = DateUtils.validateDateRange(parsedStartDate, parsedEndDate);
    if (!dateValidation.valid) {
      throw new CustomError(dateValidation.error || 'Invalid date range', 400);
    }

    // Create backtest configuration
    const config: BacktestConfiguration = {
      symbol: symbol.toUpperCase(),
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      initialBalance: parseFloat(initialBalance),
      skipCandles: parseInt(skipCandles) || 6,
      analysisWindowHours: parseInt(analysisWindowHours) || 20,
      prompts: {
        analysisPrompt: analysisPrompt || getDefaultAnalysisPrompt(),
        extractorPrompt: extractorPrompt || getDefaultExtractorPrompt()
      },
      userId: req.user?.id
    };

    // Start backtest simulation
    const result = await SimulationEngine.runBacktest(config);

    if (result.success) {
      logger.info('Backtest started successfully', {
        sessionId: result.sessionId,
        userId: req.user?.id
      });

      res.status(200).json({
        success: true,
        message: 'Backtest started successfully',
        data: {
          sessionId: result.sessionId,
          status: 'RUNNING'
        }
      });
    } else {
      throw new CustomError(result.error || 'Failed to start backtest', 500);
    }

  } catch (error) {
    logger.error('Backtest request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * Get all backtest reports for the authenticated user
 */
export const getReports = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    
    logger.info('Reports request received', { userId });

    // Get all session IDs
    const sessionIds = await SimulationEngine.getAllSessionIds();
    
    // Load sessions and filter by user (if not admin)
    const sessions = [];
    for (const sessionId of sessionIds) {
      const session = await SimulationEngine.loadSessionResults(sessionId);
      if (session) {
        // Filter by user unless admin
        if (req.user?.role === 'ADMIN' || session.metadata.user_id === userId) {
          // Return summary data only
          sessions.push({
            sessionId: session.metadata.test_id,
            symbol: session.metadata.pair,
            startDate: session.metadata.start_date,
            endDate: session.metadata.end_date,
            status: session.metadata.status,
            createdAt: session.metadata.created_at,
            completedAt: session.metadata.completed_at,
            totalTrades: session.performance_summary.total_trades,
            winRate: session.performance_summary.win_rate_percent,
            netProfitLoss: session.performance_summary.net_profit_loss,
            profitFactor: session.performance_summary.profit_factor,
            maxDrawdown: session.performance_summary.max_drawdown_percent
          });
        }
      }
    }

    // Sort by creation date (newest first)
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    logger.info('Reports retrieved successfully', {
      userId,
      sessionCount: sessions.length
    });

    res.status(200).json({
      success: true,
      data: {
        sessions,
        total: sessions.length
      }
    });

  } catch (error) {
    logger.error('Failed to retrieve reports', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * Get detailed report for a specific session
 */
export const getReportById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    logger.info('Detailed report request received', {
      sessionId,
      userId
    });

    // Load session results
    const session = await SimulationEngine.loadSessionResults(sessionId);

    if (!session) {
      throw new CustomError('Session not found', 404);
    }

    // Check authorization (user can only view their own sessions unless admin)
    if (req.user?.role !== 'ADMIN' && session.metadata.user_id !== userId) {
      throw new CustomError('Not authorized to view this session', 403);
    }

    logger.info('Detailed report retrieved successfully', {
      sessionId,
      userId,
      totalTrades: session.trades.length
    });

    res.status(200).json({
      success: true,
      data: session
    });

  } catch (error) {
    logger.error('Failed to retrieve detailed report', {
      sessionId: req.params.sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * Delete a backtest session
 */
export const deleteSession = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    logger.info('Delete session request received', {
      sessionId,
      userId
    });

    // Load session to check ownership
    const session = await SimulationEngine.loadSessionResults(sessionId);

    if (!session) {
      throw new CustomError('Session not found', 404);
    }

    // Check authorization
    if (req.user?.role !== 'ADMIN' && session.metadata.user_id !== userId) {
      throw new CustomError('Not authorized to delete this session', 403);
    }

    // Delete session
    const deleted = await SimulationEngine.deleteSession(sessionId);

    if (deleted) {
      logger.info('Session deleted successfully', {
        sessionId,
        userId
      });

      res.status(200).json({
        success: true,
        message: 'Session deleted successfully'
      });
    } else {
      throw new CustomError('Failed to delete session', 500);
    }

  } catch (error) {
    logger.error('Failed to delete session', {
      sessionId: req.params.sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * Get backtest status
 */
export const getBacktestStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.id;

    logger.debug('Status request received', {
      sessionId,
      userId
    });

    // Load session results
    const session = await SimulationEngine.loadSessionResults(sessionId);

    if (!session) {
      throw new CustomError('Session not found', 404);
    }

    // Check authorization
    if (req.user?.role !== 'ADMIN' && session.metadata.user_id !== userId) {
      throw new CustomError('Not authorized to view this session', 403);
    }

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.metadata.test_id,
        status: session.metadata.status,
        createdAt: session.metadata.created_at,
        completedAt: session.metadata.completed_at,
        totalTrades: session.performance_summary.total_trades,
        currentBalance: session.metadata.initial_balance + session.performance_summary.net_profit_loss,
        progress: session.metadata.status === 'COMPLETED' ? 100 : 
                 session.metadata.status === 'RUNNING' ? 50 : 0
      }
    });

  } catch (error) {
    logger.error('Failed to get backtest status', {
      sessionId: req.params.sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * Get default analysis prompt
 */
function getDefaultAnalysisPrompt(): string {
  return `You are an expert forex trader and technical analyst. Analyze the provided multi-timeframe charts and OHLCV data to determine potential trading opportunities.

Consider the following in your analysis:
1. Multi-timeframe trend analysis (H1, M15, M5)
2. Key support and resistance levels
3. Technical indicator signals (EMA, RSI, Bollinger Bands)
4. Market structure and price action patterns
5. Volume and momentum analysis
6. Risk-reward potential

Provide a comprehensive narrative analysis explaining:
- Current market conditions and trend direction
- Key levels to watch
- Potential entry scenarios
- Risk factors and market sentiment
- Your confidence level in the analysis (1-100%)

Be thorough but concise in your analysis.`;
}

/**
 * Get default extractor prompt
 */
function getDefaultExtractorPrompt(): string {
  return `Based on the detailed analysis provided, extract a clear trading decision in the following format:

Decision: TRADE or NO_TRADE

If TRADE, provide:
- Type: BUY or SELL
- Entry Price: [specific price level]
- Stop Loss: [specific price level]
- Take Profit: [specific price level]
- Lot Size: [recommended lot size, default 0.1]
- Confidence: [1-100%]
- Reason: [brief explanation for the trade]

If NO_TRADE, provide:
- Confidence: [1-100%]
- Reason: [brief explanation why no trade is recommended]

Be precise and decisive in your extraction.`;
}

export default {
  runBacktest,
  getReports,
  getReportById,
  deleteSession,
  getBacktestStatus
};
