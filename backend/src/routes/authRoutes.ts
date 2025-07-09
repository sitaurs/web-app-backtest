import { Router } from 'express';
import { body } from 'express-validator';
import {
  register,
  login,
  getProfile,
  updateProfile,
  updateSettings,
  changePassword,
  getAllUsers
} from '../controllers/authController';
import { protect, authorize } from '../middlewares/authMiddleware';
import { asyncHandler } from '../middlewares/errorHandler';

const router = Router();

// Validation rules for user registration
const registerValidation = [
  body('username')
    .isString()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('role')
    .optional()
    .isIn(['USER', 'PREMIUM', 'ADMIN'])
    .withMessage('Role must be USER, PREMIUM, or ADMIN')
];

// Validation rules for user login
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Validation rules for profile update
const profileUpdateValidation = [
  body('firstName')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('First name must be less than 50 characters'),
  
  body('lastName')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Last name must be less than 50 characters'),
  
  body('timezone')
    .optional()
    .isString()
    .withMessage('Timezone must be a valid string'),
  
  body('language')
    .optional()
    .isIn(['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja'])
    .withMessage('Language must be a supported language code'),
  
  body('country')
    .optional()
    .isString()
    .isLength({ max: 2 })
    .withMessage('Country must be a valid 2-letter country code'),
  
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Phone must be a valid phone number')
];

// Validation rules for settings update
const settingsUpdateValidation = [
  body('defaultBalance')
    .optional()
    .isFloat({ min: 100, max: 1000000 })
    .withMessage('Default balance must be between 100 and 1,000,000'),
  
  body('defaultSkipCandles')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Default skip candles must be between 1 and 100'),
  
  body('defaultAnalysisWindow')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Default analysis window must be between 1 and 168 hours'),
  
  body('emailNotifications')
    .optional()
    .isBoolean()
    .withMessage('Email notifications must be a boolean'),
  
  body('darkMode')
    .optional()
    .isBoolean()
    .withMessage('Dark mode must be a boolean'),
  
  body('autoSavePrompts')
    .optional()
    .isBoolean()
    .withMessage('Auto save prompts must be a boolean'),
  
  body('preferredCurrency')
    .optional()
    .isIn(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'])
    .withMessage('Preferred currency must be a valid currency code')
];

// Validation rules for password change
const passwordChangeValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .withMessage('New password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number')
];

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  registerValidation,
  asyncHandler(register)
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
router.post(
  '/login',
  loginValidation,
  asyncHandler(login)
);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
  '/profile',
  protect,
  asyncHandler(getProfile)
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  protect,
  profileUpdateValidation,
  asyncHandler(updateProfile)
);

/**
 * @route   PUT /api/auth/settings
 * @desc    Update user settings
 * @access  Private
 */
router.put(
  '/settings',
  protect,
  settingsUpdateValidation,
  asyncHandler(updateSettings)
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put(
  '/change-password',
  protect,
  passwordChangeValidation,
  asyncHandler(changePassword)
);

/**
 * @route   GET /api/auth/users
 * @desc    Get all users (admin only)
 * @access  Private (Admin only)
 */
router.get(
  '/users',
  protect,
  authorize('ADMIN'),
  asyncHandler(getAllUsers)
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post(
  '/logout',
  protect,
  asyncHandler(async (req: any, res: any) => {
    // In a stateless JWT system, logout is typically handled client-side
    // by removing the token from storage. However, we can log the logout event.
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  })
);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify JWT token and return user info
 * @access  Private
 */
router.get(
  '/verify',
  protect,
  asyncHandler(async (req: any, res: any) => {
    // If we reach here, the token is valid (middleware passed)
    res.json({
      success: true,
      data: {
        user: req.user,
        tokenValid: true
      }
    });
  })
);

/**
 * @route   GET /api/auth/permissions
 * @desc    Get user permissions based on role
 * @access  Private
 */
router.get(
  '/permissions',
  protect,
  asyncHandler(async (req: any, res: any) => {
    const userRole = req.user?.role || 'USER';
    
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

    res.json({
      success: true,
      data: {
        role: userRole,
        permissions: rolePermissions[userRole as keyof typeof rolePermissions] || rolePermissions.USER
      }
    });
  })
);

export default router;
