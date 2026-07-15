# Real-Time Abandonment Prediction API

## Overview

The Real-Time Abandonment Prediction API provides endpoints to predict user abandonment risk in real-time based on behavioral features captured during the user's session.

## Endpoints

### 1. Predict Abandonment Risk (Single Prediction)

**POST** `/ml/predictions/abandonment`

Make a single real-time prediction for a user session.

#### Request

```json
{
  "features": {
    "timeOnPage": 83,
    "scrollDepth": 41.4,
    "clickMisses": 2,
    "hesitations": 1,
    "abandonmentRisk": 0.2,
    "helpTriggered": 0,
    "hasError": 0,
    "multiplePages": 1,
    "timePerPage": 41.5,
    "clickMissRate": 0.4,
    "hesitationRate": 0.2,
    "frictionScore": 0.35,
    "highFriction": 0,
    "multipleIssues": 0
  },
  "threshold": 0.5,
  "sessionId": "3f50c2a1-8c4d-4f3a-9c2e-1a2b3c4d5e6f"
}
```

#### Response

**Status: 200 OK**

```json
{
  "success": true,
  "prediction": {
    "abandonmentRisk": 0.325,
    "willAbandon": false,
    "confidence": 0.95,
    "threshold": 0.5
  },
  "timestamp": "2026-03-25T10:30:00.000Z",
  "metadata": {
    "modelVersion": "1.0",
    "executionTimeMs": 145
  }
}
```

#### Features Description

| Feature | Type | Range | Description |
|---------|------|-------|-------------|
| `timeOnPage` | number | 0+ | Time spent on current page (seconds) |
| `scrollDepth` | number | 0-100 | Percentage of page scrolled |
| `clickMisses` | integer | 0+ | Number of missed/frustrated clicks |
| `hesitations` | integer | 0+ | Number of hesitation indicators |
| `abandonmentRisk` | number | 0-1 | Initial risk score from analyzer |
| `helpTriggered` | boolean | 0 or 1 | Whether user triggered help (0=no, 1=yes) |
| `hasError` | boolean | 0 or 1 | Whether an error occurred (0=no, 1=yes) |
| `multiplePages` | boolean | 0 or 1 | Whether user viewed multiple pages |
| `timePerPage` | number | 0+ | Average time per page (auto-calculated) |
| `clickMissRate` | number | 0-1 | Ratio of clicks to total interactions (auto-calculated) |
| `hesitationRate` | number | 0-1 | Hesitation frequency (auto-calculated) |
| `frictionScore` | number | 0-1 | Combined friction metric (auto-calculated) |
| `highFriction` | boolean | 0 or 1 | Whether friction exceeds threshold (auto-calculated) |
| `multipleIssues` | boolean | 0 or 1 | Whether multiple friction points detected (auto-calculated) |

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `abandonmentRisk` | number | Probability of abandonment (0-1) |
| `willAbandon` | boolean | Binary classification: true if risk >= threshold |
| `confidence` | number | Confidence level (0-1), higher = more certain |
| `threshold` | number | Decision boundary used for classification |
| `executionTimeMs` | integer | Time to compute prediction (milliseconds) |

#### Example: cURL

```bash
curl -X POST http://localhost:3002/ml/predictions/abandonment \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "features": {
      "timeOnPage": 83,
      "scrollDepth": 41.4,
      "clickMisses": 2,
      "hesitations": 1,
      "abandonmentRisk": 0.2,
      "helpTriggered": 0,
      "hasError": 0,
      "multiplePages": 1
    },
    "threshold": 0.5
  }'
```

#### Example: PowerShell

```powershell
$headers = @{
    "Authorization" = "Bearer <JWT_TOKEN>"
    "Content-Type" = "application/json"
}

$body = @{
    features = @{
        timeOnPage = 83
        scrollDepth = 41.4
        clickMisses = 2
        hesitations = 1
        abandonmentRisk = 0.2
        helpTriggered = 0
        hasError = 0
        multiplePages = 1
    }
    threshold = 0.5
    sessionId = "3f50c2a1-8c4d-4f3a-9c2e-1a2b3c4d5e6f"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:3002/ml/predictions/abandonment" `
    -Method POST `
    -Headers $headers `
    -Body $body
```

---

### 2. Batch Predictions

**POST** `/ml/predictions/batch`

Make predictions for multiple user sessions in a single request.

#### Request

```json
{
  "predictions": [
    {
      "features": {
        "timeOnPage": 83,
        "scrollDepth": 41.4,
        "clickMisses": 2,
        "hesitations": 1,
        "abandonmentRisk": 0.2,
        "helpTriggered": 0,
        "hasError": 0,
        "multiplePages": 1
      },
      "threshold": 0.5
    },
    {
      "features": {
        "timeOnPage": 45,
        "scrollDepth": 25,
        "clickMisses": 0,
        "hesitations": 0,
        "abandonmentRisk": 0.1,
        "helpTriggered": 0,
        "hasError": 0,
        "multiplePages": 0
      },
      "threshold": 0.5
    }
  ]
}
```

#### Response

**Status: 200 OK**

```json
{
  "success": true,
  "total": 2,
  "predictions": [
    {
      "success": true,
      "prediction": {
        "abandonmentRisk": 0.325,
        "willAbandon": false,
        "confidence": 0.95,
        "threshold": 0.5
      },
      "timestamp": "2026-03-25T10:30:00.000Z",
      "metadata": {
        "modelVersion": "1.0",
        "executionTimeMs": 145
      }
    },
    {
      "success": true,
      "prediction": {
        "abandonmentRisk": 0.08,
        "willAbandon": false,
        "confidence": 0.92,
        "threshold": 0.5
      },
      "timestamp": "2026-03-25T10:30:00.001Z",
      "metadata": {
        "modelVersion": "1.0",
        "executionTimeMs": 142
      }
    }
  ],
  "timestamp": "2026-03-25T10:30:00.002Z"
}
```

#### Example: PowerShell

```powershell
$headers = @{
    "Authorization" = "Bearer <JWT_TOKEN>"
    "Content-Type" = "application/json"
}

$body = @{
    predictions = @(
        @{
            features = @{
                timeOnPage = 83
                scrollDepth = 41.4
                clickMisses = 2
                hesitations = 1
                abandonmentRisk = 0.2
                helpTriggered = 0
                hasError = 0
                multiplePages = 1
            }
            threshold = 0.5
        },
        @{
            features = @{
                timeOnPage = 45
                scrollDepth = 25
                clickMisses = 0
                hesitations = 0
                abandonmentRisk = 0.1
                helpTriggered = 0
                hasError = 0
                multiplePages = 0
            }
            threshold = 0.5
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
    -Uri "http://localhost:3002/ml/predictions/batch" `
    -Method POST `
    -Headers $headers `
    -Body $body
```

---

### 3. Model Health Check

**GET** `/ml/predictions/health`

Check if the prediction model is loaded and ready.

#### Request

```bash
GET /ml/predictions/health HTTP/1.1
Authorization: Bearer <JWT_TOKEN>
```

#### Response

**Status: 200 OK**

```json
{
  "success": true,
  "modelLoaded": true,
  "modelVersion": "1.0",
  "featureCount": 14,
  "lastUpdated": "2026-03-25T10:30:00.000Z"
}
```

#### Example: PowerShell

```powershell
$headers = @{
    "Authorization" = "Bearer <JWT_TOKEN>"
}

Invoke-RestMethod `
    -Uri "http://localhost:3002/ml/predictions/health" `
    -Method GET `
    -Headers $headers
```

---

## Authentication

Endpoints accept either:

1. **Dashboard JWT** — `Authorization: Bearer <JWT>` with role `ADMIN`, `DEVELOPER`, or `USER` (abandonment only).
2. **SDK integration PAT** — `Authorization: Bearer td_sdk_...` with scope **`ml:predict`** (abandonment route only).

```
Authorization: Bearer <JWT_OR_PAT>
```

Batch and dataset routes remain **dashboard JWT only** (`ADMIN` / `DEVELOPER`).

### Required Roles / Scopes

- **`/ml/predictions/abandonment`**: JWT `ADMIN` | `DEVELOPER` | `USER`, or PAT with `ml:predict`
- **`/ml/predictions/batch`**: JWT `ADMIN` | `DEVELOPER` only
- **`/ml/predictions/health`**: JWT `ADMIN` | `DEVELOPER` only

### Rate limiting

`POST /ml/predictions/abandonment` is limited to **1 request per 10 seconds per `sessionId`** (HTTP 429). The SDK also caches predictions client-side (~20s).

---

## Error Handling

### 400 Bad Request

Validation error (missing or invalid features)

```json
{
  "statusCode": 400,
  "message": "Features validation failed"
}
```

### 403 Forbidden

Insufficient permissions

```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```

### 500 Model Error

Model not loaded or prediction failed

```json
{
  "success": false,
  "error": "Model not loaded. Service may not be fully initialized.",
  "timestamp": "2026-03-25T10:30:00.000Z"
}
```

---

## Use Cases

### 1. Real-Time Contextual Help

Trigger help/guidance when abandonment risk exceeds threshold:

```typescript
const response = await fetch('/ml/predictions/abandonment', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ features: currentUserBehaviors })
});

const { prediction } = await response.json();

if (prediction.willAbandon && prediction.confidence > 0.8) {
  showContextualHelp();
  triggerAssistance();
}
```

### 2. Session Analytics Dashboard

Display real-time abandonment risk for all active sessions:

```typescript
const sessions = getActiveSessions();
const batchRequest = {
  predictions: sessions.map(s => ({
    features: extractFeatures(s),
    threshold: 0.5
  }))
};

const { predictions } = await fetch('/ml/predictions/batch', {
  method: 'POST',
  body: JSON.stringify(batchRequest)
});

updateDashboard(predictions);
```

### 3. Monitoring and Alerts

Set up alerts when average abandonment risk crosses threshold:

```typescript
const risk = prediction.abandonmentRisk;
if (risk > 0.7) {
  logger.warn('High abandonment risk detected');
  notifySupport({ sessionId, risk, confidence: prediction.confidence });
}
```

---

## Performance

- **Latency**: ~100-200ms per prediction
- **Throughput**: Single predictions optimized for < 200ms
- **Batch**: Efficiently process multiple predictions in parallel
- **Model**: LightGBM (4.6.0), ~50MB model size

---

## Integration Notes

1. **Derived Features**: `timePerPage`, `clickMissRate`, `hesitationRate`, `frictionScore`, `highFriction`, `multipleIssues` are computed server-side if not provided
2. **Missing Features**: Missing input features default to 0.0 (imputation)
3. **Thresholds**: Default threshold is 0.5; adjust based on your risk tolerance
4. **Confidence**: Higher confidence scores (0.8+) indicate more reliable predictions

---

## Future Enhancements

- Model versioning and A/B testing
- Custom threshold per organization
- SHAP value explanations for predictions
- Real-time model retraining pipeline
- Multi-language support
