require('dotenv').config();

// ─── ENV VALIDATION — crash early if required vars missing ───────────────────
const REQUIRED_ENV = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'ENCRYPTION_KEY',
  'FRONTEND_URL',
   'INTERNAL_CRON_TOKEN',
];

const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(k => console.error(`   - ${k}`));
  console.error('Server will not start until these are set in .env');
  process.exit(1);
}

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const http     = require('http');
const { Server } = require('socket.io');

const { apiLimiter } = require('./middleware/rateLimit');

const app    = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL;

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────

const io = new Server(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] },
});

// ─── REDIS ADAPTER — Socket.IO scaling across multiple server instances ───────
if (process.env.REDIS_HOST) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { createClient }  = require('redis');

    const pubClient = createClient({
      socket: { host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT) || 6379 },
      password: process.env.REDIS_PASSWORD || undefined,
    });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ Socket.IO Redis adapter connected');
    }).catch(err => {
      console.warn('⚠️ Redis adapter failed — running without it:', err.message);
    });
  } catch (err) {
    console.warn('⚠️ Redis adapter not available:', err.message);
  }
}

app.set('io', io);

// ─── SECURITY MIDDLEWARE ──────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'tiny'));

// FIX: rawBody capture for webhook signature verification BEFORE express.json()
// Only parse as raw buffer on /webhook POST, everything else gets JSON
// Raw body capture sirf /webhook ke liye
// ============================================
// BODY PARSING — webhook gets raw body, rest get JSON
// ============================================

// Step 1: Raw body capture ONLY for /webhook
app.use('/webhook', (req, res, next) => {
  let data = [];
  req.on('data', chunk => data.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(data);
    try { req.body = JSON.parse(req.rawBody.toString()); } catch {}
    next();
  });
  req.on('error', (err) => {
    console.error('Webhook stream error:', err);
    next(err);
  });
});

// Step 2: JSON parser — explicitly SKIPPED for /webhook
app.use((req, res, next) => {
  if (req.path === '/webhook') {
    return next(); // body already parsed in Step 1, do NOT touch stream again
  }
  return express.json({ limit: '10mb' })(req, res, next);
});

// Step 3: urlencoded parser — explicitly SKIPPED for /webhook
app.use((req, res, next) => {
  if (req.path === '/webhook') {
    return next();
  }
  return express.urlencoded({ extended: true })(req, res, next);
});
// FIX: Global API rate limiter — all /api/* routes
app.use('/api', apiLimiter);

// ─── DATABASE CHECK ───────────────────────────────────────────────────────────

const { pool } = require('./config/database');
pool.execute('SELECT 1')
  .then(() => console.log('✅ Database connected'))
  .catch(err => {
    console.error('❌ DB connection failed:', err.message);
    process.exit(1); // Don't start if DB is down
  });

// ─── ROUTES ───────────────────────────────────────────────────────────────────

const authRoutes         = require('./routes/auth');
const { router: refreshRoutes } = require('./routes/refresh');
const webhookRoutes      = require('./routes/webhook');
const messageRoutes      = require('./routes/messages');
const conversationRoutes = require('./routes/conversations');
const contactRoutes      = require('./routes/contacts');
const manageRoutes       = require('./routes/manage');
const broadcastRoutes    = require('./routes/broadcast');
const statsRoutes        = require('./routes/stats');
const settingsRoutes     = require('./routes/settings');
const flowsRoutes        = require('./routes/flows');
const mediaRoutes        = require('./routes/media');
const billingRoutes      = require('./routes/billing');
const groupsRoutes       = require('./routes/groups');
const auditRoutes        = require('./routes/audit');
const healthRoutes       = require('./routes/health');

app.use('/api/auth',          authRoutes);
app.use('/api/auth',          refreshRoutes);
app.use('/webhook',           webhookRoutes);
app.use('/health',            healthRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/contacts',      contactRoutes);
app.use('/api/manage',        manageRoutes);
app.use('/api/broadcast',     broadcastRoutes);
app.use('/api/stats',         statsRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/flows',         flowsRoutes);
app.use('/api/media',         mediaRoutes);
app.use('/api/billing',       billingRoutes);
app.use('/api/groups',        groupsRoutes);
app.use('/api/audit',         auditRoutes);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    success:  true,
    message:  '🚀 Artwa API Running',
    version:  process.env.npm_package_version || '1.0.0',
    endpoints: {
      auth:          '/api/auth',
      health:        '/health',
      webhook:       '/webhook',
      messages:      '/api/messages',
      conversations: '/api/conversations',
      contacts:      '/api/contacts',
      manage:        '/api/manage',
      broadcast:     '/api/broadcast',
      stats:         '/api/stats',
      settings:      '/api/settings',
      flows:         '/api/flows',
      media:         '/api/media',
      billing:       '/api/billing',
      groups:        '/api/groups',
      audit:         '/api/audit',
    },
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── SOCKET.IO EVENTS ─────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on('join', ({ client_id }) => {
    socket.join(`client_${client_id}`);
    console.log(`👤 Joined room: client_${client_id}`);
  });

  socket.on('join_agent', ({ agent_id }) => {
    socket.join(`agent_${agent_id}`);
    console.log(`🧑‍💼 Agent joined room: agent_${agent_id}`);
  });

  socket.on('join_conversation', ({ conversation_id }) => {
    socket.join(`conv_${conversation_id}`);
  });

  socket.on('leave_conversation', ({ conversation_id }) => {
    socket.leave(`conv_${conversation_id}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Disconnected: ${socket.id}`);
  });
});

// ─── BULLMQ WORKERS ──────────────────────────────────────────────────────────

try {
  const { broadcastWorker } = require('./workers/broadcastWorker');
  const { retryWorker }     = require('./workers/retryWorker');
  const { startScheduler }  = require('./workers/schedulerWorker');
  startScheduler();
  console.log('⚙️  BullMQ broadcast worker started');
  console.log('⚙️  BullMQ retry worker started');
  console.log('⚙️  Broadcast scheduler started');
} catch (err) {
  console.warn('⚠️ BullMQ workers not loaded (Redis may be unavailable):', err.message);
}

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('🚀 ================================');
  console.log(`🚀  Artwa API on port ${PORT}`);
  console.log(`🚀  Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log('🚀 ================================');
});

// ─── CRON JOBS ────────────────────────────────────────────────────────────────

const { startCron } = require('./src/cron');
startCron();

// Template sync cron — every 30 min sync all clients' template statuses from Meta
const cron = require('node-cron');
cron.schedule('*/30 * * * *', async () => {
  try {
    const axios = require('axios');
    await axios.post(
      `http://localhost:${process.env.PORT || 5000}/api/manage/templates/sync-all`,
      {},
      { headers: { Authorization: `Bearer ${process.env.INTERNAL_CRON_TOKEN || ''}` } }
    );
  } catch (err) {
    console.error('⏰ Template sync cron error:', err.message);
  }
});
console.log('⏰ Template sync cron started (every 30 min)');

module.exports = { app, io };