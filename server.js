// server.js

const express = require('express');
const fetch = require('node-fetch'); // You may need to run: npm install node-fetch@2
var cors = require('cors');

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

const PORT = process.env.PORT || 3000;

// --- Configuration ---
// It's best practice to use environment variables for sensitive data
const ZOHO = {
  apiUrl: "https://www.zohoapis.com/crm/v7/Leads",
  accessToken: process.env.ZOHO_ACCESS_TOKEN || "1000.615e8f40e338e1d648088a02b2026e82.31257da10da2afe9a534cd61028c9e90",
  refreshToken: process.env.ZOHO_REFRESH_TOKEN || "1000.07ee7b164b98028db248e4fb2a1163d3.ec0f80e9fb79d23656d6afee17094c99",
  clientId: process.env.ZOHO_CLIENT_ID || "1000.PNRE5G8CDI88P8IVZD7RINQFAURL0C",
  clientSecret: process.env.ZOHO_CLIENT_SECRET || "d2fa028fc8b3415b10928833fb231b824a0f5f628b",
  tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
};

// --- In-Memory Database ---
// In a real app, you'd use a persistent database like Redis, PostgreSQL, etc.
// This object will store the state of tracked carts.
const trackedCarts = {};

// Set middleware of CORS 
app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://fitmantra.co.in"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS,CONNECT,TRACE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Content-Type-Options, Accept, X-Requested-With, Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  );
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Private-Network", true);
  //  Firefox caps this at 24 hours (86400 seconds). Chromium (starting in v76) caps at 2 hours (7200 seconds). The default value is 5 seconds.
  res.setHeader("Access-Control-Max-Age", 7200);

  next();
});
// --- API Endpoints ---

/**
 * Endpoint for the frontend to call when a cart is detected.
 * It stores the cart and schedules the abandoned check.
 */
app.post('/api/track-cart', (req, res) => {
  const { cart } = req.body;

  if (!cart || !cart.token) {
    return res.status(400).send({ message: 'Cart data or token is missing.' });
  }

  const cartToken = cart.token;
  
  // If we are already tracking this cart, don't do anything.
  if (trackedCarts[cartToken]) {
    return res.status(200).send({ message: 'Cart already being tracked.' });
  }
  
  console.log(`🛍️ Tracking new cart: ${cartToken}`);
  
  // Store cart data
  trackedCarts[cartToken] = {
    cartData: cart,
    checkoutStarted: false,
    createdAt: Date.now(),
  };

  // Schedule the abandoned cart check (e.g., 1 hour)
  //const checkDelay = 60 * 60 * 1000; // 1 hour in milliseconds
  const checkDelay = 10 * 1000; // 1 hour in milliseconds
  // For testing, use 10 seconds: const checkDelay = 10000;

  setTimeout(() => {
    checkAndSendToZoho(cartToken);
  }, checkDelay);

  res.status(200).send({ message: 'Cart is now being tracked.' });
});

/**
 * Endpoint for the frontend to call when the user starts checkout.
 * This prevents the abandoned cart notification from being sent.
 */
app.post('/api/checkout-started', (req, res) => {
  const { cartToken } = req.body;

  if (!cartToken || !trackedCarts[cartToken]) {
    return res.status(404).send({ message: 'Cart not found.' });
  }

  console.log(`✅ Checkout started for cart: ${cartToken}. Marking as complete.`);
  trackedCarts[cartToken].checkoutStarted = true;
  
  // Optional: Clean up the cart from memory after some time
  setTimeout(() => {
    delete trackedCarts[cartToken];
    console.log(`🗑️ Cleaned up cart: ${cartToken}`);
  }, 5 * 60 * 1000); // Clean up after 5 minutes

  res.status(200).send({ message: 'Checkout status updated.' });
});


// --- Core Logic ---

/**
 * Checks if a cart was abandoned and sends it to Zoho if needed.
 */
async function checkAndSendToZoho(cartToken) {
  const cartState = trackedCarts[cartToken];

  // If the cart was removed from memory or checkout was started, do nothing.
  if (!cartState || cartState.checkoutStarted) {
    console.log(`✅ Cart ${cartToken} was checked out or is no longer tracked. Ignoring.`);
    return;
  }

  console.log(`🚨 Cart ${cartToken} appears to be abandoned! Sending to Zoho...`);
  try {
    await sendCartToZoho(cartState.cartData);
    console.log(`✅ Successfully sent abandoned cart ${cartToken} to Zoho.`);
  } catch (error) {
    console.error(`❌ Failed to send cart ${cartToken} to Zoho:`, error);
  } finally {
    // Clean up the cart from memory regardless of outcome
    delete trackedCarts[cartToken];
  }
}

/**
 * Refreshes the Zoho access token.
 */
async function refreshAccessToken() {
  try {
    const response = await fetch(ZOHO.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: ZOHO.refreshToken,
        client_id: ZOHO.clientId,
        client_secret: ZOHO.clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);
    const data = await response.json();
    ZOHO.accessToken = data.access_token;
    console.log("✅ Zoho access token refreshed.");
    return data.access_token;
  } catch (error) {
    console.error("❌ Failed to refresh Zoho access token:", error);
    throw error;
  }
}

/**
 * Sends the cart data to the Zoho CRM API.
 */
async function sendCartToZoho(cart) {
  const email = cart.email || "unknown@example.com";
  const items = cart.items.map(i => `${i.title} x${i.quantity}`).join(", ");
  const total = (cart.total_price / 100).toFixed(2);

  const lead = {
    data: [{
      Last_Name: "Shopify Customer",
      Email: email,
      Lead_Source: "Shopify Abandoned Cart",
      Description: `Abandoned cart total $${total} — Items: ${items}`,
    }],
  };

  try {
    const response = await makeZohoApiCall(lead);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Zoho API Error: ${response.status} - ${errText}`);
    }
  } catch (error) {
    console.error("❌ Error sending to Zoho:", error.message);
    throw error;
  }
}

/**
 * Makes an API call to Zoho, handling token refresh if needed.
 */
async function makeZohoApiCall(data) {
  let response = await fetch(ZOHO.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${ZOHO.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (response.status === 401) {
    console.log("🔄 Zoho token expired, refreshing...");
    await refreshAccessToken();
    // Retry with new token
    response = await fetch(ZOHO.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${ZOHO.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  }
  return response;
}


// --- Start the Server ---
app.listen(PORT, () => {
  console.log(`🚀 Abandoned cart server running on http://localhost:${PORT}`);
});