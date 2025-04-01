const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const serverless = require("serverless-http");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2",
  };
}

app.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });

    const url = `${process.env.GOOGLE_SHEET_SCRIPT_URL}?email=${encodeURIComponent(email)}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json({ allowed: data?.allowed || false });
  } catch (error) {
    res.status(500).json({ error: "Error connecting to email list" });
  }
});

app.post("/create-thread", async (req, res) => {
  try {
    const response = await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ messages: [] }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    res.json({ threadId: data.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create OpenAI thread" });
  }
});

app.post("/send-message", async (req, res) => {
  try {
    const { threadId, userMessage } = req.body;
    if (!threadId || !userMessage) {
      return res.status(400).json({ error: "Missing threadId or userMessage" });
    }
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ role: "user", content: userMessage }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to send message to OpenAI" });
  }
});

app.post("/start-run", async (req, res) => {
  try {
    const { threadId } = req.body;
    if (!threadId) return res.status(400).json({ error: "Missing threadId" });

    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ assistant_id: process.env.ASSISTANT_ID }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    res.json({ runId: data.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to start assistant run" });
  }
});

app.post("/check-run-status", async (req, res) => {
  try {
    const { threadId, runId } = req.body;
    if (!threadId || !runId) return res.status(400).json({ error: "Missing threadId or runId" });

    let runComplete = false;
    while (!runComplete) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
        headers: getHeaders(),
      });

      const data = await response.json();
      if (data.status === "completed") {
        runComplete = true;
        res.json({ status: "completed" });
        return;
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message || "Error checking assistant run status" });
  }
});

app.post("/fetch-response", async (req, res) => {
  try {
    const { threadId } = req.body;
    if (!threadId) return res.status(400).json({ error: "Missing threadId" });

    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: getHeaders(),
    });
    const data = await response.json();
    const assistantMsg = data.data.find((msg) => msg.role === "assistant");
    res.json({ response: assistantMsg?.content?.[0]?.text?.value || "No response received" });
  } catch (error) {
    res.status(500).json({ error: "Error fetching assistant response" });
  }
});

const QNA_LOG_URL = process.env.QNA_LOG_URL;
if (!QNA_LOG_URL) throw new Error("QNA_LOG_URL is not defined in the environment variables.");

app.post("/log-qna", async (req, res) => {
  try {
    const { email, question, response } = req.body;
    if (!email || !question || !response) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const payload = {
      timestamp: new Date().toISOString(),
      email,
      question,
      response,
    };

    const googleRes = await fetch(QNA_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const contentType = googleRes.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      const text = await googleRes.text();
      return res.status(500).json({ error: "Invalid response from Google Script", details: text });
    }

    const result = await googleRes.json();
    res.json({ success: true, googleResponse: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to log QnA" });
  }
});

// Export the handler for Vercel
module.exports = app;
module.exports.handler = serverless(app);
