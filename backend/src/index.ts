import { app, initializeServices } from './app';
import logger from './utils/logger';
import config from './utils/configUtils';

/**
 * Start the server
 */
const startServer = async (): Promise<void> => {
  try {
    // Initialize all services first
    await initializeServices();
    
    // Start the HTTP server
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Server is running on port ${config.port}`, {
        environment: config.nodeEnv,
        port: config.port,
        timestamp: new Date().toISOString()
      });
      
      logger.info('📊 Forex Backtesting Platform API is ready!', {
        endpoints: {
          health: `http://localhost:${config.port}/health`,
          api: `http://localhost:${config.port}/api`,
          auth: `http://localhost:${config.port}/api/auth`,
          backtest: `http://localhost:${config.port}/api/backtest`
        }
      });
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof config.port === 'string' 
        ? 'Pipe ' + config.port 
        : 'Port ' + config.port;

      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    // Listen for shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
};

// Start the server
startServer().catch((error) => {
  logger.error('Unhandled error during server startup', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});

// Export for testing purposes
export default app;
