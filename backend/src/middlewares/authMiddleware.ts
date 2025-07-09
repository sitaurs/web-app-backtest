import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../utils/configUtils';
import logger from '../utils/logger';
import { CustomError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: 'USER' | 'ADMIN' | 'PREMIUM';
  };
}

export interface JWTPayload {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'PREMIUM';
  iat: number;
  exp: number;
}

/**
 * Middleware to protect routes that require authentication
 */
export const protect = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      throw new CustomError('Not authorized to access this route', 401);
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

      // Add user to request object
      req.user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role
      };

      logger.debug('User authenticated successfully', {
        userId: decoded.id,
        username: decoded.username,
        role: decoded.role
      });

      next();
    } catch (error) {
      logger.warn('Invalid token provided', {
        token: token.substring(0, 20) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new CustomError('Not authorized to access this route', 401);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to authorize specific roles
 */
export const authorize = (...roles: ('USER' | 'ADMIN' | 'PREMIUM')[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new CustomError('User not authenticated', 401);
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('User access denied - insufficient permissions', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles
      });
      throw new CustomError('User role not authorized to access this route', 403);
    }

    logger.debug('User authorized successfully', {
      userId: req.user.id,
      userRole: req.user.role,
      requiredRoles: roles
    });

    next();
  };
};

/**
 * Optional authentication middleware (doesn't throw error if no token)
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token, continue without authentication
    if (!token) {
      return next();
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

      // Add user to request object
      req.user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role
      };

      logger.debug('Optional auth - user authenticated', {
        userId: decoded.id,
        username: decoded.username
      });
    } catch (error) {
      logger.debug('Optional auth - invalid token, continuing without auth', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Generate JWT token
 */
export const generateToken = (payload: {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'PREMIUM';
}): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
};

/**
 * Verify JWT token
 */
export const verifyToken = (token: string): JWTPayload | null => {
  try {
    return jwt.verify(token, config.jwtSecret) as JWTPayload;
  } catch (error) {
    logger.debug('Token verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
};

/**
 * Extract user ID from token without verification
 */
export const extractUserIdFromToken = (token: string): string | null => {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    return decoded?.id || null;
  } catch (error) {
    return null;
  }
};

/**
 * Check if user has specific permission
 */
export const hasPermission = (
  userRole: 'USER' | 'ADMIN' | 'PREMIUM',
  permission: string
): boolean => {
  const rolePermissions = {
    USER: [
      'create_backtest',
      'view_own_reports',
      'edit_profile',
      'change_settings'
    ],
    PREMIUM: [
      'create_backtest',
      'view_own_reports',
      'edit_profile',
      'change_settings',
      'advanced_analytics',
      'export_data',
      'custom_indicators',
      'priority_support'
    ],
    ADMIN: [
      'create_backtest',
      'view_own_reports',
      'edit_profile',
      'change_settings',
      'advanced_analytics',
      'export_data',
      'custom_indicators',
      'priority_support',
      'view_all_users',
      'manage_users',
      'system_settings',
      'view_system_logs',
      'manage_api_keys'
    ]
  };

  return rolePermissions[userRole].includes(permission);
};

/**
 * Middleware to check specific permission
 */
export const requirePermission = (permission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new CustomError('User not authenticated', 401);
    }

    if (!hasPermission(req.user.role, permission)) {
      logger.warn('User access denied - missing permission', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredPermission: permission
      });
      throw new CustomError(`Permission '${permission}' required to access this route`, 403);
    }

    next();
  };
};

/**
 * Rate limiting by user
 */
export const userRateLimit = (maxRequests: number, windowMs: number) => {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const userLimit = userRequests.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize user limit
      userRequests.set(userId, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    if (userLimit.count >= maxRequests) {
      logger.warn('User rate limit exceeded', {
        userId,
        count: userLimit.count,
        maxRequests
      });
      throw new CustomError('Rate limit exceeded. Please try again later.', 429);
    }

    userLimit.count++;
    next();
  };
};

export default {
  protect,
  authorize,
  optionalAuth,
  generateToken,
  verifyToken,
  extractUserIdFromToken,
  hasPermission,
  requirePermission,
  userRateLimit
};
