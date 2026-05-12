import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export const validateRequest = (schema: z.ZodSchema) => 
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: error.issues,
        });
        return;
      }
      next(error);
    }
  };
