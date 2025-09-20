# Crypto Pay Combined Server

This is a combined backend server that includes both MongoDB database operations and Cashfree payment gateway integration.

## Features

- **MongoDB Integration**: User management, transaction logging, balance updates
- **Cashfree Integration**: Payment processing, order management, webhook handling
- **Static File Serving**: Serves React frontend build files
- **CORS Support**: Configured for multiple client origins
- **Environment Configuration**: Supports both development and production environments

## API Endpoints

### MongoDB Endpoints
- `GET /api/users/:uid` - Get user by UID
- `GET /api/users/email/:email` - Get user by email
- `POST /api/users` - Create new user
- `PUT /api/users/:uid` - Update user
- `PUT /api/users/:uid/balance` - Update user balance
- `GET /api/transactions/:userId` - Get user transactions
- `POST /api/transactions` - Create transaction

### Cashfree Endpoints
- `POST /api/create-order` - Create payment order
- `GET /api/order-status/:order_id` - Check order status
- `POST /api/webhook/cashfree` - Cashfree webhook handler

### Utility Endpoints
- `GET /api/health` - Health check
- `GET /*` - Serve React frontend (SPA routing)

## Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=production

# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
DB_NAME=CyrptopayDB

# Cashfree Configuration
CASHFREE_APP_ID=your_app_id
CASHFREE_SECRET_KEY=your_secret_key
CASHFREE_API_VERSION=2023-08-01
CASHFREE_BASE=https://sandbox.cashfree.com/pg

# Client Configuration
CLIENT_ORIGIN=http://localhost:3000
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp env.example .env
```

3. Update `.env` with your actual values

4. Start the server:
```bash
npm start
```

## File Structure

```
Backend/
├── server-combined.js    # Main combined server
├── package.json          # Dependencies and scripts
├── package-lock.json     # Dependency lock file
├── render.yaml          # Render deployment config
├── env.example          # Environment variables template
├── README.md            # This documentation
└── node_modules/        # Installed dependencies
```

## Deployment on Render

This server provides **API endpoints only**. It does not serve the React frontend.

### Deploy API Server:

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Use the following settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node.js
   - **Plan**: Free

4. Add environment variables in Render dashboard:
   - `MONGODB_URI`
   - `CASHFREE_APP_ID`
   - `CASHFREE_SECRET_KEY`
   - `CLIENT_ORIGIN` (your frontend domain)

### Deploy Frontend Separately:

Deploy your React frontend (`new/` folder) separately to:
- Netlify
- Vercel
- Render (as a separate service)
- Or any other static hosting service

Then update the frontend's API configuration to point to your deployed API server.

## Frontend Configuration

Update your frontend to use the combined server:

### API Service (`src/services/api.ts`)
```typescript
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-combined-server.onrender.com/api' 
  : 'http://localhost:5000/api';
```

### Cashfree Config (`src/config/cashfree.ts`)
```typescript
getEndpoints() {
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? 'https://your-combined-server.onrender.com/api'
    : 'http://localhost:5000/api';
  
  return {
    createOrder: `${baseUrl}/create-order`,
    orderStatus: `${baseUrl}/order-status`,
    webhook: `${baseUrl}/webhook/cashfree`
  };
}
```

## Benefits

- **Single Deployment**: One server handles both database and payment operations
- **Reduced Complexity**: No need to manage multiple servers
- **Cost Effective**: Single Render service instead of multiple
- **Easier Maintenance**: All backend logic in one place
- **Better Performance**: Reduced network calls between services

## Health Check

Visit `/api/health` to check server status:
```json
{
  "status": "OK",
  "message": "Combined Crypto Pay Server is running",
  "services": {
    "mongodb": "connected",
    "cashfree": "sandbox"
  },
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```
