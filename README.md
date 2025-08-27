# LinkedIn Post Automation - Backend

This is the backend service for the LinkedIn Post Automation application. It provides authentication via LinkedIn OpenID Connect (OIDC) and manages posts that will be published to LinkedIn.

## Features

- LinkedIn OpenID Connect (OIDC) authentication
- JWT-based authentication
- Post management (create, read, update, delete)
- Scheduled posts
- Webhook integration with n8n for post publishing
- PostgreSQL database

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- LinkedIn Developer Account
- n8n instance (for post publishing)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on `.env.example` and fill in your configuration
4. Set up your LinkedIn application at [LinkedIn Developer Portal](https://www.linkedin.com/developers/)
   - Add `http://localhost:3000/api/auth/linkedin/callback` as an authorized redirect URL
   - Enable OpenID Connect and request scopes:
     - `openid`
     - `profile`, `email`
     - `w_member_social` (requires approval)
5. Set up your PostgreSQL database

## Database Setup

1. Create a new PostgreSQL database:
   ```sql
   CREATE DATABASE linkedin_automation;
   ```

2. The application will automatically create the necessary tables when it starts in development mode.

## Running the Application

### Development

```bash
npm run dev
```

The server will be available at `http://localhost:3000`

### Production

Use a process manager such as PM2, and ensure required environment variables are set. No build step is required.

```bash
npm install -g pm2
pm2 start src/server.js --name linkedin-backend
```

## API Documentation

### Authentication (OpenID Connect)

- `GET /api/auth/linkedin` - Initiate LinkedIn OIDC Authorization Code flow with PKCE
- `GET /api/auth/me` - Get current user (requires app JWT)
- `POST /api/auth/logout` - Logout (client-side token removal)

### Posts

- `GET /api/posts` - Get all posts for the authenticated user
- `GET /api/posts/:id` - Get a single post
- `POST /api/posts` - Create a new post
- `PUT /api/posts/:id` - Update a post
- `DELETE /api/posts/:id` - Delete a post
- `POST /api/posts/:id/publish` - Publish a post immediately

### Webhooks

- `POST /api/webhooks/n8n` - Webhook endpoint for n8n callbacks
- `GET /api/webhooks/health` - Health check endpoint

## Environment Variables

Required:
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_CALLBACK_URL` (e.g., `http://localhost:3000/api/auth/linkedin/callback`)
- `JWT_SECRET`
 - `OIDC_ISSUER` (e.g., your LinkedIn OIDC issuer)
 - `OIDC_AUTHORIZATION_ENDPOINT`
 - `OIDC_TOKEN_ENDPOINT`
 - `OIDC_JWKS_URI`

Recommended:
- `FRONTEND_URL` (e.g., `http://localhost:5173`)
- `LINKEDIN_SCOPES` (default: `openid profile email w_member_social`)
- `DB_SYNC=true` for dev

## Deployment

1. Set up a PostgreSQL database
2. Configure environment variables
3. Build and run the application
4. Set up a reverse proxy (Nginx, Apache, etc.)
5. Configure SSL/TLS

## License

ISC
