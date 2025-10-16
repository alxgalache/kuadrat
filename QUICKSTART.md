# Kuadrat - Quick Start Guide

Get Kuadrat up and running in 5 minutes!

## Prerequisites

- Docker and Docker Compose installed
- (Optional) SMTP credentials for email functionality

## Step 1: Configure Email (Optional but Recommended)

Edit `api/.env` and update the SMTP settings:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=noreply@kuadrat.com
```

**Note:** If you don't configure email, the application will work but won't send purchase confirmation emails.

## Step 2: Start the Application

```bash
docker-compose up --build
```

Wait for both services to start. You'll see:
```
kuadrat-api    | Server is running on port 3001
kuadrat-client | ▲ Next.js 15.1.4
kuadrat-client | - Local: http://localhost:3000
```

## Step 3: Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Step 4: Create Your First Account

1. Click "Create an account"
2. Enter your email and password
3. Choose "Sell my art" if you want to be a seller, or "Buy art" to be a buyer
4. Click "Create account"

You'll be automatically logged in and redirected to the gallery!

## Step 5: Test the Application

### As a Seller:
1. After registration, go to "Publish Art" in the navigation
2. Fill in the artwork details:
   - Name: "Sunset over Mountains"
   - Description: "A beautiful landscape painting"
   - Price: 299.99
   - Type: Physical
   - Image URL: https://picsum.photos/800/800
3. Click "Publish Artwork"
4. View your artwork in "My Products"

### As a Buyer:
1. Go to "Gallery"
2. Click on any artwork
3. Click "Purchase"
4. View your order in "My Orders"

## API Testing

The API is available at `http://localhost:3001/api`

Test the health check:
```bash
curl http://localhost:3001/health
```

Run the test suite:
```bash
cd api
npm test
```

## Common Issues

### Port Already in Use
If port 3000 or 3001 is already taken, edit `docker-compose.yml` and change the ports:
```yaml
ports:
  - "3002:3000"  # Change 3002 to any available port
```

### Email Not Working
- Verify SMTP credentials in `api/.env`
- For Gmail, use an App Password (not your regular password)
- Check the API logs: `docker logs kuadrat-api`

### Database Issues
The Turso database is already configured and ready to use. If you see connection errors, verify the credentials in `api/.env`.

## Next Steps

- Read the full [README.md](./README.md)
- Check [API_ENDPOINTS.md](./API_ENDPOINTS.md) for API documentation
- Review [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for database structure
- Customize the design in the Next.js components
- Add more artworks and test the complete flow

## Stopping the Application

```bash
# Stop containers
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Development Mode (Without Docker)

**Terminal 1 - API:**
```bash
cd api
npm install
npm run dev
```

**Terminal 2 - Client:**
```bash
cd client
npm install
npm run dev
```

---

Happy selling! 🎨
