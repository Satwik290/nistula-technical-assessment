import express from 'express';
import { env } from './config/env';
import webhookRoutes from './routes/webhook.routes';
import { errorHandler } from './middlewares/error.middleware';
import { webhookLimiter } from './middlewares/rateLimit.middleware';
import { loggingMiddleware } from './middlewares/logging.middleware';

const app = express();
app.use(loggingMiddleware);
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/webhook', webhookLimiter, webhookRoutes);

// Global error handler middleware
app.use(errorHandler);

if (require.main === module) {
  app.listen(env.PORT, () => {
    console.log(`Server is running on port ${env.PORT}`);
  });
}

export default app;
