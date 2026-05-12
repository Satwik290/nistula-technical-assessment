import { Request, Response, NextFunction } from 'express';

export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || `auto-${Date.now()}`;

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log(`  Request ID: ${requestId}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`  Payload: ${JSON.stringify(req.body)}`);
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`  ✓ Response: ${res.statusCode} (${duration}ms)`);
  });

  next();
};
