import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize OpenAI API
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
  };
}

// **Check Email Access (Google Sheet)**
app.post("/api/check-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Missing email" });
    }
    const url = process.env.GOOGLE_SHEET_SCRIPT_URL + "?email=" + encodeURIComponent(email);
    const response = await fetch(url);
    const data = await response.json();

    if (data && data.allowed) {
      res.json({ allowed: true });
    } else {
      res.json({ allowed: false });
    }
  } catch (error) {
    console.error("Error checking email in Google Sheet:", error);
    res.status(500).json({ error: "Error connecting to email list" });
  }
});

// Helper function for structured error responses
const handleError = (error, res, message = "Internal Server Error") => {
  console.error(`[ERROR] ${message}:`, error);
  res.status(500).json({ error: message, details: error.message });
};

// Create OpenAI thread
app.post('/api/create-thread', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ messages: [] }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    console.log("Thread created:", data);
    res.json({ threadId: data.id });
  } catch (error) {
    handleError(error, res, "Failed to create OpenAI thread");
  }
});

// Send message to thread
app.post('/api/send-message', async (req, res) => {
  try {
    console.log("send message called");
    const { threadId, userMessage } = req.body;
    if (!threadId || !userMessage) {
      return res.status(400).json({ error: "Missing threadId or userMessage" });
    }
    console.log("threadId",threadId);
    console.log("userMessage",userMessage);
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ role: 'user', content: userMessage }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    console.log("Message sent successfully:", data);
    res.json({ success: true });
  } catch (error) {
    handleError(error, res, "Failed to send message to OpenAI");
  }
});

// **Start Assistant Run**
app.post("/api/start-run", async (req, res) => {
  try {
    const { threadId } = req.body;
    if (!threadId) {
      return res.status(400).json({ error: "Missing threadId" });
    }

    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ assistant_id: process.env.ASSISTANT_ID }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    console.log("Run started successfully:", data);
    res.json({ runId: data.id });
  } catch (error) {
    console.error("Start Run Error:", error);
    res.status(500).json({ error: error.message || "Failed to start assistant run" });
  }
});

// **Check Run Status**
app.post("/api/check-run-status", async (req, res) => {
  try {
    const { threadId, runId } = req.body;
    if (!threadId || !runId) {
      return res.status(400).json({ error: "Missing threadId or runId" });
    }

    let runComplete = false;
    while (!runComplete) {
      await new Promise((resolve) => setTimeout(resolve, 50));

      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        method: "GET",
        headers: getHeaders(),
      });

      const statusData = await statusResponse.json();
      if (statusData.status === "completed") {
        runComplete = true;
        res.json({ status: "completed" });
        return;
      }
    }
  } catch (error) {
    console.error("Check Run Status Error:", error);
    res.status(500).json({ error: error.message || "Error checking assistant run status" });
  }
});

// **Fetch Assistant Response**
app.post("/api/fetch-response", async (req, res) => {
  try {
    const { threadId } = req.body;
    if (!threadId) {
      return res.status(400).json({ error: "Missing threadId" });
    }

    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: "GET",
      headers: getHeaders(),
    });

    const data = await response.json();
    console.log("Fetch Response:", data);

    const assistantMsg = data.data.find((msg) => msg.role === "assistant");
    if (assistantMsg && assistantMsg.content?.length > 0) {
      res.json({ response: assistantMsg.content[0].text.value });
    } else {
      res.status(404).json({ error: "No assistant response received" });
    }
  } catch (error) {
    console.error("Fetch Response Error:", error);
    res.status(500).json({ error: error.message || "Error fetching assistant response" });
  }
});


// Google Apps Script URL (store in .env)
const QNA_LOG_URL = process.env.QNA_LOG_URL;

// API route to log Q&A
app.post("/api/log-qna", async (req, res) => {
  try {
    const { email, question, response } = req.body;
    if (!email || !question || !response) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const timestamp = new Date().toISOString();
    const payload = { timestamp, email, question, response };
    console.log(payload);
    const googleRes = await fetch(QNA_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log("googleRes",googleRes);
    // **Check Content Type Before Parsing**
    const contentType = googleRes.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const textResponse = await googleRes.text(); // Get text response for debugging
      console.error("Google Apps Script Error:", textResponse);
      return res.status(500).json({ error: "Invalid response from Google Apps Script", details: textResponse });
    }

    const result = await googleRes.json();
    console.log("QnA Log Response:", result);
    res.json({ success: true, googleResponse: result });

  } catch (error) {
    console.error("Error logging QnA:", error);
    res.status(500).json({ error: "Failed to log QnA" });
  }
});



// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
