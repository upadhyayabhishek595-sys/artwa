require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');

const { testConnection } = require('./config/database');
const authRoutes    = require('./routes/auth');
const webhookRoutes = require('./routes/webhook');

const app  = express();
const PORT = process.env.PORT || 5000;

// =============================================
// MIDDLEWARE
// =============================================
app.use(helmet());
app.use(cors({
    origin: '*', // Change to your frontend URL in production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { success: false, message: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// =============================================
// ROUTES
// =============================================

// Health check
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 WhatsApp Omnichannel API is running!',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Webhook (Meta WhatsApp)
app.use('/webhook', webhookRoutes);

// Auth routes
app.use('/api/auth', authRoutes);

// =============================================
// MORE ROUTES (Coming in next steps)
// =============================================
// app.use('/api/messages',      require('./routes/messages'));
// app.use('/api/conversations', require('./routes/conversations'));
// app.use('/api/contacts',      require('./routes/contacts'));
// app.use('/api/templates',     require('./routes/templates'));
// app.use('/api/campaigns',     require('./routes/campaigns'));
// app.use('/api/agents',        require('./routes/agents'));
// app.use('/api/clients',       require('./routes/clients'));
// app.use('/api/apikeys',       require('./routes/apikeys'));
// app.use('/api/v1',            require('./routes/publicApi'));

// =============================================
// ERROR HANDLER
// =============================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// =============================================
// START SERVER
// =============================================
const startServer = async () => {
    await testConnection();
    app.listen(PORT, () => {
        console.log('');
        console.log('🚀 ================================');
        console.log(`🚀  Server running on port ${PORT}`);
        console.log(`🚀  Mode: ${process.env.NODE_ENV}`);
        console.log(`🚀  Webhook: /webhook`);
        console.log(`🚀  API: /api`);
        console.log('🚀 ================================');
        console.log('');
    });
};

startServer();
