import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import {
  runBacktest,
  getReports,
  getReportById,
  deleteSession,
  getBacktestStatus
} from '../controllers/backtestController';
import { protect, authorize, requirePermission } from '../middlewares/authMiddleware';
import { asyncHandler } from '../middlewares/errorHandler';

const router = Router();

// Validation rules for backtest creation
const backtestValidation = [
  body('symbol')
    .isString()
    .isLength({ min: 6, max: 6 })
    .withMessage('Symbol must be exactly 6 characters (e.g., EURUSD)')
    .matches(/^[A-Z]{6}$/)
    .withMessage('Symbol must contain only uppercase letters'),
  
  body('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  body('endDate')
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  
  body('initialBalance')
    .isFloat({ min: 100, max: 1000000 })
    .withMessage('Initial balance must be between 100 and 1,000,000'),
  
  body('skipCandles')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Skip candles must be between 1 and 100'),
  
  body('analysisWindowHours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Analysis window must be between 1 and 168 hours'),
  
  body('analysisPrompt')
    .isString()
    .isLength({ min: 10, max: 5000 })
    .withMessage('Analysis prompt must be between 10 and 5000 characters'),
  
  body('extractorPrompt')
    .isString()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Extractor prompt must be between 10 and 2000 characters')
];

// Session ID validation
const sessionIdValidation = [
  param('sessionId')
    .isString()
    .matches(/^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/)
    .withMessage('Invalid session ID format')
];

/**
 * @route   POST /api/backtest/run
 * @desc    Start a new backtest simulation
 * @access  Private (authenticated users)
 */
router.post(
  '/run',
  protect,
  requirePermission('create_backtest'),
  backtestValidation,
  asyncHandler(runBacktest)
);

/**
 * @route   GET /api/backtest/reports
 * @desc    Get all backtest reports for the authenticated user
 * @access  Private (authenticated users)
 */
router.get(
  '/reports',
  protect,
  requirePermission('view_own_reports'),
  asyncHandler(getReports)
);

/**
 * @route   GET /api/backtest/reports/:sessionId
 * @desc    Get detailed report for a specific session
 * @access  Private (authenticated users, own sessions only unless admin)
 */
router.get(
  '/reports/:sessionId',
  protect,
  requirePermission('view_own_reports'),
  sessionIdValidation,
  asyncHandler(getReportById)
);

/**
 * @route   GET /api/backtest/status/:sessionId
 * @desc    Get backtest status and progress
 * @access  Private (authenticated users, own sessions only unless admin)
 */
router.get(
  '/status/:sessionId',
  protect,
  requirePermission('view_own_reports'),
  sessionIdValidation,
  asyncHandler(getBacktestStatus)
);

/**
 * @route   DELETE /api/backtest/sessions/:sessionId
 * @desc    Delete a backtest session
 * @access  Private (authenticated users, own sessions only unless admin)
 */
router.delete(
  '/sessions/:sessionId',
  protect,
  requirePermission('view_own_reports'),
  sessionIdValidation,
  asyncHandler(deleteSession)
);

/**
 * @route   GET /api/backtest/validate-symbol/:symbol
 * @desc    Validate forex symbol format
 * @access  Private (authenticated users)
 */
router.get(
  '/validate-symbol/:symbol',
  protect,
  param('symbol').isString().isLength({ min: 6, max: 6 }),
  asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const isValid = /^[A-Z]{6}$/.test(symbol);
    
    res.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        isValid,
        message: isValid ? 'Valid forex symbol' : 'Invalid symbol format'
      }
    });
  })
);

/**
 * @route   GET /api/backtest/default-prompts
 * @desc    Get default analysis and extractor prompts
 * @access  Private (authenticated users)
 */
router.get(
  '/default-prompts',
  protect,
  asyncHandler(async (req: Request, res: Response) => {
    const defaultPrompts = {
      analysisPrompt: `You are an expert forex trader and technical analyst. Analyze the provided multi-timeframe charts and OHLCV data to determine potential trading opportunities.

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

Be thorough but concise in your analysis.`,

      extractorPrompt: `Based on the detailed analysis provided, extract a clear trading decision in the following format:

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

Be precise and decisive in your extraction.`
    };

    res.json({
      success: true,
      data: defaultPrompts
    });
  })
);

/**
 * @route   GET /api/backtest/stats
 * @desc    Get user's backtest statistics
 * @access  Private (authenticated users)
 */
router.get(
  '/stats',
  protect,
  asyncHandler(async (req: Request, res: Response) => {
    // This would typically fetch from database
    // For now, return mock statistics
    const stats = {
      totalBacktests: 0,
      completedBacktests: 0,
      runningBacktests: 0,
      failedBacktests: 0,
      totalTrades: 0,
      winningTrades: 0,
      totalPnL: 0,
      averageWinRate: 0,
      bestSession: null,
      worstSession: null,
      favoriteSymbols: [],
      recentActivity: []
    };

    res.json({
      success: true,
      data: stats
    });
  })
);

export default router;
