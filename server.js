// server.js
const express = require("express");
const axios = require("axios");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const carts = []; // replace with DB (e.g., MongoDB)
let ZOHO_ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN;

// === Shopify Webhook: Cart Created ===
app.post("/api/shopify/cart-created", (req, res) => {
  const cart = req.body;
  carts.push({
    id: cart.id,
    email: cart.email,
    items: cart.line_items,
    createdAt: new Date(cart.created_at),
    customer: cart.customer,
    status: "pending",
  });
  console.log("Cart saved:", cart.id);
  res.status(200).send("ok");
});

// === Cron Job: Check abandoned carts ===
cron.schedule("*/5 * * * *", async () => {
  const now = new Date();
  for (const cart of carts) {
    const diffMinutes = (now - new Date(cart.createdAt)) / 60000;
    if (diffMinutes >= 60 && cart.status === "pending") {
      console.log(`Sending cart ${cart.id} to Zoho...`);
      await sendCartToZoho(cart);
      cart.status = "sent";
    }
  }
});

async function sendCartToZoho(cart) {
  const lead = {
    data: [
      {
        Last_Name: cart.customer?.last_name || "Unknown",
        First_Name: cart.customer?.first_name,
        Email: cart.email,
        Lead_Source: "Shopify Abandoned Cart",
        Lead_Status: "Open",
        Description: `Abandoned cart with ${cart.items
          .map((i) => `${i.title} x${i.quantity}`)
          .join(", ")}`,
      },
    ],
  };

  try {
    await axios.post("https://www.zohoapis.com/crm/v7/Leads", lead, {
      headers: {
        Authorization: `Zoho-oauthtoken ${ZOHO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    console.log("Cart sent to Zoho CRM");
  } catch (error) {
    console.error("Zoho API Error:", error.response?.data || error.message);
  }
}

app.listen(3000, () => console.log("Server running on port 3000"));
