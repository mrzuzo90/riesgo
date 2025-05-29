// src/utils/logger.js

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configurar formato personalizado
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logEntry = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Añadir metadata si existe
    if (Object.keys(meta).length > 0) {
      logEntry += ` | ${JSON.stringify(meta)}`;
    }
    
    return logEntry;
  })
);

// Configurar winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'risk-assessment-api',
    version: '1.0.0',
    pid: process.pid
  },
  transports: [
    // Archivo para errores
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxFiles: 10,
      maxsize: 5242880, // 5MB
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Archivo para warnings
    new winston.transports.File({ 
      filename: path.join(logsDir, 'warn.log'),
      level: 'warn',
      maxFiles: 5,
      maxsize: 5242880, // 5MB
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Archivo para todos los logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxFiles: 10,
      maxsize: 10485760, // 10MB
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Archivo específico para requests de API
    new winston.transports.File({
      filename: path.join(logsDir, 'api-requests.log'),
      level: 'info',
      maxFiles: 7,
      maxsize: 10485760, // 10MB
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          // Solo loggear requests relacionados con API
          if (meta.client_id || meta.request_id || message.includes('request')) {
            return `${timestamp} [${level.toUpperCase()}]: ${message} | ${JSON.stringify(meta)}`;
          }
          return '';
        })
      )
    })
  ]
});

// En desarrollo, también log a consola con formato bonito
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let output = `${timestamp} [${level}]: ${message}`;
        
        // Mostrar metadata importante en consola
        if (meta.client_id) output += ` (Client: ${meta.client_id})`;
        if (meta.request_id) output += ` (Request: ${meta.request_id})`;
        if (meta.duration) output += ` (${meta.duration})`;
        if (meta.error) output += ` (Error: ${meta.error})`;
        
        return output;
      })
    )
  }));
}

// Función para loggear requests HTTP
const logHttpRequest = (req, res, duration) => {
  const logData = {
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    user_agent: req.get('User-Agent'),
    content_length: req.get('Content-Length'),
    client_id: req.client?.client_id,
    request_id: req.requestId
  };
  
  if (res.statusCode >= 400) {
    logger.warn('HTTP request failed', logData);
  } else {
    logger.info('HTTP request completed', logData);
  }
};

// Función para loggear errores de API con contexto completo
const logApiError = (error, req, context = {}) => {
  const errorData = {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.originalUrl,
    client_id: req.client?.client_id,
    request_id: req.requestId,
    ip: req.ip,
    ...context
  };
  
  logger.error('API Error', errorData);
};

// Función para loggear métricas de rendimiento
const logPerformanceMetric = (metric, value, context = {}) => {
  logger.info('Performance metric', {
    metric,
    value,
    timestamp: new Date().toISOString(),
    ...context
  });
};

// Función para loggear eventos de facturación
const logBillingEvent = (event, clientId, amount, context = {}) => {
  logger.info('Billing event', {
    event,
    client_id: clientId,
    amount,
    currency: 'EUR',
    timestamp: new Date().toISOString(),
    ...context
  });
};

// Función para loggear eventos de seguridad
const logSecurityEvent = (event, details, severity = 'warn') => {
  logger[severity]('Security event', {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  // Dar tiempo para escribir logs antes de salir
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason,
    promise: promise,
    timestamp: new Date().toISOString()
  });
});

// Exportar logger principal y funciones auxiliares
module.exports = logger;
module.exports.logHttpRequest = logHttpRequest;
module.exports.logApiError = logApiError;
module.exports.logPerformanceMetric = logPerformanceMetric;
module.exports.logBillingEvent = logBillingEvent;
module.exports.logSecurityEvent = logSecurityEvent;