// src/middleware/rateLimiter.js

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Rate limiter dinámico por cliente
const createClientRateLimit = () => {
  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    
    // Límite dinámico basado en el plan del cliente
    max: (req) => {
      if (!req.client) return 10; // Fallback muy bajo para requests sin auth
      return req.client.rate_limit;
    },
    
    // Key personalizada por cliente
    keyGenerator: (req) => {
      return req.client ? req.client.client_id : req.ip;
    },
    
    // Mensaje de error personalizado
    message: (req, res) => {
      const limit = req.client ? req.client.rate_limit : 10;
      const resetTime = new Date(Date.now() + 60 * 60 * 1000);
      
      logger.warn('Rate limit exceeded', {
        client_id: req.client?.client_id,
        plan: req.client?.plan,
        limit: limit,
        ip: req.ip,
        endpoint: req.path
      });
      
      return {
        error: 'rate_limit_exceeded',
        message: `Too many requests. Limit: ${limit} requests per hour for ${req.client?.plan} plan`,
        retry_after: 3600, // 1 hora en segundos
        reset_time: resetTime.toISOString(),
        current_plan: req.client?.plan,
        limits: {
          requests_per_hour: limit,
          requests_per_minute: Math.floor(limit / 60)
        },
        upgrade_info: req.client?.plan === 'basic' ? 
          'Upgrade to Premium for higher limits (1000 req/hour)' : 
          req.client?.plan === 'premium' ?
            'Upgrade to Enterprise for highest limits (5000 req/hour)' :
            req.client?.plan === 'sandbox' ?
              'Upgrade to Basic for production limits (100 req/hour)' :
              null
      };
    },
    
    // Headers estándar para rate limiting
    standardHeaders: true,
    legacyHeaders: false,
    
    // Callback cuando se excede el límite
    handler: (req, res) => {
      const errorResponse = {
        error: 'rate_limit_exceeded',
        message: `Rate limit exceeded for ${req.client?.plan || 'unknown'} plan`,
        details: {
          current_plan: req.client?.plan,
          requests_per_hour: req.client?.rate_limit,
          window_reset: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          client_id: req.client?.client_id
        },
        upgrade_options: req.client?.plan !== 'enterprise' ? {
          contact: 'sales@tu-api.com',
          upgrade_benefits: 'Higher limits, priority support, advanced features'
        } : null
      };
      
      res.status(429).json(errorResponse);
    },
    
    // Skip si es request de health check o info
    skip: (req) => {
      const skipPaths = ['/health', '/v1/info', '/v1/plans'];
      return skipPaths.includes(req.path);
    }
  });
};

// Rate limiter global para endpoints públicos
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por IP
  message: {
    error: 'too_many_requests',
    message: 'Too many requests from this IP, please try again later',
    retry_after: 900 // 15 minutos
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // No aplicar rate limit global a endpoints autenticados
    const authPaths = ['/v1/risk-assessment', '/v1/validate-key', '/v1/billing'];
    return authPaths.some(path => req.path.startsWith(path));
  }
});

// Rate limiter específico para análisis (más restrictivo por minuto)
const analysisRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: (req) => {
    // Límite por minuto basado en el plan
    const planLimits = {
      sandbox: 2,    // 2 análisis por minuto
      basic: 5,      // 5 análisis por minuto
      premium: 20,   // 20 análisis por minuto
      enterprise: 50 // 50 análisis por minuto
    };
    return planLimits[req.client?.plan] || 1;
  },
  keyGenerator: (req) => req.client?.client_id || req.ip,
  message: (req) => {
    const planLimits = {
      sandbox: 2,
      basic: 5,
      premium: 20,
      enterprise: 50
    };
    const limit = planLimits[req.client?.plan] || 1;
    
    return {
      error: 'analysis_rate_limit_exceeded',
      message: `Too many analysis requests per minute for ${req.client?.plan} plan`,
      limits: {
        requests_per_minute: limit,
        current_plan: req.client?.plan
      },
      retry_after: 60,
      hint: 'Space out your requests or upgrade your plan for higher limits',
      next_reset: new Date(Date.now() + 60 * 1000).toISOString()
    };
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter para endpoints administrativos
const adminRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 requests por minuto
  message: {
    error: 'admin_rate_limit_exceeded',
    message: 'Too many requests to administrative endpoints'
  }
});

module.exports = {
  createClientRateLimit,
  globalRateLimit,
  analysisRateLimit,
  adminRateLimit
};