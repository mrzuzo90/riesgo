// src/app.js

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Servicios y middleware
const { authenticateApiKey, requireFeature, requireActiveClient } = require('./middleware/auth');
const { createClientRateLimit, globalRateLimit, analysisRateLimit, adminRateLimit } = require('./middleware/rateLimiter');
const n8nService = require('./services/n8nService');
const billingService = require('./services/billingService');
const { PLANS, getClientsStats } = require('./config/clients');
const logger = require('./utils/logger');
const { logHttpRequest, logApiError, logBillingEvent } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// MIDDLEWARE GLOBAL
// ========================================

// Seguridad
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// Rate limiting global
app.use(globalRateLimit);

// Body parsing con límite de tamaño
app.use(express.json({ 
  limit: `${process.env.MAX_PDF_SIZE_MB || 10}mb`,
  verify: (req, res, buf, encoding) => {
    // Validar tamaño del PDF base64
    if (req.body && req.body.pdf_base64) {
      const sizeInMB = Buffer.byteLength(req.body.pdf_base64, 'base64') / (1024 * 1024);
      const maxSize = parseInt(process.env.MAX_PDF_SIZE_MB) || 10;
      
      if (sizeInMB > maxSize) {
        const error = new Error(`PDF too large: ${sizeInMB.toFixed(1)}MB. Maximum allowed: ${maxSize}MB`);
        error.status = 413;
        error.code = 'PAYLOAD_TOO_LARGE';
        throw error;
      }
    }
  }
}));

app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request ID, timing y logging
app.use((req, res, next) => {
  req.requestId = uuidv4();
  req.startTime = Date.now();
  
  // Log inicial del request
  logger.info('Request started', {
    request_id: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    user_agent: req.get('User-Agent'),
    content_length: req.get('Content-Length')
  });
  
  // Middleware para log de finalización
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - req.startTime;
    logHttpRequest(req, res, duration);
    return originalSend.call(this, data);
  };
  
  next();
});

// ========================================
// ENDPOINTS PÚBLICOS (sin autenticación)
// ========================================

// Health check
app.get('/health', async (req, res) => {
  try {
    const n8nHealth = await n8nService.healthCheck();
    
    const healthStatus = {
      status: 'OK',
      service: 'Risk Assessment API Gateway',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      },
      dependencies: {
        n8n: n8nHealth
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    // Si n8n no está saludable, marcar como degraded
    if (n8nHealth.status !== 'healthy') {
      healthStatus.status = 'DEGRADED';
    }
    
    const statusCode = healthStatus.status === 'OK' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'ERROR',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Info de la API
app.get('/v1/info', (req, res) => {
  res.json({
    service: 'Risk Assessment API',
    version: '1.0.0',
    description: 'AI-powered financial document risk assessment API',
    endpoints: {
      'POST /v1/risk-assessment': 'Analyze financial documents for credit risk',
      'GET /v1/validate-key': 'Validate your API key',
      'GET /v1/plans': 'View available pricing plans',
      'GET /v1/billing/stats': 'View your usage statistics'
    },
    authentication: {
      type: 'API Key',
      header: 'Authorization: Bearer YOUR_API_KEY',
      alternative: 'x-api-key: YOUR_API_KEY'
    },
    supported_documents: ['renta', 'patrimonio'],
    max_file_size: `${process.env.MAX_PDF_SIZE_MB || 10}MB`,
    response_time_sla: '< 60 seconds',
    documentation: 'https://docs.tu-api.com',
    support: 'support@tu-api.com'
  });
});

// Planes disponibles
app.get('/v1/plans', (req, res) => {
  res.json({
    plans: PLANS,
    currency: 'EUR',
    billing_model: 'Pay per request + optional monthly minimums',
    contact: {
      sales: 'sales@tu-api.com',
      support: 'support@tu-api.com'
    },
    trial: {
      api_key: 'rk_test_sandbox123456',
      description: 'Use this key for free testing (50 requests/hour)',
      limitations: 'Testing only - no production use'
    }
  });
});

// ========================================
// ENDPOINTS CON AUTENTICACIÓN
// ========================================

// Validar API key
app.get('/v1/validate-key', authenticateApiKey, requireActiveClient, (req, res) => {
  const duration = Date.now() - req.startTime;
  
  res.json({
    valid: true,
    client_info: {
      client_id: req.client.client_id,
      client_name: req.client.client_name,
      plan: req.client.plan,
      features: req.client.features,
      rate_limit: req.client.rate_limit,
      price_per_request: req.client.price_per_request,
      payment_model: req.client.payment_model,
      created_at: req.client.created_at
    },
    usage_limits: {
      requests_per_hour: req.client.rate_limit,
      requests_per_minute: Math.floor(req.client.rate_limit / 60)
    },
    response_time: `${duration}ms`,
    validated_at: new Date().toISOString()
  });
});

// Estadísticas de facturación
app.get('/v1/billing/stats', authenticateApiKey, requireActiveClient, async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  
  if (days > 365) {
    return res.status(400).json({
      error: 'invalid_period',
      message: 'Maximum period is 365 days'
    });
  }
  
  try {
    const stats = await billingService.getUsageStats(req.client.client_id, days);
    
    res.json({
      client_info: {
        client_id: req.client.client_id,
        client_name: req.client.client_name,
        plan: req.client.plan,
        price_per_request: req.client.price_per_request
      },
      usage_stats: stats,
      current_period: {
        days: days,
        start_date: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logApiError(error, req, { context: 'billing_stats' });
    res.status(500).json({
      error: 'billing_stats_error',
      message: 'Unable to retrieve billing statistics',
      request_id: req.requestId
    });
  }
});

// Reporte mensual
app.get('/v1/billing/report/:year/:month', authenticateApiKey, requireActiveClient, async (req, res) => {
  const { year, month } = req.params;
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  
  if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12 || yearNum < 2020 || yearNum > 2030) {
    return res.status(400).json({
      error: 'invalid_period',
      message: 'Please provide valid year (2020-2030) and month (1-12)',
      example: '/v1/billing/report/2025/5'
    });
  }
  
  try {
    const report = await billingService.generateMonthlyReport(req.client.client_id, yearNum, monthNum);
    
    if (!report) {
      return res.status(404).json({
        error: 'no_usage_data',
        message: `No usage data found for ${year}-${month.padStart(2, '0')}`,
        client_id: req.client.client_id
      });
    }
    
    res.json(report);
    
  } catch (error) {
    logApiError(error, req, { context: 'monthly_report' });
    res.status(500).json({
      error: 'report_generation_error',
      message: 'Unable to generate billing report',
      request_id: req.requestId
    });
  }
});

// ========================================
// ENDPOINT PRINCIPAL: ANÁLISIS DE RIESGO
// ========================================

app.post('/v1/risk-assessment', 
  authenticateApiKey,
  requireActiveClient,
  createClientRateLimit(),
  analysisRateLimit,
  requireFeature('basic_analysis'),
  async (req, res) => {
    const { client_name, client_id, document_type, pdf_base64 } = req.body;
    
    try {
      // Validación de campos requeridos
      const requiredFields = ['client_name', 'client_id', 'document_type', 'pdf_base64'];
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          error: 'validation_error',
          message: 'Missing required fields',
          missing_fields: missingFields,
          required_fields: requiredFields,
          request_id: req.requestId
        });
      }
      
      // Validar tipo de documento
      const validDocTypes = ['renta', 'patrimonio'];
      if (!validDocTypes.includes(document_type)) {
        return res.status(400).json({
          error: 'invalid_document_type',
          message: 'document_type must be either "renta" or "patrimonio"',
          valid_types: validDocTypes,
          request_id: req.requestId
        });
      }
      
      // Validar formato base64 del PDF
      if (!pdf_base64.match(/^[A-Za-z0-9+/=]+$/)) {
        return res.status(400).json({
          error: 'invalid_pdf_format',
          message: 'pdf_base64 must be valid base64 encoded PDF',
          hint: 'Ensure the PDF is properly encoded to base64',
          request_id: req.requestId
        });
      }
      
      // Calcular tamaño del PDF
      const pdfSizeKB = Math.round(pdf_base64.length * 0.75 / 1024);
      
      // Preparar payload para n8n
      const payload = {
        client_name: client_name.trim(),
        client_id: client_id.trim(),
        document_type,
        pdf_base64,
        request_id: req.requestId
      };
      
      logger.info('Processing risk assessment', {
        request_id: req.requestId,
        client_id: req.client.client_id,
        api_client_name: req.client.client_name,
        document_type,
        pdf_size_kb: pdfSizeKB,
        price_per_request: req.client.price_per_request
      });
      
      // Llamar a n8n
      const result = await n8nService.processRiskAssessment(payload, req.client);
      
      const totalDuration = Date.now() - req.startTime;
      
      // Registrar facturación
      await billingService.recordUsage(req.client.client_id, {
        request_id: req.requestId,
        document_type,
        processing_time_ms: totalDuration,
        billable_amount: req.client.price_per_request,
        status: 'success',
        risk_assessment: result.risk_assessment,
        risk_score: result.risk_score,
        confidence: result.confidence,
        pdf_size_kb: pdfSizeKB
      });
      
      // Log para facturación
      logBillingEvent('api_usage', req.client.client_id, req.client.price_per_request, {
        request_id: req.requestId,
        document_type,
        risk_assessment: result.risk_assessment,
        processing_time_ms: totalDuration
      });
      
      // Respuesta final
      const response = {
        ...result,
        api_metadata: {
          ...result.api_metadata,
          request_id: req.requestId,
          client_id: req.client.client_id,
          plan: req.client.plan,
          total_processing_time_ms: totalDuration,
          billable_amount: req.client.price_per_request,
          currency: 'EUR',
          pdf_size_kb: pdfSizeKB
        }
      };
      
      logger.info('Risk assessment completed successfully', {
        request_id: req.requestId,
        client_id: req.client.client_id,
        risk_assessment: result.risk_assessment,
        risk_score: result.risk_score,
        processing_time_ms: totalDuration,
        billable_amount: req.client.price_per_request
      });
      
      res.json(response);
      
    } catch (error) {
      const totalDuration = Date.now() - req.startTime;
      
      // Registrar error para facturación (sin cobrar)
      await billingService.recordUsage(req.client.client_id, {
        request_id: req.requestId,
        document_type: req.body.document_type,
        processing_time_ms: totalDuration,
        billable_amount: 0, // No cobrar por errores
        status: 'error',
        pdf_size_kb: req.body.pdf_base64 ? Math.round(req.body.pdf_base64.length * 0.75 / 1024) : 0
      });
      
      logApiError(error, req, {
        context: 'risk_assessment',
        error_type: error.type,
        is_retryable: error.isRetryable,
        duration: totalDuration
      });
      
      // Respuesta de error basada en el tipo
      if (error.type === 'timeout') {
        res.status(504).json({
          error: 'processing_timeout',
          message: error.message,
          request_id: req.requestId,
          processing_time_ms: totalDuration,
          is_retryable: true,
          hint: 'Try again with a smaller or clearer document'
        });
      } else if (error.type === 'client_error') {
        res.status(422).json({
          error: 'processing_error',
          message: error.message,
          request_id: req.requestId,
          is_retryable: false,
          hint: 'Check your PDF format and content'
        });
      } else {
        res.status(500).json({
          error: 'internal_error',
          message: error.message,
          request_id: req.requestId,
          is_retryable: error.isRetryable || false,
          support: 'Contact support@tu-api.com with this request ID'
        });
      }
    }
  }
);

// ========================================
// ENDPOINTS ADMINISTRATIVOS
// ========================================

// Estadísticas generales (solo para administradores)
app.get('/admin/stats', adminRateLimit, (req, res) => {
  // En producción, añadir autenticación de admin
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  
  try {
    const stats = getClientsStats();
    res.json({
      ...stats,
      server_info: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ========================================
// MIDDLEWARE DE ERROR GLOBAL
// ========================================

// 404 Handler
app.use('*', (req, res) => {
  logger.warn('Endpoint not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip
  });
  
  res.status(404).json({
    error: 'endpoint_not_found',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    available_endpoints: [
      'GET /health',
      'GET /v1/info',
      'GET /v1/plans',
      'POST /v1/risk-assessment',
      'GET /v1/validate-key',
      'GET /v1/billing/stats'
    ]
  });
});

// Error handler global
app.use((error, req, res, next) => {
  const duration = Date.now() - (req.startTime || Date.now());
  
  logApiError(error, req, { 
    context: 'global_error_handler',
    duration 
  });
  
  // Error de payload demasiado grande
  if (error.status === 413 || error.code === 'PAYLOAD_TOO_LARGE') {
    return res.status(413).json({
      error: 'payload_too_large',
      message: error.message,
      max_size: `${process.env.MAX_PDF_SIZE_MB || 10}MB`,
      request_id: req.requestId
    });
  }
  
  // Error de parsing JSON
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'invalid_json',
      message: 'Invalid JSON in request body',
      request_id: req.requestId
    });
  }
  
  // Error genérico
  res.status(500).json({
    error: 'internal_server_error',
    message: 'An unexpected error occurred',
    request_id: req.requestId,
    support: 'Contact support@tu-api.com with this request ID'
  });
});

// ========================================
// INICIAR SERVIDOR
// ========================================

const server = app.listen(PORT, () => {
  logger.info('Risk Assessment API Gateway started', {
    port: PORT,
    environment: process.env.NODE_ENV,
    n8n_webhook: process.env.N8N_WEBHOOK_URL ? 'configured' : 'missing',
    max_pdf_size: `${process.env.MAX_PDF_SIZE_MB || 10}MB`,
    log_level: process.env.LOG_LEVEL || 'info'
  });
  
  console.log(`
🏦 Risk Assessment API Gateway
📡 Server running on port ${PORT}
🔧 Environment: ${process.env.NODE_ENV || 'development'}
🔗 n8n Webhook: ${process.env.N8N_WEBHOOK_URL ? 'configured' : '❌ NOT CONFIGURED'}
📖 Documentation: https://docs.tu-api.com
📧 Support: support@tu-api.com

🔑 Test API Key: rk_test_sandbox123456
🌐 Health Check: http://localhost:${PORT}/health
📊 API Info: http://localhost:${PORT}/v1/info
💳 Plans: http://localhost:${PORT}/v1/plans
  `);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  server.close(() => {
    logger.info('Server closed successfully');
    process.exit(0);
  });
  
  // Forzar cierre después de 10 segundos
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;