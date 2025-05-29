// src/services/billingService.js

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class BillingService {
  constructor() {
    this.billingDataPath = path.join(__dirname, '../../data/billing');
    this.ensureBillingDir();
  }
  
  async ensureBillingDir() {
    try {
      await fs.mkdir(this.billingDataPath, { recursive: true });
      logger.debug('Billing directory ensured', { path: this.billingDataPath });
    } catch (error) {
      logger.error('Failed to create billing directory', { 
        error: error.message, 
        path: this.billingDataPath 
      });
    }
  }
  
  // Registrar uso de API para facturación
  async recordUsage(clientId, requestData) {
    const usage = {
      timestamp: new Date().toISOString(),
      client_id: clientId,
      request_id: requestData.request_id,
      document_type: requestData.document_type,
      processing_time_ms: requestData.processing_time_ms,
      billable_amount: requestData.billable_amount,
      status: requestData.status, // 'success', 'error', 'timeout'
      api_version: '1.0',
      risk_assessment: requestData.risk_assessment || null,
      risk_score: requestData.risk_score || null,
      confidence: requestData.confidence || null,
      pdf_size_kb: requestData.pdf_size_kb || null
    };
    
    try {
      // Guardar en archivo por mes (formato: clientId_YYYY-MM.json)
      const monthKey = new Date().toISOString().substring(0, 7); // 2025-05
      const filePath = path.join(this.billingDataPath, `${clientId}_${monthKey}.json`);
      
      let monthlyUsage = [];
      try {
        const existing = await fs.readFile(filePath, 'utf8');
        monthlyUsage = JSON.parse(existing);
      } catch (error) {
        // Archivo no existe, crear nuevo array
        logger.debug('Creating new billing file', { client_id: clientId, month: monthKey });
      }
      
      monthlyUsage.push(usage);
      await fs.writeFile(filePath, JSON.stringify(monthlyUsage, null, 2));
      
      logger.info('Usage recorded for billing', {
        client_id: clientId,
        request_id: requestData.request_id,
        amount: requestData.billable_amount,
        status: requestData.status,
        month: monthKey,
        total_records_this_month: monthlyUsage.length
      });
      
      return usage;
      
    } catch (error) {
      logger.error('Failed to record usage', {
        client_id: clientId,
        request_id: requestData.request_id,
        error: error.message
      });
      throw error;
    }
  }
  
  // Generar reporte mensual para facturación
  async generateMonthlyReport(clientId, year, month) {
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    const filePath = path.join(this.billingDataPath, `${clientId}_${monthKey}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const usage = JSON.parse(data);
      
      if (usage.length === 0) {
        return null;
      }
      
      // Calcular estadísticas
      const successfulRequests = usage.filter(u => u.status === 'success');
      const failedRequests = usage.filter(u => u.status === 'error');
      const timeoutRequests = usage.filter(u => u.status === 'timeout');
      
      const totalAmount = usage.reduce((sum, u) => sum + (u.billable_amount || 0), 0);
      const avgProcessingTime = usage.reduce((sum, u) => sum + (u.processing_time_ms || 0), 0) / usage.length;
      
      const report = {
        client_id: clientId,
        period: monthKey,
        generated_at: new Date().toISOString(),
        
        // Resumen general
        summary: {
          total_requests: usage.length,
          successful_requests: successfulRequests.length,
          failed_requests: failedRequests.length,
          timeout_requests: timeoutRequests.length,
          success_rate: ((successfulRequests.length / usage.length) * 100).toFixed(1) + '%',
          total_amount_eur: parseFloat(totalAmount.toFixed(2)),
          average_processing_time_ms: Math.round(avgProcessingTime)
        },
        
        // Desglose por tipo de documento
        breakdown_by_document_type: this.groupByDocumentType(usage),
        
        // Uso diario
        daily_usage: this.groupByDay(usage),
        
        // Estadísticas de rendimiento
        performance_stats: {
          avg_risk_score: this.calculateAvgRiskScore(successfulRequests),
          risk_distribution: this.getRiskDistribution(successfulRequests),
          avg_confidence: this.calculateAvgConfidence(successfulRequests)
        },
        
        // Detalles para facturación
        billing_details: {
          billable_requests: usage.filter(u => u.billable_amount > 0).length,
          free_requests: usage.filter(u => u.billable_amount === 0).length,
          total_billable_amount: totalAmount,
          currency: 'EUR'
        },
        
        // Uso detallado (opcional, para debugging)
        detailed_usage: usage.map(u => ({
          timestamp: u.timestamp,
          request_id: u.request_id,
          document_type: u.document_type,
          status: u.status,
          billable_amount: u.billable_amount,
          risk_assessment: u.risk_assessment,
          risk_score: u.risk_score
        }))
      };
      
      logger.info('Monthly report generated', {
        client_id: clientId,
        period: monthKey,
        total_requests: usage.length,
        total_amount: totalAmount
      });
      
      return report;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No usage data found for period', {
          client_id: clientId,
          period: monthKey
        });
        return null;
      }
      
      logger.error('Failed to generate monthly report', {
        client_id: clientId,
        period: monthKey,
        error: error.message
      });
      throw error;
    }
  }
  
  // Obtener estadísticas de uso para dashboard
  async getUsageStats(clientId, days = 30) {
    const stats = {
      client_id: clientId,
      period_days: days,
      period_start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
      period_end: new Date().toISOString(),
      total_requests: 0,
      total_amount: 0,
      success_rate: 0,
      daily_breakdown: []
    };
    
    try {
      // Para simplicidad, leer el archivo del mes actual
      // En producción real, podrías implementar lectura de múltiples meses
      const currentMonth = new Date().toISOString().substring(0, 7);
      const filePath = path.join(this.billingDataPath, `${clientId}_${currentMonth}.json`);
      
      const data = await fs.readFile(filePath, 'utf8');
      const usage = JSON.parse(data);
      
      // Filtrar por los últimos N días
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const recentUsage = usage.filter(u => new Date(u.timestamp) >= cutoffDate);
      
      stats.total_requests = recentUsage.length;
      stats.total_amount = recentUsage.reduce((sum, u) => sum + (u.billable_amount || 0), 0);
      
      const successfulRequests = recentUsage.filter(u => u.status === 'success').length;
      stats.success_rate = recentUsage.length > 0 ? 
        ((successfulRequests / recentUsage.length) * 100).toFixed(1) + '%' : '0%';
      
      stats.daily_breakdown = this.groupByDay(recentUsage);
      
      return stats;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // No hay datos aún
        return stats;
      }
      throw error;
    }
  }
  
  // Funciones auxiliares para agrupación y cálculos
  groupByDocumentType(usage) {
    const groups = {};
    usage.forEach(u => {
      if (!groups[u.document_type]) {
        groups[u.document_type] = {
          count: 0,
          amount: 0,
          success_count: 0
        };
      }
      groups[u.document_type].count++;
      groups[u.document_type].amount += u.billable_amount || 0;
      if (u.status === 'success') {
        groups[u.document_type].success_count++;
      }
    });
    
    // Añadir success rate a cada grupo
    Object.keys(groups).forEach(type => {
      groups[type].success_rate = groups[type].count > 0 ?
        ((groups[type].success_count / groups[type].count) * 100).toFixed(1) + '%' : '0%';
    });
    
    return groups;
  }
  
  groupByDay(usage) {
    const groups = {};
    usage.forEach(u => {
      const day = u.timestamp.substring(0, 10); // YYYY-MM-DD
      if (!groups[day]) {
        groups[day] = {
          requests: 0,
          amount: 0,
          successful_requests: 0
        };
      }
      groups[day].requests++;
      groups[day].amount += u.billable_amount || 0;
      if (u.status === 'success') {
        groups[day].successful_requests++;
      }
    });
    
    // Convertir a array ordenado
    return Object.keys(groups)
      .sort()
      .map(day => ({
        date: day,
        ...groups[day],
        success_rate: groups[day].requests > 0 ?
          ((groups[day].successful_requests / groups[day].requests) * 100).toFixed(1) + '%' : '0%'
      }));
  }
  
  calculateAvgRiskScore(successfulRequests) {
    const scoresWithValues = successfulRequests.filter(u => u.risk_score != null);
    if (scoresWithValues.length === 0) return null;
    
    const avgScore = scoresWithValues.reduce((sum, u) => sum + u.risk_score, 0) / scoresWithValues.length;
    return Math.round(avgScore);
  }
  
  calculateAvgConfidence(successfulRequests) {
    const confidenceWithValues = successfulRequests.filter(u => u.confidence != null);
    if (confidenceWithValues.length === 0) return null;
    
    const avgConfidence = confidenceWithValues.reduce((sum, u) => sum + u.confidence, 0) / confidenceWithValues.length;
    return parseFloat(avgConfidence.toFixed(3));
  }
  
  getRiskDistribution(successfulRequests) {
    const distribution = {
      SOLVENTE: 0,
      RIESGO_MEDIO: 0,
      NO_SOLVENTE: 0
    };
    
    successfulRequests.forEach(u => {
      if (u.risk_assessment && distribution.hasOwnProperty(u.risk_assessment)) {
        distribution[u.risk_assessment]++;
      }
    });
    
    return distribution;
  }
}

module.exports = new BillingService();