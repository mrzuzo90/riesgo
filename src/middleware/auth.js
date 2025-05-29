// src/middleware/auth.js

const { validateApiKey } = require('../config/clients');
const logger = require('../utils/logger');

const authenticateApiKey = (req, res, next) => {
  const startTime = Date.now();
  
  // Extraer API key de headers
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') || 
                 req.headers['x-api-key'] ||
                 req.query.api_key; // Fallback para testing (NO usar en producción)
  
  if (!apiKey) {
    logger.warn('API key missing', { 
      ip: req.ip, 
      user_agent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method
    });
    
    return res.status(401).json({
      error: 'authentication_required',
      message: 'API key required. Include it in Authorization header as "Bearer YOUR_KEY" or x-api-key header',
      documentation: 'https://docs.tu-api.com/authentication',
      example: 'Authorization: Bearer rk_live_your_api_key_here'
    });
  }
  
  // Validar API key
  const validation = validateApiKey(apiKey);
  
  if (!validation.valid) {
    logger.warn('Invalid API key attempt', { 
      api_key_prefix: apiKey.substring(0, 12) + '...',
      ip: req.ip,
      error: validation.error,
      endpoint: req.path
    });
    
    return res.status(401).json({
      error: 'invalid_api_key',
      message: validation.error,
      hint: validation.error === 'API key expired' ? 
        'Contact support to renew your API key' : 
        'Check your API key or contact support',
      support: 'support@tu-api.com'
    });
  }
  
  // Añadir información del cliente al request
  req.client = validation.client;
  req.apiKey = apiKey;
  req.authTime = Date.now() - startTime;
  
  logger.info('API key authenticated', {
    client_id: req.client.client_id,
    plan: req.client.plan,
    auth_time: req.authTime,
    endpoint: req.path
  });
  
  next();
};

// Middleware para verificar features específicas
const requireFeature = (feature) => {
  return (req, res, next) => {
    if (!req.client) {
      return res.status(401).json({
        error: 'authentication_required',
        message: 'Authentication required before feature check'
      });
    }
    
    if (!req.client.features.includes(feature)) {
      logger.warn('Feature not available for client', {
        client_id: req.client.client_id,
        plan: req.client.plan,
        requested_feature: feature,
        available_features: req.client.features
      });
      
      const upgradeInfo = req.client.plan === 'sandbox' ? 
        'Upgrade to Basic plan or higher' :
        req.client.plan === 'basic' ? 
          'Upgrade to Premium plan or higher' :
          'Contact support for enterprise features';
      
      return res.status(403).json({
        error: 'feature_not_available',
        message: `Feature '${feature}' not available in your ${req.client.plan} plan`,
        current_plan: req.client.plan,
        available_features: req.client.features,
        upgrade_info: upgradeInfo,
        contact: 'sales@tu-api.com'
      });
    }
    
    next();
  };
};

// Middleware para verificar si el cliente está activo
const requireActiveClient = (req, res, next) => {
  if (!req.client) {
    return res.status(401).json({
      error: 'authentication_required',
      message: 'Authentication required'
    });
  }
  
  if (!req.client.active) {
    logger.warn('Suspended client attempted access', {
      client_id: req.client.client_id,
      endpoint: req.path
    });
    
    return res.status(403).json({
      error: 'account_suspended',
      message: 'Your API access has been suspended',
      reason: 'Account suspended - contact support',
      contact: 'support@tu-api.com'
    });
  }
  
  next();
};

module.exports = {
  authenticateApiKey,
  requireFeature,
  requireActiveClient
};