# Forex Backtesting Platform

This project combines a Node.js backend and a React frontend for running forex trading backtests with AI assistance.

## Installation

1. Clone the repository
   ```bash
   git clone <repo_url>
   cd web-app-backtest
   ```
2. Install dependencies
   ```bash
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   ```

## Environment variables

An example configuration is provided in `env.txt`. Copy this file to `.env` and adjust the values as needed.

Important variables include:

- `PORT` – server port (default `5000`)
- `NODE_ENV` – runtime environment
- `API_KEY_GEMINI_PRO` and `API_KEY_GEMINI_FLASH` – API keys for Gemini services
- `JWT_SECRET` – JWT signing secret
- `DATABASE_URL` – connection string for an optional database

## Building

After the dependencies are installed, build both projects with:
```bash
npm run build
```
(or simply `npm install && npm run build` if nothing has been installed yet).

## Starting the app

To start the server in production mode run:
```bash
npm start
```
For development with live reload of both backend and frontend you can run:
```bash
npm run dev
```
