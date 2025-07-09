export interface TradeAnalysis {
  analysisId: string;
  timestamp: Date;
  aiAnalysisStage1: string; // Narrative analysis from Gemini Pro
  aiAnalysisStage2: string; // Decision extraction from Gemini Flash
  chartImages: {
    image1h: string; // Base64 or URL
    image5m: string;
    image15m_ema: string;
    image15m_bb: string;
  };
  ohlcvData: {
    h1: OHLCVCandle[];
    m15: OHLCVCandle[];
    m5: OHLCVCandle[];
  };
  decision: 'TRADE' | 'NO_TRADE';
  confidence: number;
  reasoning: string;
}

export interface OHLCVCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
  real_volume: number;
  spread: number;
}

export interface PendingOrder {
  orderId: string;
  type: 'BUY_STOP' | 'SELL_STOP' | 'BUY_LIMIT' | 'SELL_LIMIT';
  price: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  createdAt: Date;
  expiresAt: Date;
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'EXPIRED';
  analysisId: string; // Reference to the analysis that triggered this order
}

export interface ActivePosition {
  positionId: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  openedAt: Date;
  closedAt?: Date;
  exitPrice?: number;
  status: 'OPEN' | 'CLOSED';
  pnl?: number;
  analysisId: string; // Reference to the analysis that triggered this position
}

export interface Trade {
  tradeId: string;
  sessionId: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  openedAt: Date;
  closedAt: Date;
  duration: number; // in minutes
  pnl: number;
  pnlPercent: number;
  status: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'EXPIRED';
  analysisId: string;
  commission: number;
  swap: number;
  netPnl: number;
}

export interface TradeMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  averageTradeDuration: number;
  totalPnl: number;
  totalCommission: number;
  totalSwap: number;
  netPnl: number;
}

export class TradeCalculator {
  /**
   * Calculate PnL for a trade
   */
  static calculatePnL(
    type: 'BUY' | 'SELL',
    entryPrice: number,
    exitPrice: number,
    lotSize: number,
    pipValue: number = 1 // Default pip value, can be adjusted per pair
  ): number {
    let pips: number;
    
    if (type === 'BUY') {
      pips = (exitPrice - entryPrice) / 0.0001; // Assuming 4-digit pairs
    } else {
      pips = (entryPrice - exitPrice) / 0.0001;
    }
    
    return pips * pipValue * lotSize;
  }

  /**
   * Calculate percentage return
   */
  static calculatePnLPercent(pnl: number, accountBalance: number): number {
    return (pnl / accountBalance) * 100;
  }

  /**
   * Calculate trade metrics from array of trades
   */
  static calculateMetrics(trades: Trade[]): TradeMetrics {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        profitFactor: 0,
        averageWin: 0,
        averageLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        averageTradeDuration: 0,
        totalPnl: 0,
        totalCommission: 0,
        totalSwap: 0,
        netPnl: 0
      };
    }

    const winningTrades = trades.filter(t => t.status === 'WIN');
    const losingTrades = trades.filter(t => t.status === 'LOSS');
    
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalCommission = trades.reduce((sum, t) => sum + t.commission, 0);
    const totalSwap = trades.reduce((sum, t) => sum + t.swap, 0);
    const netPnl = totalPnl - totalCommission - totalSwap;

    const grossWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    
    const averageWin = winningTrades.length > 0 ? grossWin / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
    
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;
    
    const averageTradeDuration = trades.reduce((sum, t) => sum + t.duration, 0) / trades.length;

    // Calculate consecutive wins/losses
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    trades.forEach(trade => {
      if (trade.status === 'WIN') {
        currentWinStreak++;
        currentLossStreak = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
      } else if (trade.status === 'LOSS') {
        currentLossStreak++;
        currentWinStreak = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
      }
    });

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: (winningTrades.length / trades.length) * 100,
      profitFactor,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      averageTradeDuration,
      totalPnl,
      totalCommission,
      totalSwap,
      netPnl
    };
  }

  /**
   * Determine trade status based on PnL
   */
  static determineTradeStatus(pnl: number): 'WIN' | 'LOSS' | 'BREAKEVEN' {
    if (pnl > 0) return 'WIN';
    if (pnl < 0) return 'LOSS';
    return 'BREAKEVEN';
  }

  /**
   * Calculate trade duration in minutes
   */
  static calculateDuration(openedAt: Date, closedAt: Date): number {
    return Math.floor((closedAt.getTime() - openedAt.getTime()) / (1000 * 60));
  }
}

export default Trade;
