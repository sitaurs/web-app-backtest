export interface User {
  id: string;
  username: string;
  email: string;
  password: string; // Hashed password
  role: 'USER' | 'ADMIN' | 'PREMIUM';
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  isActive: boolean;
  profile: UserProfile;
  settings: UserSettings;
}

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  avatar?: string;
  timezone: string;
  language: string;
  country?: string;
  phone?: string;
}

export interface UserSettings {
  defaultBalance: number;
  defaultSkipCandles: number;
  defaultAnalysisWindow: number;
  emailNotifications: boolean;
  darkMode: boolean;
  autoSavePrompts: boolean;
  maxConcurrentBacktests: number;
  preferredCurrency: string;
}

export interface UserSession {
  sessionId: string;
  userId: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface UserStats {
  totalBacktests: number;
  completedBacktests: number;
  failedBacktests: number;
  totalTrades: number;
  winningTrades: number;
  totalPnl: number;
  bestBacktest: {
    sessionId: string;
    winRate: number;
    profitFactor: number;
  };
  worstBacktest: {
    sessionId: string;
    winRate: number;
    maxDrawdown: number;
  };
  favoriteSymbols: string[];
  averageBacktestDuration: number; // in minutes
  lastActivity: Date;
}

export class UserManager {
  /**
   * Create a new user with default settings
   */
  static createUser(
    username: string,
    email: string,
    hashedPassword: string,
    role: 'USER' | 'ADMIN' | 'PREMIUM' = 'USER'
  ): User {
    const userId = this.generateUserId();
    const now = new Date();

    return {
      id: userId,
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      createdAt: now,
      updatedAt: now,
      isActive: true,
      profile: {
        timezone: 'UTC',
        language: 'en'
      },
      settings: {
        defaultBalance: 10000,
        defaultSkipCandles: 6,
        defaultAnalysisWindow: 20,
        emailNotifications: true,
        darkMode: false,
        autoSavePrompts: true,
        maxConcurrentBacktests: role === 'PREMIUM' ? 5 : role === 'ADMIN' ? 10 : 2,
        preferredCurrency: 'USD'
      }
    };
  }

  /**
   * Generate unique user ID
   */
  static generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate user data
   */
  static validateUserData(userData: Partial<User>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (userData.username) {
      if (userData.username.length < 3) {
        errors.push('Username must be at least 3 characters long');
      }
      if (userData.username.length > 30) {
        errors.push('Username must be less than 30 characters');
      }
      if (!/^[a-zA-Z0-9_]+$/.test(userData.username)) {
        errors.push('Username can only contain letters, numbers, and underscores');
      }
    }

    if (userData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userData.email)) {
        errors.push('Invalid email format');
      }
    }

    if (userData.profile?.firstName && userData.profile.firstName.length > 50) {
      errors.push('First name must be less than 50 characters');
    }

    if (userData.profile?.lastName && userData.profile.lastName.length > 50) {
      errors.push('Last name must be less than 50 characters');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Update user profile
   */
  static updateProfile(user: User, profileData: Partial<UserProfile>): User {
    return {
      ...user,
      profile: {
        ...user.profile,
        ...profileData
      },
      updatedAt: new Date()
    };
  }

  /**
   * Update user settings
   */
  static updateSettings(user: User, settingsData: Partial<UserSettings>): User {
    return {
      ...user,
      settings: {
        ...user.settings,
        ...settingsData
      },
      updatedAt: new Date()
    };
  }

  /**
   * Update last login time
   */
  static updateLastLogin(user: User): User {
    return {
      ...user,
      lastLogin: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Deactivate user account
   */
  static deactivateUser(user: User): User {
    return {
      ...user,
      isActive: false,
      updatedAt: new Date()
    };
  }

  /**
   * Activate user account
   */
  static activateUser(user: User): User {
    return {
      ...user,
      isActive: true,
      updatedAt: new Date()
    };
  }

  /**
   * Check if user can create new backtest based on role limits
   */
  static canCreateBacktest(user: User, currentActiveBacktests: number): boolean {
    if (!user.isActive) return false;
    return currentActiveBacktests < user.settings.maxConcurrentBacktests;
  }

  /**
   * Get user permissions based on role
   */
  static getUserPermissions(role: 'USER' | 'ADMIN' | 'PREMIUM'): string[] {
    const basePermissions = [
      'create_backtest',
      'view_own_reports',
      'edit_profile',
      'change_settings'
    ];

    const premiumPermissions = [
      ...basePermissions,
      'advanced_analytics',
      'export_data',
      'custom_indicators',
      'priority_support'
    ];

    const adminPermissions = [
      ...premiumPermissions,
      'view_all_users',
      'manage_users',
      'system_settings',
      'view_system_logs',
      'manage_api_keys'
    ];

    switch (role) {
      case 'ADMIN':
        return adminPermissions;
      case 'PREMIUM':
        return premiumPermissions;
      case 'USER':
      default:
        return basePermissions;
    }
  }

  /**
   * Check if user has specific permission
   */
  static hasPermission(user: User, permission: string): boolean {
    const userPermissions = this.getUserPermissions(user.role);
    return userPermissions.includes(permission);
  }

  /**
   * Calculate user statistics
   */
  static calculateUserStats(
    user: User,
    backtestSessions: any[], // BacktestSession[] - avoiding circular import
    trades: any[] // Trade[] - avoiding circular import
  ): UserStats {
    const completedBacktests = backtestSessions.filter(s => s.metadata.status === 'COMPLETED');
    const failedBacktests = backtestSessions.filter(s => s.metadata.status === 'FAILED');
    
    const winningTrades = trades.filter(t => t.status === 'WIN');
    const totalPnl = trades.reduce((sum, t) => sum + t.netPnl, 0);

    // Find best and worst backtests
    let bestBacktest = { sessionId: '', winRate: 0, profitFactor: 0 };
    let worstBacktest = { sessionId: '', winRate: 100, maxDrawdown: 0 };

    completedBacktests.forEach(session => {
      if (session.performance_summary.win_rate_percent > bestBacktest.winRate) {
        bestBacktest = {
          sessionId: session.metadata.test_id,
          winRate: session.performance_summary.win_rate_percent,
          profitFactor: session.performance_summary.profit_factor
        };
      }

      if (session.performance_summary.win_rate_percent < worstBacktest.winRate) {
        worstBacktest = {
          sessionId: session.metadata.test_id,
          winRate: session.performance_summary.win_rate_percent,
          maxDrawdown: session.performance_summary.max_drawdown_percent
        };
      }
    });

    // Calculate favorite symbols
    const symbolCounts: { [key: string]: number } = {};
    backtestSessions.forEach(session => {
      const symbol = session.metadata.pair;
      symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
    });

    const favoriteSymbols = Object.entries(symbolCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([symbol]) => symbol);

    // Calculate average backtest duration
    const totalDuration = completedBacktests.reduce((sum, session) => {
      if (session.metadata.completed_at && session.metadata.created_at) {
        return sum + (new Date(session.metadata.completed_at).getTime() - new Date(session.metadata.created_at).getTime());
      }
      return sum;
    }, 0);

    const averageBacktestDuration = completedBacktests.length > 0 
      ? totalDuration / completedBacktests.length / (1000 * 60) // Convert to minutes
      : 0;

    return {
      totalBacktests: backtestSessions.length,
      completedBacktests: completedBacktests.length,
      failedBacktests: failedBacktests.length,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      totalPnl,
      bestBacktest,
      worstBacktest,
      favoriteSymbols,
      averageBacktestDuration,
      lastActivity: user.lastLogin || user.createdAt
    };
  }
}

export default User;
