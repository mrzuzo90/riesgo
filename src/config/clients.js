// src/config/clients.js

const API_KEYS = {
    // Cliente de pruebas - GRATIS
    'rk_test_sandbox123456': {
      client_id: 'sandbox_testing',
      client_name: 'Sandbox Testing',
      plan: 'sandbox',
      rate_limit: 50, // requests por hora
      price_per_request: 0.00,
      active: true,
      created_at: '2025-01-01',
      features: ['basic_analysis'],
      payment_model: 'free'
    },
  
    // Cliente básico - EJEMPLO (cambiar por datos reales)
    'rk_live_basic789012': {
      client_id: 'cliente_fintech_startup',
      client_name: 'Fintech Startup SL',
      plan: 'basic',
      rate_limit: 100,
      price_per_request: 1.50,
      active: true,
      created_at: '2025-01-15',
      features: ['basic_analysis', 'email_notifications'],
      payment_model: 'invoice', // 'invoice', 'credits', 'subscription'
      contact_email: 'contacto@fintech-startup.com'
    },
  
    // Cliente premium - EJEMPLO (cambiar por datos reales)
    'rk_live_premium345678': {
      client_id: 'cliente_banco_grande',
      client_name: 'Banco Grande SA',
      plan: 'premium',
      rate_limit: 1000,
      price_per_request: 2.50,
      active: true,
      created_at: '2025-01-10',
      features: ['basic_analysis', 'advanced_metrics', 'priority_support', 'custom_webhooks'],
      payment_model: 'invoice',
      contact_email: 'api@banco-grande.com'
    },
  
    // Cliente enterprise - EJEMPLO (cambiar por datos reales)
    'rk_live_enterprise901234': {
      client_id: 'cliente_corporacion',
      client_name: 'Corporación Financiera Internacional',
      plan: 'enterprise',
      rate_limit: 5000,
      price_per_request: 2.00, // Descuento por volumen
      active: true,
      created_at: '2025-01-05',
      features: [
        'basic_analysis', 
        'advanced_metrics', 
        'priority_support', 
        'custom_webhooks', 
        'white_label', 
        'dedicated_support'
      ],
      payment_model: 'invoice',
      contact_email: 'integraciones@corp-financiera.com',
      custom_sla: '99.9% uptime, <5s response time'
    }
  };
  
  const PLANS = {
    sandbox: {
      name: 'Sandbox',
      price_per_request: 0.00,
      rate_limit: 50,
      description: 'Para testing y desarrollo - GRATIS',
      features: ['basic_analysis'],
      sla_response_time: '60s',
      support_level: 'community'
    },
    basic: {
      name: 'Basic',
      price_per_request: 1.50,
      rate_limit: 100,
      description: 'Para pequeñas empresas y startups',
      features: ['basic_analysis', 'email_notifications'],
      sla_response_time: '30s',
      support_level: 'email',
      monthly_minimum: 0
    },
    premium: {
      name: 'Premium',
      price_per_request: 2.50,
      rate_limit: 1000,
      description: 'Para empresas medianas con alto volumen',
      features: ['basic_analysis', 'advanced_metrics', 'priority_support', 'custom_webhooks'],
      sla_response_time: '15s',
      support_level: 'priority_email',
      monthly_minimum: 100 // Facturación mínima €250/mes
    },
    enterprise: {
      name: 'Enterprise',
      price_per_request: 2.00,
      rate_limit: 5000,
      description: 'Para grandes corporaciones',
      features: [
        'basic_analysis', 
        'advanced_metrics', 
        'priority_support', 
        'custom_webhooks', 
        'white_label', 
        'dedicated_support'
      ],
      sla_response_time: '10s',
      support_level: 'dedicated_manager',
      monthly_minimum: 500, // Facturación mínima €1000/mes
      custom_contract: true
    }
  };
  
  // Función para validar API key
  function validateApiKey(apiKey) {
    const client = API_KEYS[apiKey];
    
    if (!client) {
      return { valid: false, error: 'Invalid API key' };
    }
    
    if (!client.active) {
      return { valid: false, error: 'API key suspended' };
    }
    
    // Verificar fecha de expiración si existe
    if (client.expires_at && new Date(client.expires_at) < new Date()) {
      return { valid: false, error: 'API key expired' };
    }
    
    return { valid: true, client };
  }
  
  // Función para generar nueva API key (para uso administrativo)
  function generateApiKey(plan = 'basic') {
    const prefix = plan === 'sandbox' ? 'rk_test_' : 'rk_live_';
    const randomPart = Math.random().toString(36).substring(2, 15) + 
                       Math.random().toString(36).substring(2, 15);
    return prefix + randomPart;
  }
  
  // Función para obtener estadísticas de todos los clientes
  function getClientsStats() {
    const activeClients = Object.values(API_KEYS).filter(client => client.active);
    
    return {
      total_clients: Object.keys(API_KEYS).length,
      active_clients: activeClients.length,
      suspended_clients: Object.keys(API_KEYS).length - activeClients.length,
      plans_distribution: {
        sandbox: activeClients.filter(c => c.plan === 'sandbox').length,
        basic: activeClients.filter(c => c.plan === 'basic').length,
        premium: activeClients.filter(c => c.plan === 'premium').length,
        enterprise: activeClients.filter(c => c.plan === 'enterprise').length
      },
      payment_models: {
        free: activeClients.filter(c => c.payment_model === 'free').length,
        invoice: activeClients.filter(c => c.payment_model === 'invoice').length,
        credits: activeClients.filter(c => c.payment_model === 'credits').length,
        subscription: activeClients.filter(c => c.payment_model === 'subscription').length
      }
    };
  }
  
  module.exports = {
    API_KEYS,
    PLANS,
    validateApiKey,
    generateApiKey,
    getClientsStats
  };