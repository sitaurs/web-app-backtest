import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config as dotenvConfig } from 'dotenv';

// Import routes
import backtestRoutes from './routes/backtestRoutes';
import authRoutes from './routes/authRoutes';

// Import middlewares
import { errorHandler, notFound } from './middlewares/errorHandler';

// Import utilities
import logger from './utils/logger';
import config, { validateConfig } from './utils/configUtils';

// Import services for initialization
import { SimulationEngine } from './services/simulationEngine';
import { CacheService } from './services/cacheService';
import { createDefaultAdmin } from './controllers/authController';

// Load environment variables
dotenvConfig();

// Validate configuration
try {
  validateConfig();
  logger.info('Configuration validated successfully');
} catch (error) {
  logger.error('Configuration validation failed', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
  process.exit(1);
}

// Create Express app
const app = express();

// Trust proxy (for rate limiting and IP detection)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins
    if (config.nodeEnv === 'development') {
      return callback(null, true);
    }
    
    // In production, you should specify allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8000',
      'https://your-frontend-domain.com'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.nodeEnv === 'development' ? 1000 : 100, // Limit each IP to 100 requests per windowMs in production
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health check endpoints
    return req.path === '/health' || req.path === '/api/health';
  }
});

app.use(limiter);

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => {
        logger.info(message.trim());
      }
    }
  }));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/backtest', backtestRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Forex Backtesting Platform API',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/profile',
        updateProfile: 'PUT /api/auth/profile',
        updateSettings: 'PUT /api/auth/settings',
        changePassword: 'PUT /api/auth/change-password',
        logout: 'POST /api/auth/logout',
        verify: 'GET /api/auth/verify',
        permissions: 'GET /api/auth/permissions',
        users: 'GET /api/auth/users (admin only)'
      },
      backtest: {
        run: 'POST /api/backtest/run',
        reports: 'GET /api/backtest/reports',
        reportById: 'GET /api/backtest/reports/:sessionId',
        status: 'GET /api/backtest/status/:sessionId',
        deleteSession: 'DELETE /api/backtest/sessions/:sessionId',
        validateSymbol: 'GET /api/backtest/validate-symbol/:symbol',
        defaultPrompts: 'GET /api/backtest/default-prompts',
        stats: 'GET /api/backtest/stats'
      }
    },
    documentation: 'https://docs.forexbacktest.com'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Forex Backtesting Platform API',
    version: '1.0.0',
    documentation: '/api'
  });
});

// Handle 404 errors
app.use(notFound);

// Global error handler (must be last)
app.use(errorHandler);

// Initialize services
const initializeServices = async (): Promise<void> => {
  try {
    logger.info('Initializing services...');
    
    // Initialize simulation engine
    await SimulationEngine.initialize();
    logger.info('Simulation engine initialized');
    
    // Initialize cache service
    await CacheService.initialize();
    logger.info('Cache service initialized');
    
    // Create default admin user
    await createDefaultAdmin();
    logger.info('Default admin user check completed');
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  // Close server and cleanup resources
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });
  process.exit(1);
});

// Export app and initialization function
export { app, initializeServices };
export default app;
