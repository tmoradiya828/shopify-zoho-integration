// Simple Shopify → Zoho Abandoned Cart Logic (Frontend Demo)
// Requires jQuery

(function ($) {

  // === Function to simulate cart creation ===
  function onCartCreated(cart) {
    console.log("Cart created:", cart);

    // Save timestamp (so we know when it was created)
    cart.createdAt = new Date();

    // Wait 1 hour (3,600,000 ms) — then check if not checked out
    setTimeout(function () {
      if (!cart.checkedOut) {
        console.log("Cart abandoned, sending to Zoho CRM...");
        sendCartToZoho(cart);
      }
    }, 10000); // 1 hour (use 10000 for testing: 10 seconds)
  }

  // === Function to send cart details to Zoho CRM ===
  function sendCartToZoho(cart) {
    const zohoAccessToken = "1000.3c31ff0c769356c3445395d0ca3f2006.5b9c1aa284f464234205f82b540863a2"; // Replace with your token

    const leadData = {
      data: [
        {
          Last_Name: cart.customer?.last_name || "Unknown",
          First_Name: cart.customer?.first_name || "",
          Email: cart.email || "",
          Lead_Source: "Shopify Abandoned Cart",
          Lead_Status: "Open",
          Description: `Abandoned cart: ${cart.items
            .map(i => `${i.title} x${i.quantity}`)
            .join(", ")}`
        }
      ]
    };

    $.ajax({
      url: "https://www.zohoapis.com/crm/v7/Leads",
      method: "POST",
      headers: {
        "Authorization": "Zoho-oauthtoken " + zohoAccessToken,
        "Content-Type": "application/json"
      },
      data: JSON.stringify(leadData),
      success: function (response) {
        console.log("Sent to Zoho CRM successfully:", response);
      },
      error: function (xhr) {
        console.error("Zoho API Error:", xhr.responseText || xhr.statusText);
      }
    });
  }

  // === Example trigger (simulate a cart) ===
  $(document).ready(function () {
    // Simulate Shopify cart object
    const sampleCart = {
      id: Date.now(),
      email: "customer@example.com",
      customer: { first_name: "John", last_name: "Doe" },
      items: [
        { title: "T-Shirt", quantity: 2 },
        { title: "Jeans", quantity: 1 }
      ],
      checkedOut: false
    };

    // Simulate "cart created" event
    onCartCreated(sampleCart);

    // Uncomment below to simulate customer checkout (prevents Zoho push)
    //setTimeout(() => { sampleCart.checkedOut = true; console.log("✅ Customer checked out."); }, 20000);
  });

})(jQuery);