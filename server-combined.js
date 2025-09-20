const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.DB_NAME || 'CyrptopayDB';

// Cashfree configuration
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID || "";
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY || "";
const CASHFREE_API_VERSION = process.env.CASHFREE_API_VERSION || "2023-08-01";
const CASHFREE_BASE = process.env.CASHFREE_BASE || "https://sandbox.cashfree.com/pg";

let db = null;

// Helper function to check database connection
function checkDatabaseConnection(res) {
  if (!db) {
    res.status(503).json({ error: 'Database not connected' });
    return false;
  }
  return true;
}

async function connectToDatabase() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.log('⚠️  Server will start without MongoDB connection');
    // Don't throw error - let server start without MongoDB for testing
  }
}

// Middleware
app.use(cors({
  origin: [
    process.env.CLIENT_ORIGIN || "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.1.61:3000",
    "http://192.168.1.61:5173",
    "https://rainbow-gecko-03f305.netlify.app",
    "https://rainbow-gecko-03f305.netlify.app/"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-client-id', 'x-client-secret']
}));
app.use(express.json());

// Serve static files from the React app build directory (if it exists)
const distPath = path.join(__dirname, 'dist');
try {
  if (require('fs').existsSync(distPath)) {
    app.use(express.static(distPath));
    console.log('📁 Serving static files from dist directory');
  } else {
    console.log('⚠️  No dist directory found - static file serving disabled');
  }
} catch (error) {
  console.log('⚠️  Static file serving disabled:', error.message);
}

// ==================== MONGODB ROUTES ====================

// User routes
app.get('/api/users/:uid', async (req, res) => {
  try {
    if (!checkDatabaseConnection(res)) return;
    const { uid } = req.params;
    const user = await db.collection('users').findOne({ uid });
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/users/email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const user = await db.collection('users').findOne({ email });
    res.json(user);
  } catch (error) {
    console.error('Error fetching user by email:', error);
    res.status(500).json({ error: 'Failed to fetch user by email' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const userData = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await db.collection('users').insertOne(userData);
    res.json({ ...userData, _id: result.insertedId });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const updates = {
      ...req.body,
      updatedAt: new Date()
    };
    await db.collection('users').updateOne({ uid }, { $set: updates });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.put('/api/users/:uid/balance', async (req, res) => {
  try {
    const { uid } = req.params;
    const { currency, amount } = req.body;
    
    const updateField = currency === 'INR' ? 'inrBalance' : `cryptoBalances.${currency}`;
    
    await db.collection('users').updateOne(
      { uid },
      { 
        $inc: { [updateField]: amount },
        $set: { updatedAt: new Date() }
      }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating balance:', error);
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

// Transaction routes
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, limit = 50 } = req.query;
    
    const query = { userId };
    if (type) {
      query.type = type;
    }
    
    const transactions = await db.collection('transactions')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();
    
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const transactionData = {
      ...req.body,
      timestamp: new Date()
    };
    const result = await db.collection('transactions').insertOne(transactionData);
    res.json({ ...transactionData, _id: result.insertedId });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// ==================== CASHFREE ROUTES ====================

app.post("/api/create-order", async (req, res) => {
  try {
    const { amount, email, phone, customerId } = req.body;
    console.log("📝 Creating Cashfree order:", { amount, email, phone, customerId });

    const orderId = "order_" + Date.now();

    // Real Cashfree API call
    const payload = {
      order_id: orderId,
      order_amount: Number(amount || 100),
      order_currency: "INR",
      customer_details: {
        customer_id: customerId || "cust_" + Date.now(),
        customer_email: email || "test@cashfree.com",
        customer_phone: phone || "9999999999"
      },
      order_meta: {
        return_url: `${process.env.CLIENT_ORIGIN || "http://localhost:3000"}/return?order_id={order_id}`
      }
    };

    const headers = {
      "x-client-id": CASHFREE_APP_ID,
      "x-client-secret": CASHFREE_SECRET_KEY,
      "x-api-version": CASHFREE_API_VERSION,
      "Content-Type": "application/json"
    };

    console.log("🌐 Using real Cashfree API for order creation");
    const resp = await axios.post(`${CASHFREE_BASE}/orders`, payload, { headers });
    res.json({ ...resp.data, order_id: orderId });
  } catch (err) {
    console.error("❌ Create order error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get("/api/order-status/:order_id", async (req, res) => {
  try {
    const { order_id } = req.params;
    console.log("🔍 Checking Cashfree order status:", order_id);

    const headers = {
      "x-client-id": CASHFREE_APP_ID,
      "x-client-secret": CASHFREE_SECRET_KEY,
      "x-api-version": CASHFREE_API_VERSION
    };
    
    console.log("🌐 Using real Cashfree API for order status");
    const resp = await axios.get(`${CASHFREE_BASE}/orders/${order_id}`, { headers });
    res.json(resp.data);
  } catch (err) {
    console.error("❌ Get order error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post("/api/webhook/cashfree", (req, res) => {
  console.log("🔔 Cashfree webhook received:", req.headers, req.body);
  res.sendStatus(200);
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Combined Crypto Pay Server is running',
    services: {
      mongodb: db ? 'connected' : 'disconnected',
      cashfree: 'sandbox'
    },
    endpoints: {
      mongodb: '/api/users, /api/transactions',
      cashfree: '/api/create-order, /api/order-status'
    },
    timestamp: new Date().toISOString()
  });
});

// ==================== STATIC FILE SERVING ====================

// Catch all handler: send back React's index.html file for any non-API routes
app.use((req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Check if dist directory exists
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (require('fs').existsSync(indexPath)) {
    // Serve React app for all other routes
    res.sendFile(indexPath);
  } else {
    // Return a simple message if no frontend is available
    res.status(200).json({
      message: 'Crypto Pay API Server is running',
      status: 'API Only Mode',
      note: 'Frontend files not found. This server provides API endpoints only.',
      endpoints: {
        health: '/api/health',
        users: '/api/users',
        transactions: '/api/transactions',
        cashfree: '/api/create-order'
      }
    });
  }
});

// ==================== SERVER STARTUP ====================

async function startServer() {
  await connectToDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 Combined Crypto Pay Server running on port ${PORT}`);
    console.log(`📊 MongoDB connected to ${DB_NAME}`);
    console.log(`💳 Cashfree integration: SANDBOX mode`);
    console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📋 MongoDB API: http://localhost:${PORT}/api/users`);
    console.log(`💳 Cashfree API: http://localhost:${PORT}/api/create-order`);
  });
}

startServer().catch(console.error);
