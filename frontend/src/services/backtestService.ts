import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export interface BacktestConfiguration {
  symbol: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
  skipCandles: number;
  analysisWindowHours: number;
  analysisPrompt: string;
  extractorPrompt: string;
}

export interface BacktestSession {
  sessionId: string;
  symbol: string;
  startDate: string;
  endDate: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  completedAt?: string;
  totalTrades: number;
  winRate: number;
  netProfitLoss: number;
  profitFactor: number;
  maxDrawdown: number;
}

export interface DetailedBacktestReport {
  metadata: {
    test_id: string;
    pair: string;
    start_date: string;
    end_date: string;
    initial_balance: number;
    skip_candles: number;
    analysis_window_hours: number;
    created_at: string;
    completed_at?: string;
    status: string;
    user_id?: string;
    prompts: {
      analysis_prompt: string;
      extractor_prompt: string;
    };
  };
  performance_summary: {
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
  };
  trades: Trade[];
  equity_curve: EquityPoint[];
  analysis_logs: string[];
  error_logs: string[];
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
  openedAt: string;
  closedAt: string;
  duration: number;
  pnl: number;
  pnlPercent: number;
  status: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'EXPIRED';
  analysisId: string;
  commission: number;
  swap: number;
  netPnl: number;
}

export interface EquityPoint {
  timestamp: string;
  balance: number;
  equity: number;
  drawdown: number;
  drawdown_percent: number;
}

export interface BacktestStatus {
  sessionId: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  totalTrades: number;
  currentBalance: number;
  progress: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DefaultPrompts {
  analysisPrompt: string;
  extractorPrompt: string;
}

export interface BacktestStats {
  totalBacktests: number;
  completedBacktests: number;
  runningBacktests: number;
  failedBacktests: number;
  totalTrades: number;
  winningTrades: number;
  totalPnL: number;
  averageWinRate: number;
  bestSession: any;
  worstSession: any;
  favoriteSymbols: string[];
  recentActivity: any[];
}

class BacktestService {
  private api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  constructor() {
    // Add request interceptor to include auth token
    this.api.interceptors.request.use(
      (config: any) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: any) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor to handle auth errors
    this.api.interceptors.response.use(
      (response: any) => response,
      (error: any) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  async runBacktest(config: BacktestConfiguration): Promise<ApiResponse<{ sessionId: string; status: string }>> {
    try {
      const response = await this.api.post('/backtest/run', config);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to start backtest',
      };
    }
  }

  async getReports(): Promise<ApiResponse<{ sessions: BacktestSession[]; total: number }>> {
    try {
      const response = await this.api.get('/backtest/reports');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get reports',
      };
    }
  }

  async getReportById(sessionId: string): Promise<ApiResponse<DetailedBacktestReport>> {
    try {
      const response = await this.api.get(`/backtest/reports/${sessionId}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get report',
      };
    }
  }

  async getBacktestStatus(sessionId: string): Promise<ApiResponse<BacktestStatus>> {
    try {
      const response = await this.api.get(`/backtest/status/${sessionId}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get status',
      };
    }
  }

  async deleteSession(sessionId: string): Promise<ApiResponse> {
    try {
      const response = await this.api.delete(`/backtest/sessions/${sessionId}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to delete session',
      };
    }
  }

  async validateSymbol(symbol: string): Promise<ApiResponse<{ symbol: string; isValid: boolean; message: string }>> {
    try {
      const response = await this.api.get(`/backtest/validate-symbol/${symbol}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to validate symbol',
      };
    }
  }

  async getDefaultPrompts(): Promise<ApiResponse<DefaultPrompts>> {
    try {
      const response = await this.api.get('/backtest/default-prompts');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get default prompts',
      };
    }
  }

  async getStats(): Promise<ApiResponse<BacktestStats>> {
    try {
      const response = await this.api.get('/backtest/stats');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to get stats',
      };
    }
  }

  // Utility methods
  formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  formatPercentage(value: number, decimals: number = 2): string {
    return `${value.toFixed(decimals)}%`;
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}m`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    } else {
      const days = Math.floor(minutes / 1440);
      const remainingHours = Math.floor((minutes % 1440) / 60);
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
  }

  calculateWinRate(winningTrades: number, totalTrades: number): number {
    return totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  }

  calculateProfitFactor(grossProfit: number, grossLoss: number): number {
    return grossLoss > 0 ? grossProfit / Math.abs(grossLoss) : grossProfit > 0 ? Infinity : 0;
  }

  getTradeStatusColor(status: string): string {
    switch (status) {
      case 'WIN':
        return '#4caf50';
      case 'LOSS':
        return '#f44336';
      case 'BREAKEVEN':
        return '#ff9800';
      default:
        return '#757575';
    }
  }

  getSessionStatusColor(status: string): string {
    switch (status) {
      case 'COMPLETED':
        return '#4caf50';
      case 'RUNNING':
        return '#2196f3';
      case 'FAILED':
        return '#f44336';
      case 'CANCELLED':
        return '#ff9800';
      default:
        return '#757575';
    }
  }
}

export const backtestService = new BacktestService();
export default backtestService;
