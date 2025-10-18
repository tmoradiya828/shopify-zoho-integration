// server.js

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- Configuration ---
const ZOHO = {
  apiUrl: "https://www.zohoapis.in/crm/v7/Leads", // using .in for India accounts
  accessToken: "1000.ec906c6c9465e479fd2b13d785c02c3c.9f0c2a0fcf142f70be64ce07ccee1ca7",
  refreshToken: "1000.a1829b2bb5d535c23e86e6d3dbd26751.c6bda94166b609c8b00542fc7f0ff8a0",
  clientId: "1000.PNRE5G8CDI88P8IVZD7RINQFAURL0C",
  clientSecret: "d2fa028fc8b3415b10928833fb231b824a0f5f628b",
  tokenUrl: "https://accounts.zoho.in/oauth/v2/token",
};

// --- In-Memory Store ---
const trackedCarts = {};

// --- CORS Headers ---
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://fitmantra.co.in");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", true);
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

  // Check after 10 seconds (for demo)
  setTimeout(() => checkAndSendToZoho(cartToken), 10 * 1000);

  res.status(200).send({ message: "Cart tracking started." });
});

app.post("/api/checkout-started", (req, res) => {
  const { cartToken } = req.body;
  if (!cartToken || !trackedCarts[cartToken]) {
    return res.status(404).send({ message: "Cart not found." });
  }

  trackedCarts[cartToken].checkoutStarted = true;
  console.log(`✅ Checkout started for cart: ${cartToken}`);

  // Remove after 5 minutes
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
    console.log(`✅ Cart ${cartToken} checked out or cleared.`);
    return;
  }

  console.log(`🚨 Abandoned cart detected: ${cartToken}`);
  try {
    await sendCartToZoho(cartState.cartData);
    console.log(`✅ Sent abandoned cart ${cartToken} to Zoho.`);
  } catch (err) {
    console.error(`❌ Failed to send cart ${cartToken} to Zoho:`, err.message);
  } finally {
    delete trackedCarts[cartToken];
  }
}

// --- Refresh Zoho Token ---

async function refreshAccessToken() {
  console.log("🔄 Refreshing Zoho access token...");

  const params = new URLSearchParams({
    refresh_token: ZOHO.refreshToken,
    client_id: ZOHO.clientId,
    client_secret: ZOHO.clientSecret,
    grant_type: "refresh_token",
  });

  try {
    const res = await axios.post(ZOHO.tokenUrl, params);
    console.log("📩 Zoho token response:", res.data);

    if (!res.data.access_token) {
      throw new Error("Zoho response missing access_token");
    }

    ZOHO.accessToken = res.data.access_token;
    console.log("✅ Token refreshed successfully:", ZOHO.accessToken.substring(0, 20) + "...");
    return ZOHO.accessToken;
  } catch (err) {
    console.error("❌ Token refresh failed:", err.response?.data || err.message);
    throw err;
  }
}

// --- Send Lead to Zoho ---

async function sendCartToZoho(cart) {
  const email = cart.customer.email || "dummyoctfis.d@octfis.com";
  const first_name = cart.customer.first_name || "Shopify";
  const last_name = cart.customer.last_name || "Customer";
  const phone = cart.customer.phone || "+919546823758";
  const items = cart.items.map(i => `${i.title} x${i.quantity}`).join(", ");
  const total = (cart.total_price / 100).toFixed(2);

  let data = JSON.stringify({
    "data": [
      {
        "First_Name": first_name,
      "Last_Name": last_name,
      "Email": email,
      "Mobile": phone,
      "Note_Your_Concern": "Abandoned cart total $${total} — Items: ${items}",
      "Lead_Source": "Shopify",
      "Lead_Status": "New Lead",
      "Layout": "910013000001551368"
      },
    ],
  });

  let config = {
  method: 'post',
  maxBodyLength: Infinity,
  url: 'https://www.zohoapis.in/crm/v7/Leads',
  headers: { 
    Authorization: `Zoho-oauthtoken ${ZOHO.accessToken}`,
    'Content-Type': 'application/json',
    Cookie:
        "_zcsr_tmp=0a8c1750-e975-47fc-9c0e-ea627e628c3a; crmcsr=0a8c1750-e975-47fc-9c0e-ea627e628c3a"
  },
  data : data
};

  try {
    console.log("📡 Sending lead to Zoho...");
    const response = await axios.request(config);
    console.log("✅ Zoho Response:", response.data);
     console.log("✅ Lead successfully sent to Zoho CRM.");
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.warn("⚠️ Access token expired. Refreshing...");
      await refreshAccessToken();

      // Retry once
      config.headers.Authorization = `Zoho-oauthtoken ${ZOHO.accessToken}`;
      const retry = await axios.request(config);
      console.log("✅ Retried Zoho API successfully:", retry.data);
    } else {
      console.error("❌ Error sending to Zoho:", error.response?.data || error.message);
      throw error;
    }
  }
}

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
