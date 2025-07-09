import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { User, UserManager } from '../models/User';
import { generateToken, AuthenticatedRequest } from '../middlewares/authMiddleware';
import { CustomError, validationErrorHandler } from '../middlewares/errorHandler';
import logger from '../utils/logger';

// In-memory user storage (replace with database in production)
const users: User[] = [];

/**
 * Register a new user
 */
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      validationErrorHandler(errors.array());
    }

    const { username, email, password, role = 'USER' } = req.body;

    logger.info('User registration attempt', {
      username,
      email,
      role
    });

    // Check if user already exists
    const existingUser = users.find(
      user => user.email === email.toLowerCase() || user.username === username
    );

    if (existingUser) {
      throw new CustomError('User with this email or username already exists', 400);
    }

    // Validate user data
    const validation = UserManager.validateUserData({ username, email });
    if (!validation.valid) {
      throw new CustomError(validation.errors.join(', '), 400);
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = UserManager.createUser(
      username,
      email,
      hashedPassword,
      role as 'USER' | 'ADMIN' | 'PREMIUM'
    );

    // Store user (in production, save to database)
    users.push(newUser);

    // Generate token
    const token = generateToken({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role
    });

    logger.info('User registered successfully', {
      userId: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          createdAt: newUser.createdAt
        },
        token
      }
    });

  } catch (error) {
    logger.error('User registration failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
};

/**
 * Login user
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      validationErrorHandler(errors.array());
    }

    const { email, password } = req.body;

    logger.info('User login attempt', { email });

    // Find user by email
    const user = users.find(u => u.email === email.toLowerCase());

    if (!user) {
      throw new CustomError('Invalid credentials', 401);
    }

    // Check if user is active
    if (!user.isActive) {
      throw new CustomError('Account is deactivated', 401);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      logger.warn('Invalid password attempt', {
        email,
        userId: user.id
      });
      throw new CustomError('Invalid credentials', 401);
    }

    // Update last login
    const updatedUser = UserManager.updateLastLogin(user);
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      users[userIndex] = updatedUser;
    }

    // Generate token
    const token = generateToken({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role
    });

    logger.info('User logged in successfully', {
      userId: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          role: updatedUser.role,
          lastLogin: updatedUser.lastLogin
        },
        token
      }
    });

  } catch (error) {
    logger.error('User login failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }

    // Find user
    const user = users.find(u => u.id === userId);

    if (!user) {
      throw new CustomError('User not found', 404);
    }

    logger.debug('Profile retrieved', {
      userId: user.id,
      username: user.username
    });

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile: user.profile,
          settings: user.settings,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        }
      }
    });

  } catch (error) {
    logger.error('Failed to get profile', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const profileData = req.body;

    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }

    // Find user
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      throw new CustomError('User not found', 404);
    }

    // Validate profile data
    const validation = UserManager.validateUserData({ profile: profileData });
    if (!validation.valid) {
      throw new CustomError(validation.errors.join(', '), 400);
    }

    // Update profile
    const updatedUser = UserManager.updateProfile(users[userIndex], profileData);
    users[userIndex] = updatedUser;

    logger.info('Profile updated successfully', {
      userId: updatedUser.id,
      username: updatedUser.username
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          role: updatedUser.role,
          profile: updatedUser.profile,
          updatedAt: updatedUser.updatedAt
        }
      }
    });

  } catch (error) {
    logger.error('Failed to update profile', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * Update user settings
 */
export const updateSettings = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const settingsData = req.body;

    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }

    // Find user
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      throw new CustomError('User not found', 404);
    }

    // Update settings
    const updatedUser = UserManager.updateSettings(users[userIndex], settingsData);
    users[userIndex] = updatedUser;

    logger.info('Settings updated successfully', {
      userId: updatedUser.id,
      username: updatedUser.username
    });

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        settings: updatedUser.settings,
        updatedAt: updatedUser.updatedAt
      }
    });

  } catch (error) {
    logger.error('Failed to update settings', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * Change password
 */
export const changePassword = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      throw new CustomError('User not authenticated', 401);
    }

    // Find user
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      throw new CustomError('User not found', 404);
    }

    const user = users[userIndex];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      throw new CustomError('Current password is incorrect', 400);
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    users[userIndex] = {
      ...user,
      password: hashedNewPassword,
      updatedAt: new Date()
    };

    logger.info('Password changed successfully', {
      userId: user.id,
      username: user.username
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Failed to change password', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id
    });
    next(error);
  }
};

/**
 * Get all users (admin only)
 */
export const getAllUsers = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      throw new CustomError('Admin access required', 403);
    }

    const userList = users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }));

    logger.info('User list retrieved', {
      adminId: req.user.id,
      userCount: userList.length
    });

    res.status(200).json({
      success: true,
      data: {
        users: userList,
        total: userList.length
      }
    });

  } catch (error) {
    logger.error('Failed to get user list', {
      error: error instanceof Error ? error.message : 'Unknown error',
      adminId: req.user?.id
    });
    next(error);
  }
};

/**
 * Create default admin user if no users exist
 */
export const createDefaultAdmin = async (): Promise<void> => {
  try {
    if (users.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      const adminUser = UserManager.createUser(
        'admin',
        'admin@forexbacktest.com',
        hashedPassword,
        'ADMIN'
      );
      
      users.push(adminUser);
      
      logger.info('Default admin user created', {
        username: adminUser.username,
        email: adminUser.email
      });
    }
  } catch (error) {
    logger.error('Failed to create default admin', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export default {
  register,
  login,
  getProfile,
  updateProfile,
  updateSettings,
  changePassword,
  getAllUsers,
  createDefaultAdmin
};
