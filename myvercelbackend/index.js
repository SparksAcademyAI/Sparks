require("dotenv").config()
const express = require("express")
const OpenAI = require("openai")

const app = express()
app.use(express.json())

// Example endpoint: POST /api/gpt
app.post("/api/gpt", async (req, res) => {
  try {
    const userMessage = req.body.userMessage || "Hello from user!"

    // Initialize OpenAI with API key from environment variable
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Example call to OpenAI using the latest API
    const completion = await openai.completions.create({
      model: "gpt-3.5-turbo-instruct", // Updated model (davinci-003 replacement)
      prompt: userMessage,
      max_tokens: 50,
    })

    // Send AI's text back
    const aiResponse = completion.choices[0].text
    return res.json({ success: true, aiResponse })
  } catch (err) {
    console.error("Server Error:", err)
    return res.status(500).json({ success: false, error: err.toString() })
  }
})

// Add a simple GET endpoint for testing
app.get("/", (req, res) => {
  res.json({ message: "API is running!" })
})

// For local testing only - starts the server on port 3000
if (require.main === module) {
  const PORT = process.env.PORT || 3000
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

module.exports = app

