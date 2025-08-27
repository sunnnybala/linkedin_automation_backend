require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const { sequelize } = require('./models');
const { authenticateJWT } = require('./middleware/auth');
const { initOidcClient } = require('./config/oidc');

// Import routes
const authRoutes = require('./routes/auth.routes');
const postRoutes = require('./routes/post.routes');
const webhookRoutes = require('./routes/webhook.routes');
const scheduleRoutes = require('./routes/schedule.routes');
const { startScheduler } = require('./services/scheduler');

const app = express();

// Middleware
app.use(helmet());
// Flexible CORS: allow single FRONTEND_URL, multiple FRONTEND_URLS, and optional Vercel preview domains
const allowedOriginsConfig = (() => {
  const single = (process.env.FRONTEND_URL || '').trim();
  const many = (process.env.FRONTEND_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  const defaults = process.env.NODE_ENV === 'development' ? ['http://localhost:5173'] : [];
  const allowVercel = String(process.env.CORS_ALLOW_VERCEL_PREVIEWS || 'true').toLowerCase() !== 'false';
  return { list: [...many, ...(single ? [single] : []), ...defaults], allowVercel };
})();
app.use(cors({
  origin: (origin, callback) => {
    try {
      if (!origin) return callback(null, true);
      if (allowedOriginsConfig.list.includes(origin)) return callback(null, true);
      if (allowedOriginsConfig.allowVercel) {
        const hostname = new URL(origin).hostname;
        if (/\.vercel\.app$/.test(hostname)) return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    } catch (_) {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// trust proxy for secure cookies when behind proxies (e.g., in production)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Initialize session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000 // 15 minutes - only needed for OAuth flow
  }
};

// Initialize session
app.use(session(sessionConfig));

// Environment validation
const validateEnv = () => {
  const requiredEnv = [
    'JWT_SECRET',
    'LINKEDIN_CLIENT_ID',
    'LINKEDIN_CLIENT_SECRET',
    'LINKEDIN_CALLBACK_URL',
    'OIDC_ISSUER',
    'OIDC_AUTHORIZATION_ENDPOINT',
    'OIDC_TOKEN_ENDPOINT',
    'OIDC_JWKS_URI'
  ];
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (!process.env.JWT_EXPIRES_IN) {
    process.env.JWT_EXPIRES_IN = '15m';
  }
};

// Database connection
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    
    // Sync models with database
    if (process.env.DB_SYNC === 'true') {
      await sequelize.sync({ alter: true });
      console.log('Database synchronized');
    }
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
};

// Routes
app.use('/api/check', authRoutes);
app.use('/api/posts', authenticateJWT, postRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/schedules', authenticateJWT, scheduleRoutes);

// Google Search Console site verification (HTML file method)
// Serves: https://<your-domain>/googlef89e836dbb5c82fa.html

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});
app.use((err, req, res, next) => {
  console.error('Auth error:', err);
  if (err.oauthError) {
    console.error('OAuth response:', err.oauthError.data?.toString?.() || err.oauthError.data);
  }
  next(err);
});
// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  validateEnv();
  await initOidcClient();
  await connectDB();
  
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err);
    server.close(() => {
      process.exit(1);
    });
  });

  // Start scheduler loop if enabled
  if (String(process.env.ENABLE_SCHEDULER || 'true').toLowerCase() !== 'false') {
    startScheduler();
  }
};

// Start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
