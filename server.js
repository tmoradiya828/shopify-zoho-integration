// server.js

const express = require("express");
const axios = require("axios"); // <-- Use axios instead of node-fetch
var cors = require("cors");

const app = express();
app.use(express.json()); // Parse JSON bodies

const PORT = process.env.PORT || 3000;

// --- Configuration ---
const ZOHO = {
  apiUrl: "https://www.zohoapis.com/crm/v7/Leads",
  accessToken: "1000.1143f37c0d93015e74c40bce03dd924b.3955bb117df105f72edd740103771979",
  refreshToken: "1000.a1829b2bb5d535c23e86e6d3dbd26751.c6bda94166b609c8b00542fc7f0ff8a0",
  clientId: "1000.PNRE5G8CDI88P8IVZD7RINQFAURL0C",
  clientSecret: "d2fa028fc8b3415b10928833fb231b824a0f5f628b",
  tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
};

// --- In-Memory Store ---
const trackedCarts = {};

// --- CORS Middleware ---
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://fitmantra.co.in");
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
  res.setHeader("Access-Control-Max-Age", 7200);
  next();
});

// --- API Endpoints ---

app.post("/api/track-cart", (req, res) => {
  const { cart } = req.body;

  if (!cart || !cart.token) {
    return res.status(400).send({ message: "Cart data or token is missing." });
  }

  const cartToken = cart.token;

  if (trackedCarts[cartToken]) {
    return res.status(200).send({ message: "Cart already being tracked." });
  }

  console.log(`🛍️ Tracking new cart: ${cartToken}`);
  trackedCarts[cartToken] = {
    cartData: cart,
    checkoutStarted: false,
    createdAt: Date.now(),
  };

  // Schedule abandoned cart check (10 seconds for testing)
  const checkDelay = 10 * 1000;
  setTimeout(() => {
    checkAndSendToZoho(cartToken);
  }, checkDelay);

  res.status(200).send({ message: "Cart is now being tracked." });
});

app.post("/api/checkout-started", (req, res) => {
  const { cartToken } = req.body;

  if (!cartToken || !trackedCarts[cartToken]) {
    return res.status(404).send({ message: "Cart not found." });
  }

  console.log(`✅ Checkout started for cart: ${cartToken}`);
  trackedCarts[cartToken].checkoutStarted = true;

  // Cleanup after 5 minutes
  setTimeout(() => {
    delete trackedCarts[cartToken];
    console.log(`🗑️ Cleaned up cart: ${cartToken}`);
  }, 5 * 60 * 1000);

  res.status(200).send({ message: "Checkout status updated." });
});

// --- Core Logic ---

async function checkAndSendToZoho(cartToken) {
  const cartState = trackedCarts[cartToken];
  if (!cartState || cartState.checkoutStarted) {
    console.log(`✅ Cart ${cartToken} checked out or no longer tracked.`);
    return;
  }

  console.log(`🚨 Cart ${cartToken} abandoned! Sending to Zoho...`);
  try {
    await sendCartToZoho(cartState.cartData);
    console.log(`✅ Sent abandoned cart ${cartToken} to Zoho.`);
  } catch (error) {
    console.error(`❌ Failed to send cart ${cartToken} to Zoho:`, error.message);
  } finally {
    delete trackedCarts[cartToken];
  }
}

async function refreshAccessToken() {
  console.log("🔄 Refreshing Zoho access token...");
  try {
    const params = new URLSearchParams({
      refresh_token: ZOHO.refreshToken,
      client_id: ZOHO.clientId,
      client_secret: ZOHO.clientSecret,
      grant_type: "refresh_token",
    });

    const response = await axios.post(ZOHO.tokenUrl, params);

    if (!response.data.access_token) {
      throw new Error("Zoho response missing access_token");
    }

    ZOHO.accessToken = response.data.access_token;
    console.log("✅ Token refreshed successfully:", ZOHO.accessToken.substring(0, 20) + "...");
    return ZOHO.accessToken;
  } catch (error) {
    console.error("❌ Token refresh failed:", error.response?.data || error.message);
    throw error;
  }
}

async function sendCartToZoho(cart) {
  const email = cart.email || "unknown@example.com";
  const items = cart.items.map(i => `${i.title} x${i.quantity}`).join(", ");
  const total = (cart.total_price / 100).toFixed(2);

  const lead = {
    data: [
      {
        Last_Name: "Shopify Customer",
        Email: email,
        Lead_Source: "Shopify",
        Layout: "910013000001551368",
        Note_Your_Concern: `Abandoned cart total $${total} — Items: ${items}`,
      },
    ],
  };

  try {
    const response = await makeZohoApiCall(lead);
    console.log("✅ Zoho API Response:", response.data);
  } catch (error) {
    console.error("❌ Error sending to Zoho:", error.response?.data || error.message);
    throw error;
  }
}

async function makeZohoApiCall(data) {
  console.log("📡 Sending API request with token:", ZOHO.accessToken.substring(0, 20) + "...");

  try {
    const response = await axios.post(ZOHO.apiUrl, data, {
      headers: {
        Authorization: `Zoho-oauthtoken ${ZOHO.accessToken}`,
        "Content-Type": "application/json",
      },
    });
    return response;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.warn("⚠️ Token expired. Refreshing...");
      await refreshAccessToken();
      // Retry once
      const retryResponse = await axios.post(ZOHO.apiUrl, data, {
        headers: {
          Authorization: `Zoho-oauthtoken ${ZOHO.accessToken}`,
          "Content-Type": "application/json",
        },
      });
      return retryResponse;
    } else {
      throw error;
    }
  }
}

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Abandoned cart server running on http://localhost:${PORT}`);
});
