import rateLimit from 'express-rate-limit';

export const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15min per IP
  message: 'Too many messages from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
