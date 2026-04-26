# Admin Interface Documentation

## Overview
The Agri-Verify admin interface provides comprehensive management capabilities for the IoT agricultural system, including farmer verification, payment processing, and system maintenance monitoring.

## Features

### 1. Farmer Verification
- **Gava Connect Integration**: Verify farmer identity using national ID
- **Status Tracking**: Monitor verification status for each farmer
- **Real-time Updates**: Instant notification when verification completes

### 2. Payment Management
- **Daraja STK Push**: Initiate mobile money payments
- **Payment Status**: Track pending, completed, and failed payments
- **Due Date Monitoring**: Monitor payment schedules

### 3. System Status Monitoring
- **Device Health**: Check if systems need maintenance
- **Payment Status**: Verify if systems are paid for
- **Farmer Ownership**: Confirm correct farmer possession
- **Last Activity**: Monitor when devices last sent data

### 4. Maintenance Management
- **Status Updates**: Mark systems as needing maintenance
- **Service Notes**: Add maintenance notes and history
- **Real-time Alerts**: Get notified of system issues

## Access
- **URL**: `http://localhost:3000/admin`
- **Navigation**: Available from main dashboard via "Admin" link

## API Endpoints

### GET /admin/systems
Returns all systems with farmer and payment information:
```json
{
  "id": 1,
  "device_id": "ESP32_001",
  "farmer_name": "John Kamau",
  "phone": "254712345678",
  "verified": false,
  "payment_status": "pending",
  "last_telemetry": "2024-04-09T11:39:49Z"
}
```

### POST /admin/verify-farmer
Verify farmer using Gava Connect:
```json
{
  "farmerId": 1,
  "nationalId": "12345678"
}
```

### POST /admin/initiate-payment
Initiate Daraja STK Push payment:
```json
{
  "deviceId": 1,
  "phone": "254712345678",
  "amount": 500
}
```

### POST /admin/maintenance
Update system maintenance status:
```json
{
  "deviceId": 1,
  "status": "needs_maintenance",
  "notes": "Sensor calibration required"
}
```

## Usage Workflow

1. **System Overview**: View all registered systems and their status
2. **Farmer Verification**: For unverified farmers, click "Verify Farmer" and enter national ID
3. **Payment Processing**: Click "Request Payment" to send STK push to farmer's phone
4. **Maintenance Updates**: Use "Maintenance" button to update system status and add notes

## Real-time Features
- WebSocket integration for live updates
- Automatic refresh when verification/payment status changes
- Instant notifications for system events
