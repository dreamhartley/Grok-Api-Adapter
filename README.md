# Grok API Adapter
The Grok API Adapter is a powerful tool that transforms the Grok.com API into a standard OpenAI API interface. This adapter supports various Grok models and provides seamless integration for developers who are familiar with the OpenAI API structure.
## Features
- **Model Support**:
  - Base Model: `grok-3`
  - Web Search Model: `grok-3-search`
  - Reasoning Model: `grok-3-think` (with independent quota from the base model)
  
- **Image Generation**:
  - Supports text-to-image requests via the `/v1/images/generations` endpoint.
  - Request and response formats are identical to OpenAI's DALL·E 3.
  - Model Name: `grok-3`
  
- **Authentication**:
  - Uses SSO cookies from Grok.com for authentication.
  - Supports multiple cookies for load balancing (separated by `;`).
  - API key support for enhanced security.
  
- **Additional Features**:
  - Balance inquiry.
  - Image upload support.
  - Reverse proxy configuration (via `REVERSE_PROXY` in `.env`).
## Getting Started
### Prerequisites
- Node.js (v18 or higher)
- Docker (optional)
- Docker Compose (optional)
### Installation
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/dreamhartley/Grok-Api-Adapter.git
   cd Grok-Api-Adapter
   ```
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   - Copy `.env.example` to `.env`.
   - Update the `.env` file with your SSO cookies and API keys.
### Running the Application
#### Using Node.js
```bash
npm start
```
#### Using Docker
```bash
docker-compose up --build
```
#### Using Scripts
- **Windows**: Run `start.bat`.
- **Linux/Mac**: Run `start.sh`.
### Usage
1. **Authenticate**:
   - Log in to Grok.com and retrieve your SSO cookie.
   - Add the cookie to the `.env` file under `COOKIES`.
2. **Make API Requests**:
   - Use the standard OpenAI API format to interact with the Grok models.
   - For image generation, send requests to `/v1/images/generations`.