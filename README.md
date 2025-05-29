# Risk Assessment API Gateway

🏦 **AI-powered financial document risk assessment API** que procesa documentos PDF (declaraciones de renta, estados patrimoniales) y devuelve análisis de riesgo crediticio automático.

## 🚀 Características

- ✅ **Análisis automático** de documentos financieros con IA
- ✅ **OCR avanzado** con Mistral para extraer datos de PDFs complejos
- ✅ **API Gateway profesional** con autenticación y rate limiting
- ✅ **Sistema de facturación** integrado para múltiples clientes
- ✅ **Múltiples planes** (Sandbox, Basic, Premium, Enterprise)
- ✅ **Logging completo** y monitoreo de rendimiento
- ✅ **Documentación automática** de la API

## 📋 Requisitos

- **Node.js** 16+ 
- **npm** 8+
- **n8n instance** con workflow de risk assessment
- **VPS/Servidor** para hosting

## 🛠️ Instalación

### 1. Clonar repositorio
```bash
git clone https://github.com/tu-usuario/risk-assessment-api.git
cd risk-assessment-api
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
nano .env
```

**Variables requeridas:**
```bash
# Servidor
PORT=3000
NODE_ENV=production

# n8n Webhook URL (IMPORTANTE: Cambiar a URL privada)
N8N_WEBHOOK_URL=https://n8n.zimplifai.com/webhook/risk-assessment-private

# Seguridad
JWT_SECRET=tu-secreto-super-seguro-aqui

# Límites
MAX_PDF_SIZE_MB=10
DEFAULT_TIMEOUT_MS=60000
```

### 4. Configurar n8n Webhook

En tu instancia n8n:
1. Ve a tu workflow de risk assessment
2. **Cambia la URL del webhook** de `risk-assessment` a `risk-assessment-private`
3. Esto protege tu webhook de acceso directo

### 5. Ejecutar la API

**Desarrollo:**
```bash
npm run dev
```

**Producción:**
```bash
npm start
```

## 🔧 Configuración en VPS

### Usando PM2 (recomendado)
```bash
# Instalar PM2
npm install -g pm2

# Ejecutar API
pm2 start src/app.js --name "risk-api"

# Ver logs
pm2 logs risk-api

# Monitoreo
pm2 monit

# Auto-start en reinicio
pm2 startup
pm2 save
```

### Nginx como Proxy Reverso
```nginx
# /etc/nginx/sites-available/risk-api
server {
    listen 80;
    server_name tu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📚 Uso de la API

### Autenticación
Incluir API key en headers:
```javascript
Headers: {
  'Authorization': 'Bearer rk_live_tu_api_key',
  'Content-Type': 'application/json'
}
```

### Endpoint Principal
```http
POST /v1/risk-assessment
```

**Request:**
```json
{
  "client_name": "Juan Pérez García",
  "client_id": "CLI-2025-001",
  "document_type": "renta",
  "pdf_base64": "JVBERi0xLjQK..."
}
```

**Response:**
```json
{
  "status": "success",
  "client_id": "CLI-2025-001",
  "risk_assessment": "SOLVENTE",
  "risk_score": 85,
  "determining_factor": {
    "type": "renta_neta",
    "value": 65000,
    "currency": "EUR"
  },
  "confidence": 0.92,
  "key_metrics": {
    "ingresos_anuales": 65000,
    "patrimonio_neto": 120000,
    "ratio_deuda_ingresos": 18.5
  },
  "api_metadata": {
    "total_processing_time_ms": 3250,
    "billable_amount": 2.50
  }
}
```

### Otros Endpoints

```http
GET /health                     # Health check
GET /v1/info                   # Información de la API
GET /v1/plans                  # Planes disponibles
GET /v1/validate-key           # Validar API key
GET /v1/billing/stats          # Estadísticas de uso
GET /v1/billing/report/2025/5  # Reporte mensual
```

## 🔑 Gestión de Clientes

### Planes Disponibles

| Plan | Precio/Request | Límite/Hora | Características |
|------|----------------|-------------|-----------------|
| **Sandbox** | €0.00 | 50 | Testing gratis |
| **Basic** | €1.50 | 100 | Pequeñas empresas |
| **Premium** | €2.50 | 1,000 | Empresas medianas |
| **Enterprise** | €2.00 | 5,000 | Grandes corporaciones |

### Añadir Nuevo Cliente

Editar `src/config/clients.js`:

```javascript
'rk_live_nuevo_cliente': {
  client_id: 'cliente_nuevo',
  client_name: 'Empresa Nueva SL',
  plan: 'premium',
  rate_limit: 1000,
  price_per_request: 2.50,
  active: true,
  features: ['basic_analysis', 'advanced_metrics'],
  payment_model: 'invoice',
  contact_email: 'api@empresa-nueva.com'
}
```

## 📊 Facturación

### Sistema Manual
- Registra automáticamente el uso por cliente
- Genera reportes mensuales
- Exporta datos para facturación externa

### Archivos de Datos
```
data/
├── billing/
│   ├── cliente1_2025-05.json
│   ├── cliente2_2025-05.json
│   └── ...
└── credits/ (futuro)
```

### Generar Reporte
```javascript
// Reporte de Mayo 2025 para cliente específico
GET /v1/billing/report/2025/5
```

## 📝 Logs

Los logs se guardan en:
```
logs/
├── error.log          # Solo errores
├── warn.log           # Warnings
├── combined.log       # Todos los logs
└── api-requests.log   # Requests de API
```

## 🔐 Seguridad

- ✅ **API Keys** únicas por cliente
- ✅ **Rate limiting** dinámico por plan
- ✅ **Helmet.js** para headers de seguridad
- ✅ **CORS** configurado
- ✅ **Validación** de inputs
- ✅ **Logging** de eventos de seguridad

## 🚨 Monitoreo

### Health Check
```bash
curl https://tu-dominio.com/health
```

### Logs en Tiempo Real
```bash
pm2 logs risk-api --lines 100
```

### Métricas de Cliente
```bash
curl -H "Authorization: Bearer API_KEY" \
     https://tu-dominio.com/v1/billing/stats?days=30
```

## 🐛 Troubleshooting

### Error: n8n webhook no responde
1. Verificar que n8n esté ejecutándose
### Error: n8n webhook no responde
1. Verificar que n8n esté ejecutándose
2. Confirmar URL del webhook en `.env`
3. Testear webhook directamente:
```bash
curl -X POST https://n8n.zimplifai.com/webhook/risk-assessment-private \
     -H "Content-Type: application/json" \
     -d '{"health_check": true}'
```

### Error: "Rate limit exceeded"
- Cliente excedió límites de su plan
- Esperar reset (1 hora) o upgrade de plan
- Verificar configuración en `src/config/clients.js`

### Error: "PDF too large"
- Aumentar `MAX_PDF_SIZE_MB` en `.env`
- Reiniciar API: `pm2 restart risk-api`

### Error: "Invalid API key"
- Verificar API key en `src/config/clients.js`
- Confirmar que `active: true`

### Logs Útiles
```bash
# Ver errores específicos
tail -f logs/error.log

# Ver requests de API
tail -f logs/api-requests.log

# Ver todos los logs
pm2 logs risk-api
```

## 🔄 Actualización

### Código
```bash
git pull origin main
npm install
pm2 restart risk-api
```

### Configuración de Clientes
```bash
# Editar clientes
nano src/config/clients.js

# Reiniciar API
pm2 restart risk-api
```

## 📈 Escalabilidad

### Para Alto Volumen
1. **Load Balancer** con múltiples instancias
2. **Base de datos** (MongoDB/PostgreSQL) en lugar de archivos JSON
3. **Redis** para rate limiting distribuido
4. **Queue system** (Bull/Bee) para procesar requests

### Configuración Multi-Instancia
```bash
# PM2 Cluster Mode
pm2 start src/app.js -i max --name "risk-api-cluster"
```

## 🔒 SSL/HTTPS

### Con Certbot (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
```

### Configuración Nginx con SSL
```nginx
server {
    listen 443 ssl;
    server_name tu-dominio.com;
    
    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        # ... resto de configuración
    }
}
```

## 📞 Soporte

### Contacto
- **Email:** support@tu-api.com
- **Ventas:** sales@tu-api.com
- **Documentación:** https://docs.tu-api.com

### Issues Comunes
1. **Timeout en PDFs grandes:** Aumentar `DEFAULT_TIMEOUT_MS`
2. **Memory issues:** Aumentar memoria del VPS o usar cluster mode
3. **n8n slow:** Optimizar workflow o usar instancia más potente

### Logs para Soporte
Al reportar problemas, incluir:
```bash
# Request ID del error
grep "REQUEST_ID" logs/error.log

# Contexto del cliente
grep "CLIENT_ID" logs/api-requests.log
```

## 🚀 Roadmap

### v1.1 (Próxima versión)
- [ ] Sistema de créditos prepago
- [ ] Integración con Stripe
- [ ] Dashboard web para clientes
- [ ] Webhooks para notificaciones

### v1.2 (Futuro)
- [ ] Análisis batch de múltiples documentos
- [ ] Machine learning para mejorar precisión
- [ ] API de comparación de riesgo
- [ ] Integración con CRMs populares

### v2.0 (Long-term)
- [ ] Análisis de otros tipos de documentos
- [ ] Multi-idioma (inglés, francés)
- [ ] Mobile SDK
- [ ] Blockchain para auditoría

## 📄 Licencia

MIT License - Ver archivo `LICENSE` para detalles.

## 🤝 Contribuir

1. Fork del repositorio
2. Crear feature branch: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -am 'Añadir nueva funcionalidad'`
4. Push a branch: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

---

## ⚡ Quick Start

```bash
# 1. Clonar e instalar
git clone https://github.com/tu-usuario/risk-assessment-api.git
cd risk-assessment-api
npm install

# 2. Configurar
cp .env.example .env
# Editar .env con tu configuración

# 3. Ejecutar
npm run dev

# 4. Probar
curl http://localhost:3000/health
```

## 🧪 Testing

### API Key de Prueba
```
rk_test_sandbox123456
```

### Request de Prueba
```bash
curl -X POST http://localhost:3000/v1/risk-assessment \
  -H "Authorization: Bearer rk_test_sandbox123456" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Client",
    "client_id": "TEST-001", 
    "document_type": "renta",
    "pdf_base64": "JVBERi0xLjQK..."
  }'
```

### Script de Testing
```bash
npm run test
```

---

**🏦 Risk Assessment API - Potenciado por IA, Hecho para Escalar**