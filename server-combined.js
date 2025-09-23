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

// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_ORIGIN || "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.61:3000",
  "http://192.168.1.61:5173",
  "https://rainbow-gecko-03f305.netlify.app",
  "https://rainbow-gecko-03f305.netlify.app/",
  "https://cryptopay2.netlify.app",
  "https://cryptopay2.netlify.app/"
];

console.log("🌐 CORS Configuration:", {
  clientOrigin: process.env.CLIENT_ORIGIN,
  allowedOrigins: allowedOrigins,
  timestamp: new Date().toISOString()
});

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Normalize origin by removing trailing slash for comparison
    const normalizedOrigin = origin.replace(/\/$/, '');
    const normalizedAllowedOrigins = allowedOrigins.map(orig => orig.replace(/\/$/, ''));
    
    if (normalizedAllowedOrigins.indexOf(normalizedOrigin) !== -1) {
      console.log("✅ CORS: Origin allowed:", origin);
      callback(null, true);
    } else {
      console.log("❌ CORS: Origin blocked:", origin);
      console.log("🔍 Allowed origins:", normalizedAllowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-client-id', 'x-client-secret', 'X-Client-Id', 'X-Client-Secret']
}));

// CORS middleware handles preflight requests automatically

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

// ==================== BANK VERIFICATION ====================

// Test endpoint to check if bank verification service is working
// Test endpoint for CORS
app.get("/api/cors-test", (req, res) => {
  res.json({
    success: true,
    message: "CORS is working! Server is accessible from frontend.",
    timestamp: new Date().toISOString(),
    origin: req.headers.origin || "No origin header",
    userAgent: req.headers['user-agent'] || "No user agent"
  });
});

app.get("/api/verify-bank/test", (req, res) => {
  res.json({
    success: true,
    message: "Bank verification service is running - Checking env vars",
    timestamp: new Date().toISOString(),
    environment: {
      // Check the payout API env vars
      hasClientId: !!process.env.CASHFREE_CLIENT_ID,
      hasClientSecret: !!process.env.CASHFREE_CLIENT_SECRET,
      hasPayoutBase: !!process.env.CASHFREE_PAYOUT_BASE,
      // Show actual values (first few chars only for security)
      clientIdValue: process.env.CASHFREE_CLIENT_ID ? process.env.CASHFREE_CLIENT_ID.substring(0, 10) + "..." : "NOT SET",
      clientSecretValue: process.env.CASHFREE_CLIENT_SECRET ? process.env.CASHFREE_CLIENT_SECRET.substring(0, 10) + "..." : "NOT SET",
      payoutBaseValue: process.env.CASHFREE_PAYOUT_BASE || "NOT SET"
    }
  });
});

app.post("/api/verify-bank", async (req, res) => {
  try {
    console.log("🔍 Bank verification request received:", req.body);
    
    const { accountNumber, ifscCode } = req.body;

    if (!accountNumber || !ifscCode) {
      console.log("❌ Missing required fields:", { accountNumber: !!accountNumber, ifscCode: !!ifscCode });
      return res.status(400).json({ 
        success: false, 
        message: "Account number and IFSC code are required" 
      });
    }

    // Razorpay IFSC API for bank verification (no credentials required)
    const RAZORPAY_IFSC_BASE = "https://ifsc.razorpay.com";
    
    console.log("🔧 Using Razorpay IFSC API for bank verification");
    console.log("🚀 Making Razorpay IFSC API call to:", `${RAZORPAY_IFSC_BASE}/${ifscCode}`);
    
    // Validate IFSC format first
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid IFSC code format. Please enter a valid IFSC code."
      });
    }

    // Make Razorpay IFSC API call for bank and branch lookup
    const response = await axios.get(
      `${RAZORPAY_IFSC_BASE}/${ifscCode.toUpperCase()}`,
      {
        timeout: 10000 // 10 second timeout
      }
    );

    console.log("✅ Razorpay IFSC API response:", response.status, response.data);
    const data = response.data;

    if (data && data.BANK && data.BRANCH) {
      console.log("🎉 Bank verification successful:", data);
      
      return res.status(200).json({
        success: true,
        bankName: data.BANK,
        branchName: data.BRANCH,
        ifsc: data.IFSC,
        city: data.CITY,
        district: data.DISTRICT,
        state: data.STATE,
        note: "Bank details verified using Razorpay IFSC API"
      });
    } else {
      console.log("❌ Razorpay IFSC API returned invalid data:", data);
      return res.status(400).json({ 
        success: false, 
        message: "Invalid IFSC code or bank details not found" 
      });
    }
  } catch (error) {
    console.error("💥 Bank verification error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      stack: error.stack
    });
    
    if (error.response) {
      // Cashfree API error
      console.log("🔴 Cashfree API error response:", error.response.status, error.response.data);
      console.log("🔴 Full error response:", JSON.stringify(error.response.data, null, 2));
      
      const errorMessage = error.response.data?.message || 
                          error.response.data?.error || 
                          error.response.data?.errorMessage ||
                          `Cashfree API error: ${error.response.status}`;
      
      return res.status(400).json({
        success: false,
        message: errorMessage,
        details: error.response.data,
        statusCode: error.response.status
      });
    } else if (error.code === 'ECONNABORTED') {
      // Timeout error
      console.log("🔴 Request timeout");
      return res.status(500).json({
        success: false,
        message: "Request timeout - Cashfree API took too long to respond"
      });
    } else {
      // Network or other error
      console.log("🔴 Network/other error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Internal server error during bank verification: " + error.message
      });
    }
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  // Explicitly set CORS headers
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  res.json({ 
    status: 'OK', 
    message: 'Combined Crypto Pay Server is running',
    services: {
      mongodb: db ? 'connected' : 'disconnected',
      cashfree: 'sandbox'
    },
    endpoints: {
      mongodb: '/api/users, /api/transactions',
      cashfree: '/api/create-order, /api/order-status',
      bank: '/api/verify-bank, /api/verify-bank/test'
    },
    timestamp: new Date().toISOString(),
    cors: {
      origin: req.headers.origin,
      allowed: true
    }
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
