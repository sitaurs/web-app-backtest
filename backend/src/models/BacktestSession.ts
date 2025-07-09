import { Trade, TradeMetrics } from './Trade';

export interface BacktestMetadata {
  test_id: string;
  pair: string;
  prompt_file?: string;
  start_date: string;
  end_date: string;
  initial_balance: number;
  skip_candles: number;
  analysis_window_hours: number;
  created_at: Date;
  completed_at?: Date;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  user_id?: string;
  prompts: {
    analysis_prompt: string;
    extractor_prompt: string;
  };
}

export interface PerformanceSummary {
  net_profit_loss: number;
  net_profit_loss_percent: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate_percent: number;
  profit_factor: number;
  max_drawdown_percent: number;
  ai_analysis_failures: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  calmar_ratio?: number;
  recovery_factor?: number;
  average_trade_duration_minutes: number;
  largest_winning_trade: number;
  largest_losing_trade: number;
  average_winning_trade: number;
  average_losing_trade: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  total_commission: number;
  total_swap: number;
}

export interface EquityPoint {
  timestamp: Date;
  balance: number;
  equity: number;
  drawdown: number;
  drawdown_percent: number;
}

export interface BacktestSession {
  metadata: BacktestMetadata;
  performance_summary: PerformanceSummary;
  trades: Trade[];
  equity_curve: EquityPoint[];
  analysis_logs: string[]; // Array of analysis IDs for reference
  error_logs: string[];
}

export class BacktestSessionManager {
  /**
   * Create a new backtest session
   */
  static createSession(
    pair: string,
    startDate: Date,
    endDate: Date,
    initialBalance: number,
    skipCandles: number,
    analysisWindowHours: number,
    prompts: { analysis_prompt: string; extractor_prompt: string },
    userId?: string
  ): BacktestSession {
    const testId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    
    return {
      metadata: {
        test_id: testId,
        pair: pair.toUpperCase(),
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        initial_balance: initialBalance,
        skip_candles: skipCandles,
        analysis_window_hours: analysisWindowHours,
        created_at: new Date(),
        status: 'RUNNING',
        user_id: userId,
        prompts
      },
      performance_summary: {
        net_profit_loss: 0,
        net_profit_loss_percent: 0,
        total_trades: 0,
        winning_trades: 0,
        losing_trades: 0,
        win_rate_percent: 0,
        profit_factor: 0,
        max_drawdown_percent: 0,
        ai_analysis_failures: 0,
        average_trade_duration_minutes: 0,
        largest_winning_trade: 0,
        largest_losing_trade: 0,
        average_winning_trade: 0,
        average_losing_trade: 0,
        max_consecutive_wins: 0,
        max_consecutive_losses: 0,
        total_commission: 0,
        total_swap: 0
      },
      trades: [],
      equity_curve: [{
        timestamp: startDate,
        balance: initialBalance,
        equity: initialBalance,
        drawdown: 0,
        drawdown_percent: 0
      }],
      analysis_logs: [],
      error_logs: []
    };
  }

  /**
   * Update session with completed trade
   */
  static addTrade(session: BacktestSession, trade: Trade): void {
    session.trades.push(trade);
    this.updatePerformanceSummary(session);
    this.updateEquityCurve(session, trade);
  }

  /**
   * Update performance summary based on current trades
   */
  static updatePerformanceSummary(session: BacktestSession): void {
    const trades = session.trades;
    const initialBalance = session.metadata.initial_balance;
    
    if (trades.length === 0) return;

    const winningTrades = trades.filter(t => t.status === 'WIN');
    const losingTrades = trades.filter(t => t.status === 'LOSS');
    
    const totalPnl = trades.reduce((sum, t) => sum + t.netPnl, 0);
    const totalCommission = trades.reduce((sum, t) => sum + t.commission, 0);
    const totalSwap = trades.reduce((sum, t) => sum + t.swap, 0);
    
    const grossWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    
    // Calculate drawdown
    const maxDrawdown = this.calculateMaxDrawdown(session.equity_curve);
    
    // Calculate consecutive wins/losses
    const { maxWins, maxLosses } = this.calculateConsecutiveWinsLosses(trades);
    
    session.performance_summary = {
      net_profit_loss: totalPnl,
      net_profit_loss_percent: (totalPnl / initialBalance) * 100,
      total_trades: trades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      win_rate_percent: (winningTrades.length / trades.length) * 100,
      profit_factor: profitFactor,
      max_drawdown_percent: maxDrawdown,
      ai_analysis_failures: session.error_logs.length,
      average_trade_duration_minutes: trades.reduce((sum, t) => sum + t.duration, 0) / trades.length,
      largest_winning_trade: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0,
      largest_losing_trade: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0,
      average_winning_trade: winningTrades.length > 0 ? grossWin / winningTrades.length : 0,
      average_losing_trade: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
      max_consecutive_wins: maxWins,
      max_consecutive_losses: maxLosses,
      total_commission: totalCommission,
      total_swap: totalSwap
    };
  }

  /**
   * Update equity curve with new trade
   */
  static updateEquityCurve(session: BacktestSession, trade: Trade): void {
    const lastEquityPoint = session.equity_curve[session.equity_curve.length - 1];
    const newBalance = lastEquityPoint.balance + trade.netPnl;
    const peak = Math.max(...session.equity_curve.map(p => p.balance));
    const drawdown = peak - newBalance;
    const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;

    session.equity_curve.push({
      timestamp: trade.closedAt,
      balance: newBalance,
      equity: newBalance, // Assuming no open positions for simplicity
      drawdown: drawdown,
      drawdown_percent: drawdownPercent
    });
  }

  /**
   * Calculate maximum drawdown percentage
   */
  static calculateMaxDrawdown(equityCurve: EquityPoint[]): number {
    if (equityCurve.length === 0) return 0;
    
    let maxDrawdown = 0;
    let peak = equityCurve[0].balance;
    
    for (const point of equityCurve) {
      if (point.balance > peak) {
        peak = point.balance;
      }
      
      const drawdown = peak > 0 ? ((peak - point.balance) / peak) * 100 : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  /**
   * Calculate consecutive wins and losses
   */
  static calculateConsecutiveWinsLosses(trades: Trade[]): { maxWins: number; maxLosses: number } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const trade of trades) {
      if (trade.status === 'WIN') {
        currentWins++;
        currentLosses = 0;
        maxWins = Math.max(maxWins, currentWins);
      } else if (trade.status === 'LOSS') {
        currentLosses++;
        currentWins = 0;
        maxLosses = Math.max(maxLosses, currentLosses);
      } else {
        // BREAKEVEN
        currentWins = 0;
        currentLosses = 0;
      }
    }

    return { maxWins, maxLosses };
  }

  /**
   * Mark session as completed
   */
  static completeSession(session: BacktestSession): void {
    session.metadata.status = 'COMPLETED';
    session.metadata.completed_at = new Date();
  }

  /**
   * Mark session as failed
   */
  static failSession(session: BacktestSession, error: string): void {
    session.metadata.status = 'FAILED';
    session.metadata.completed_at = new Date();
    session.error_logs.push(`Session failed: ${error}`);
  }

  /**
   * Add analysis log
   */
  static addAnalysisLog(session: BacktestSession, analysisId: string): void {
    session.analysis_logs.push(analysisId);
  }

  /**
   * Add error log
   */
  static addErrorLog(session: BacktestSession, error: string): void {
    session.error_logs.push(`${new Date().toISOString()}: ${error}`);
  }

  /**
   * Calculate advanced metrics (Sharpe, Sortino, etc.)
   */
  static calculateAdvancedMetrics(session: BacktestSession): void {
    const returns = this.calculateReturns(session.equity_curve);
    
    if (returns.length === 0) return;

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    
    // Sharpe Ratio (assuming risk-free rate of 0)
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
    
    // Sortino Ratio (downside deviation)
    const negativeReturns = returns.filter(r => r < 0);
    const downsideDeviation = negativeReturns.length > 0 
      ? Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length)
      : 0;
    const sortinoRatio = downsideDeviation > 0 ? avgReturn / downsideDeviation : 0;
    
    // Calmar Ratio
    const maxDrawdown = session.performance_summary.max_drawdown_percent;
    const calmarRatio = maxDrawdown > 0 ? (avgReturn * 100) / maxDrawdown : 0;

    session.performance_summary.sharpe_ratio = sharpeRatio;
    session.performance_summary.sortino_ratio = sortinoRatio;
    session.performance_summary.calmar_ratio = calmarRatio;
  }

  /**
   * Calculate returns from equity curve
   */
  private static calculateReturns(equityCurve: EquityPoint[]): number[] {
    const returns: number[] = [];
    
    for (let i = 1; i < equityCurve.length; i++) {
      const prevBalance = equityCurve[i - 1].balance;
      const currentBalance = equityCurve[i].balance;
      
      if (prevBalance > 0) {
        const returnRate = (currentBalance - prevBalance) / prevBalance;
        returns.push(returnRate);
      }
    }
    
    return returns;
  }
}

export default BacktestSession;
