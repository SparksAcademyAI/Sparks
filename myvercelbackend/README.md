# Vercel OpenAI Backend

A simple Express.js backend that uses the OpenAI API, ready to deploy on Vercel.

## Deployment Instructions

1. Push this code to a GitHub repository
2. Go to [Vercel](https://vercel.com) and create a new project
3. Import your GitHub repository
4. Add your environment variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
5. Deploy!

## API Endpoints

- `POST /api/gpt`: Send a message to OpenAI
  - Request body: `{ "userMessage": "Your message here" }`
  - Response: `{ "success": true, "aiResponse": "AI response text" }`

- `GET /`: Simple health check endpoint

