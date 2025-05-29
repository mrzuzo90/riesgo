// src/services/n8nService.js

const axios = require('axios');
const logger = require('../utils/logger');

class N8nService {
  constructor() {
    // Tu URL específica de n8n
    this.webhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n.zimplifai.com/webhook/risk-assessment-private';
    this.timeout = parseInt(process.env.DEFAULT_TIMEOUT_MS) || 60000;
    
    if (!this.webhookUrl) {
      throw new Error('N8N_WEBHOOK_URL environment variable is required');
    }
    
    // Configurar axios con defaults
    this.client = axios.create({
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RiskAssessmentAPI/1.0',
        'Accept': 'application/json'
      }
    });
    
    // Interceptor para logging de requests
    this.client.interceptors.request.use((config) => {
      config.metadata = { startTime: Date.now() };
      
      logger.debug('n8n request started', {
        url: config.url,
        method: config.method,
        timeout: config.timeout,
        content_length: config.data ? JSON.stringify(config.data).length : 0
      });
      return config;
    });
    
    // Interceptor para logging de responses
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        
        logger.debug('n8n request completed', {
          status: response.status,
          duration: `${duration}ms`,
          response_size: JSON.stringify(response.data).length
        });
        
        return response;
      },
      (error) => {
        const duration = error.config?.metadata ? 
          Date.now() - error.config.metadata.startTime : 0;
        
        logger.error('n8n request failed', {
          message: error.message,
          status: error.response?.status,
          duration: `${duration}ms`,
          error_type: this.classifyError(error),
          response_data: error.response?.data
        });
        
        return Promise.reject(error);
      }
    );
  }
  
  async processRiskAssessment(payload, clientInfo) {
    const startTime = Date.now();
    const requestId = payload.request_id || `req_${Date.now()}`;
    
    try {
      // Enriquecer payload con información de la API Gateway
      const enrichedPayload = {
        ...payload,
        api_metadata: {
          client_id: clientInfo.client_id,
          client_name: clientInfo.client_name,
          plan: clientInfo.plan,
          price_per_request: clientInfo.price_per_request,
          request_timestamp: new Date().toISOString(),
          api_version: '1.0',
          gateway_version: '1.0'
        },
        // Añadir información adicional para logging en n8n
        source: 'api_gateway',
        environment: process.env.NODE_ENV || 'development'
      };
      
      logger.info('Sending request to n8n', {
        client_id: clientInfo.client_id,
        request_id: requestId,
        document_type: payload.document_type,
        pdf_size_kb: payload.pdf_base64 ? Math.round(payload.pdf_base64.length * 0.75 / 1024) : 0,
        webhook_url: this.webhookUrl
      });
      
      // Hacer request a n8n
      const response = await this.client.post(this.webhookUrl, enrichedPayload);
      
      const duration = Date.now() - startTime;
      
      // Validar respuesta de n8n
      if (!response.data) {
        throw new Error('Empty response from n8n webhook');
      }
      
      // Verificar si n8n devolvió un error
      if (response.data.status === 'error') {
        const errorMsg = response.data.message || 'Unknown n8n processing error';
        logger.error('n8n processing error', {
          client_id: clientInfo.client_id,
          request_id: requestId,
          error: errorMsg,
          n8n_response: response.data
        });
        throw new Error(`n8n processing error: ${errorMsg}`);
      }
      
      // Log éxito
      logger.info('n8n processing completed successfully', {
        client_id: clientInfo.client_id,
        request_id: requestId,
        duration: `${duration}ms`,
        risk_assessment: response.data.risk_assessment,
        risk_score: response.data.risk_score,
        confidence: response.data.confidence
      });
      
      // Enriquecer respuesta con metadata de API Gateway
      const finalResponse = {
        ...response.data,
        api_metadata: {
          ...response.data.api_metadata,
          gateway_processing_time_ms: duration,
          processed_at: new Date().toISOString(),
          n8n_webhook_url: this.webhookUrl.replace(/\/[^\/]+$/, '/***'), // Ocultar parte final por seguridad
          total_request_time_ms: duration
        }
      };
      
      return finalResponse;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log detallado del error
      logger.error('n8n service error', {
        client_id: clientInfo.client_id,
        request_id: requestId,
        error: error.message,
        duration: `${duration}ms`,
        error_type: this.classifyError(error),
        webhook_url: this.webhookUrl,
        stack: error.stack
      });
      
      // Re-throw con información adicional para el endpoint principal
      const enhancedError = new Error(this.getUserFriendlyErrorMessage(error));
      enhancedError.originalError = error;
      enhancedError.duration = duration;
      enhancedError.type = this.classifyError(error);
      enhancedError.isRetryable = this.isRetryableError(error);
      
      throw enhancedError;
    }
  }
  
  classifyError(error) {
    if (error.code === 'ECONNABORTED') {
      return 'timeout';
    } else if (error.code === 'ECONNREFUSED') {
      return 'connection_refused';
    } else if (error.code === 'ENOTFOUND') {
      return 'dns_error';
    } else if (error.response) {
      const status = error.response.status;
      if (status >= 400 && status < 500) {
        return 'client_error';
      } else if (status >= 500) {
        return 'server_error';
      }
    }
    return 'unknown';
  }
  
  getUserFriendlyErrorMessage(error) {
    const type = this.classifyError(error);
    
    switch (type) {
      case 'timeout':
        return 'Document processing took too long. Please try again with a smaller or clearer document.';
      case 'connection_refused':
        return 'Unable to connect to processing service. Please try again later.';
      case 'dns_error':
        return 'Processing service temporarily unavailable. Please try again later.';
      case 'client_error':
        return 'Invalid document or request format. Please check your PDF and try again.';
      case 'server_error':
        return 'Processing service error. Please try again later.';
      default:
        return 'An unexpected error occurred during document processing.';
    }
  }
  
  isRetryableError(error) {
    const retryableTypes = ['timeout', 'connection_refused', 'server_error'];
    return retryableTypes.includes(this.classifyError(error));
  }
  
  // Health check del webhook n8n
  async healthCheck() {
    try {
      const testPayload = {
        health_check: true,
        timestamp: new Date().toISOString(),
        source: 'api_gateway_health_check'
      };
      
      logger.debug('Performing n8n health check');
      
      const response = await this.client.post(this.webhookUrl, testPayload, {
        timeout: 10000 // 10 segundos para health check
      });
      
      logger.debug('n8n health check completed', {
        status: response.status,
        response_size: JSON.stringify(response.data).length
      });
      
      return {
        status: 'healthy',
        webhook_url: this.webhookUrl.replace(/\/[^\/]+$/, '/***'),
        response_time_ms: Date.now(),
        n8n_status: response.status,
        n8n_response: response.data ? 'received' : 'empty'
      };
      
    } catch (error) {
      logger.warn('n8n health check failed', {
        error: error.message,
        type: this.classifyError(error)
      });
      
      return {
        status: 'unhealthy',
        webhook_url: this.webhookUrl.replace(/\/[^\/]+$/, '/***'),
        error: error.message,
        error_type: this.classifyError(error),
        is_retryable: this.isRetryableError(error)
      };
    }
  }
  
  // Método para cambiar la URL del webhook (útil para testing)
  setWebhookUrl(newUrl) {
    this.webhookUrl = newUrl;
    logger.info('n8n webhook URL updated', {
      new_url: newUrl.replace(/\/[^\/]+$/, '/***')
    });
  }
}

module.exports = new N8nService();