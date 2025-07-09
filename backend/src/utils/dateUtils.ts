import moment from 'moment-timezone';

export interface TimeWindow {
  start: Date;
  end: Date;
}

export class DateUtils {
  /**
   * Parse date string to Date object
   */
  static parseDate(dateString: string): Date {
    return moment(dateString).toDate();
  }

  /**
   * Format date to ISO string
   */
  static formatToISO(date: Date): string {
    return moment(date).toISOString();
  }

  /**
   * Format date for API requests (MT5 format)
   */
  static formatForAPI(date: Date): string {
    return moment(date).format('YYYY-MM-DDTHH:mm:ss[Z]');
  }

  /**
   * Calculate 20-hour analysis window ending at the given time
   */
  static getAnalysisWindow(endTime: Date, windowHours: number = 20): TimeWindow {
    const end = moment(endTime);
    const start = end.clone().subtract(windowHours, 'hours');
    
    return {
      start: start.toDate(),
      end: end.toDate()
    };
  }

  /**
   * Add minutes to a date
   */
  static addMinutes(date: Date, minutes: number): Date {
    return moment(date).add(minutes, 'minutes').toDate();
  }

  /**
   * Add M15 candles (15-minute intervals) to a date
   */
  static addM15Candles(date: Date, candleCount: number): Date {
    return moment(date).add(candleCount * 15, 'minutes').toDate();
  }

  /**
   * Check if a date is within business hours (forex market hours)
   */
  static isMarketOpen(date: Date): boolean {
    const momentDate = moment(date);
    const dayOfWeek = momentDate.day(); // 0 = Sunday, 6 = Saturday
    const hour = momentDate.hour();

    // Forex market is closed on weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }

    // Basic market hours check (can be enhanced for different sessions)
    return hour >= 0 && hour < 24; // 24/7 for now, can be refined
  }

  /**
   * Get the difference in M15 candles between two dates
   */
  static getM15CandlesDifference(startDate: Date, endDate: Date): number {
    const start = moment(startDate);
    const end = moment(endDate);
    const diffMinutes = end.diff(start, 'minutes');
    return Math.floor(diffMinutes / 15);
  }

  /**
   * Round date to nearest M15 candle
   */
  static roundToM15(date: Date): Date {
    const momentDate = moment(date);
    const minutes = momentDate.minutes();
    const roundedMinutes = Math.floor(minutes / 15) * 15;
    
    return momentDate
      .minutes(roundedMinutes)
      .seconds(0)
      .milliseconds(0)
      .toDate();
  }

  /**
   * Generate array of M15 timestamps between start and end dates
   */
  static generateM15Timestamps(startDate: Date, endDate: Date): Date[] {
    const timestamps: Date[] = [];
    const current = moment(this.roundToM15(startDate));
    const end = moment(endDate);

    while (current.isSameOrBefore(end)) {
      timestamps.push(current.toDate());
      current.add(15, 'minutes');
    }

    return timestamps;
  }

  /**
   * Check if two dates are synchronized (same timestamp)
   */
  static areSynchronized(date1: Date, date2: Date): boolean {
    return moment(date1).isSame(moment(date2));
  }

  /**
   * Get timezone offset for a given date
   */
  static getTimezoneOffset(date: Date): number {
    return moment(date).utcOffset();
  }

  /**
   * Convert date to different timezone
   */
  static convertTimezone(date: Date, timezone: string): Date {
    return moment(date).tz(timezone).toDate();
  }

  /**
   * Validate date range for backtesting
   */
  static validateDateRange(startDate: Date, endDate: Date): { valid: boolean; error?: string } {
    const start = moment(startDate);
    const end = moment(endDate);
    const now = moment();

    if (!start.isValid()) {
      return { valid: false, error: 'Invalid start date' };
    }

    if (!end.isValid()) {
      return { valid: false, error: 'Invalid end date' };
    }

    if (start.isAfter(end)) {
      return { valid: false, error: 'Start date must be before end date' };
    }

    if (end.isAfter(now)) {
      return { valid: false, error: 'End date cannot be in the future' };
    }

    const diffDays = end.diff(start, 'days');
    if (diffDays > 365) {
      return { valid: false, error: 'Date range cannot exceed 365 days' };
    }

    if (diffDays < 1) {
      return { valid: false, error: 'Date range must be at least 1 day' };
    }

    return { valid: true };
  }
}

export default DateUtils;
