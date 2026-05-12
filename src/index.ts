import express from 'express';
import dotenv from 'dotenv';
import webhookRoutes from './routes/webhook';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.use('/webhook', webhookRoutes);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
