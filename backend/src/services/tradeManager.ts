import { PendingOrder, ActivePosition, Trade, TradeCalculator } from '../models/Trade';
import { OHLCVCandle } from '../models/Trade';
import logger from '../utils/logger';
import { DateUtils } from '../utils/dateUtils';
import config from '../utils/configUtils';

export interface TradeManagerState {
  pendingOrders: PendingOrder[];
  activePosition: ActivePosition | null;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
}

export interface OrderExecutionResult {
  executed: boolean;
  trade?: Trade;
  error?: string;
}

export interface PositionUpdateResult {
  closed: boolean;
  trade?: Trade;
  reason?: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL';
}

export class TradeManager {
  private state: TradeManagerState;
  private readonly sessionId: string;
  private readonly symbol: string;
  private readonly orderExpiryMinutes: number;

  constructor(
    sessionId: string,
    symbol: string,
    initialBalance: number
  ) {
    this.sessionId = sessionId;
    this.symbol = symbol;
    this.orderExpiryMinutes = config.simulation.orderExpiryMinutes;
    
    this.state = {
      pendingOrders: [],
      activePosition: null,
      balance: initialBalance,
      equity: initialBalance,
      margin: 0,
      freeMargin: initialBalance
    };

    logger.info('Trade manager initialized', {
      sessionId,
      symbol,
      initialBalance
    });
  }

  /**
   * Add a new pending order
   */
  addPendingOrder(
    type: 'BUY_STOP' | 'SELL_STOP' | 'BUY_LIMIT' | 'SELL_LIMIT',
    price: number,
    stopLoss: number,
    takeProfit: number,
    lotSize: number,
    analysisId: string,
    currentTime: Date
  ): string {
    const orderId = this.generateOrderId();
    const expiresAt = DateUtils.addMinutes(currentTime, this.orderExpiryMinutes);

    const order: PendingOrder = {
      orderId,
      type,
      price,
      stopLoss,
      takeProfit,
      lotSize,
      createdAt: currentTime,
      expiresAt,
      status: 'PENDING',
      analysisId
    };

    this.state.pendingOrders.push(order);

    logger.info('Pending order added', {
      sessionId: this.sessionId,
      orderId,
      type,
      price,
      analysisId
    });

    return orderId;
  }

  /**
   * Update trade manager state with new candle data
   */
  updateWithCandle(candle: OHLCVCandle): {
    orderExecutions: OrderExecutionResult[];
    positionUpdate: PositionUpdateResult | null;
  } {
    const candleTime = new Date(candle.time);
    const orderExecutions: OrderExecutionResult[] = [];
    let positionUpdate: PositionUpdateResult | null = null;

    // 1. Check and execute pending orders
    for (const order of this.state.pendingOrders) {
      if (order.status === 'PENDING') {
        const executionResult = this.checkOrderExecution(order, candle, candleTime);
        if (executionResult.executed) {
          orderExecutions.push(executionResult);
        }
      }
    }

    // 2. Update active position
    if (this.state.activePosition) {
      positionUpdate = this.updateActivePosition(this.state.activePosition, candle, candleTime);
    }

    // 3. Clean up expired orders
    this.cleanupExpiredOrders(candleTime);

    // 4. Update equity and margin calculations
    this.updateEquityAndMargin(candle);

    return {
      orderExecutions,
      positionUpdate
    };
  }

  /**
   * Check if a pending order should be executed
   */
  private checkOrderExecution(
    order: PendingOrder,
    candle: OHLCVCandle,
    currentTime: Date
  ): OrderExecutionResult {
    // Check if order has expired
    if (currentTime >= order.expiresAt) {
      order.status = 'EXPIRED';
      logger.info('Order expired', {
        sessionId: this.sessionId,
        orderId: order.orderId
      });
      return { executed: false, error: 'Order expired' };
    }

    // Check if we already have an active position
    if (this.state.activePosition) {
      return { executed: false, error: 'Active position exists' };
    }

    let shouldExecute = false;

    // Check execution conditions based on order type
    switch (order.type) {
      case 'BUY_STOP':
        shouldExecute = candle.high >= order.price;
        break;
      case 'SELL_STOP':
        shouldExecute = candle.low <= order.price;
        break;
      case 'BUY_LIMIT':
        shouldExecute = candle.low <= order.price;
        break;
      case 'SELL_LIMIT':
        shouldExecute = candle.high >= order.price;
        break;
    }

    if (shouldExecute) {
      return this.executeOrder(order, candle, currentTime);
    }

    return { executed: false };
  }

  /**
   * Execute a pending order
   */
  private executeOrder(
    order: PendingOrder,
    candle: OHLCVCandle,
    currentTime: Date
  ): OrderExecutionResult {
    try {
      // Determine execution price (could be improved with slippage modeling)
      let executionPrice = order.price;
      
      // For market orders or when price is within candle range
      if (order.type.includes('STOP')) {
        executionPrice = order.price;
      } else {
        executionPrice = order.price;
      }

      // Create active position
      const positionId = this.generatePositionId();
      const positionType = order.type.includes('BUY') ? 'BUY' : 'SELL';

      this.state.activePosition = {
        positionId,
        type: positionType,
        entryPrice: executionPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        lotSize: order.lotSize,
        openedAt: currentTime,
        status: 'OPEN',
        analysisId: order.analysisId
      };

      // Update order status
      order.status = 'EXECUTED';

      // Calculate margin requirement
      this.updateMarginRequirement();

      logger.info('Order executed', {
        sessionId: this.sessionId,
        orderId: order.orderId,
        positionId,
        type: positionType,
        executionPrice,
        lotSize: order.lotSize
      });

      return {
        executed: true,
        trade: undefined // Trade will be created when position is closed
      };

    } catch (error) {
      logger.error('Failed to execute order', {
        sessionId: this.sessionId,
        orderId: order.orderId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        executed: false,
        error: error instanceof Error ? error.message : 'Execution failed'
      };
    }
  }

  /**
   * Update active position and check for closure conditions
   */
  private updateActivePosition(
    position: ActivePosition,
    candle: OHLCVCandle,
    currentTime: Date
  ): PositionUpdateResult | null {
    let shouldClose = false;
    let closePrice = 0;
    let reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' = 'MANUAL';

    // Check stop loss
    if (position.type === 'BUY' && candle.low <= position.stopLoss) {
      shouldClose = true;
      closePrice = position.stopLoss;
      reason = 'STOP_LOSS';
    } else if (position.type === 'SELL' && candle.high >= position.stopLoss) {
      shouldClose = true;
      closePrice = position.stopLoss;
      reason = 'STOP_LOSS';
    }

    // Check take profit
    if (!shouldClose) {
      if (position.type === 'BUY' && candle.high >= position.takeProfit) {
        shouldClose = true;
        closePrice = position.takeProfit;
        reason = 'TAKE_PROFIT';
      } else if (position.type === 'SELL' && candle.low <= position.takeProfit) {
        shouldClose = true;
        closePrice = position.takeProfit;
        reason = 'TAKE_PROFIT';
      }
    }

    if (shouldClose) {
      return this.closePosition(position, closePrice, currentTime, reason);
    }

    return null;
  }

  /**
   * Close active position and create trade record
   */
  private closePosition(
    position: ActivePosition,
    exitPrice: number,
    currentTime: Date,
    reason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL'
  ): PositionUpdateResult {
    try {
      // Calculate PnL
      const pnl = TradeCalculator.calculatePnL(
        position.type,
        position.entryPrice,
        exitPrice,
        position.lotSize
      );

      // Calculate commission and swap (simplified)
      const commission = this.calculateCommission(position.lotSize);
      const swap = this.calculateSwap(position, currentTime);
      const netPnl = pnl - commission - swap;

      // Update balance
      this.state.balance += netPnl;

      // Create trade record
      const trade: Trade = {
        tradeId: this.generateTradeId(),
        sessionId: this.sessionId,
        type: position.type,
        entryPrice: position.entryPrice,
        exitPrice,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        lotSize: position.lotSize,
        openedAt: position.openedAt,
        closedAt: currentTime,
        duration: TradeCalculator.calculateDuration(position.openedAt, currentTime),
        pnl,
        pnlPercent: TradeCalculator.calculatePnLPercent(netPnl, this.state.balance - netPnl),
        status: TradeCalculator.determineTradeStatus(pnl),
        exitReason: reason,
        analysisId: position.analysisId,
        commission,
        swap,
        netPnl
      };

      // Clear active position
      this.state.activePosition = null;

      // Update margin
      this.updateMarginRequirement();

      logger.info('Position closed', {
        sessionId: this.sessionId,
        positionId: position.positionId,
        tradeId: trade.tradeId,
        pnl: netPnl,
        reason,
        newBalance: this.state.balance
      });

      return {
        closed: true,
        trade,
        reason
      };

    } catch (error) {
      logger.error('Failed to close position', {
        sessionId: this.sessionId,
        positionId: position.positionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        closed: false,
        reason
      };
    }
  }

  /**
   * Clean up expired orders
   */
  private cleanupExpiredOrders(currentTime: Date): void {
    const expiredOrders = this.state.pendingOrders.filter(
      order => order.status === 'PENDING' && currentTime >= order.expiresAt
    );

    expiredOrders.forEach(order => {
      order.status = 'EXPIRED';
      logger.debug('Order expired during cleanup', {
        sessionId: this.sessionId,
        orderId: order.orderId
      });
    });
  }

  /**
   * Update equity and margin calculations
   */
  private updateEquityAndMargin(candle: OHLCVCandle): void {
    let unrealizedPnL = 0;

    if (this.state.activePosition) {
      // Calculate unrealized PnL using current price (close price of candle)
      unrealizedPnL = TradeCalculator.calculatePnL(
        this.state.activePosition.type,
        this.state.activePosition.entryPrice,
        candle.close,
        this.state.activePosition.lotSize
      );
    }

    this.state.equity = this.state.balance + unrealizedPnL;
    this.state.freeMargin = this.state.equity - this.state.margin;
  }

  /**
   * Update margin requirement
   */
  private updateMarginRequirement(): void {
    if (this.state.activePosition) {
      // Simplified margin calculation (1:100 leverage)
      const leverage = 100;
      const contractSize = 100000; // Standard lot size
      this.state.margin = (this.state.activePosition.lotSize * contractSize * this.state.activePosition.entryPrice) / leverage;
    } else {
      this.state.margin = 0;
    }
  }

  /**
   * Calculate commission for trade
   */
  private calculateCommission(lotSize: number): number {
    // Simplified commission calculation
    const commissionPerLot = 7; // $7 per lot
    return lotSize * commissionPerLot;
  }

  /**
   * Calculate swap for position
   */
  private calculateSwap(position: ActivePosition, currentTime: Date): number {
    // Simplified swap calculation
    const durationHours = (currentTime.getTime() - position.openedAt.getTime()) / (1000 * 60 * 60);
    const swapPerLotPerDay = position.type === 'BUY' ? -2 : 1; // Simplified swap rates
    
    if (durationHours >= 24) {
      const days = Math.floor(durationHours / 24);
      return position.lotSize * swapPerLotPerDay * days;
    }
    
    return 0;
  }

  /**
   * Get current state
   */
  getState(): TradeManagerState {
    return { ...this.state };
  }

  /**
   * Check if can place new order
   */
  canPlaceOrder(): boolean {
    return this.state.activePosition === null && this.state.freeMargin > 0;
  }

  /**
   * Get pending orders count
   */
  getPendingOrdersCount(): number {
    return this.state.pendingOrders.filter(order => order.status === 'PENDING').length;
  }

  /**
   * Cancel pending order
   */
  cancelOrder(orderId: string): boolean {
    const order = this.state.pendingOrders.find(o => o.orderId === orderId);
    if (order && order.status === 'PENDING') {
      order.status = 'CANCELLED';
      logger.info('Order cancelled', {
        sessionId: this.sessionId,
        orderId
      });
      return true;
    }
    return false;
  }

  /**
   * Generate unique order ID
   */
  private generateOrderId(): string {
    return `order_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Generate unique position ID
   */
  private generatePositionId(): string {
    return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Generate unique trade ID
   */
  private generateTradeId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Get trade statistics
   */
  getTradeStatistics(): {
    totalOrders: number;
    executedOrders: number;
    expiredOrders: number;
    cancelledOrders: number;
    currentBalance: number;
    currentEquity: number;
    marginUsed: number;
    freeMargin: number;
  } {
    const totalOrders = this.state.pendingOrders.length;
    const executedOrders = this.state.pendingOrders.filter(o => o.status === 'EXECUTED').length;
    const expiredOrders = this.state.pendingOrders.filter(o => o.status === 'EXPIRED').length;
    const cancelledOrders = this.state.pendingOrders.filter(o => o.status === 'CANCELLED').length;

    return {
      totalOrders,
      executedOrders,
      expiredOrders,
      cancelledOrders,
      currentBalance: this.state.balance,
      currentEquity: this.state.equity,
      marginUsed: this.state.margin,
      freeMargin: this.state.freeMargin
    };
  }
}

export default TradeManager;
