# Kuadrat - Minimalist Online Art Gallery

A complete, production-ready web application for selling art online. Built with Express.js, Next.js, Turso database, and fully containerized with Docker.

## Features

- **User Authentication**: Secure JWT-based authentication with Passport.js
- **Role-Based Access**: Separate functionalities for Buyers and Sellers
- **Art Gallery**: Browse and purchase unique artworks
- **Seller Portal**: Artists can list and manage their artworks
- **Order Management**: Complete order history and details
- **Email Notifications**: Purchase confirmations via Nodemailer
- **Real-time Ready**: Socket.IO integration for future auction functionality
- **Fully Tested**: Comprehensive test suite with Jest and Supertest

## Technology Stack

### Backend (API)
- **Framework**: Express.js
- **Database**: Turso (LibSQL)
- **Authentication**: Passport.js (Local & JWT strategies)
- **Email**: Nodemailer
- **Real-time**: Socket.IO
- **Testing**: Jest, Supertest

### Frontend (Client)
- **Framework**: Next.js 15 (App Router)
- **Language**: JavaScript
- **Styling**: Tailwind CSS
- **UI Components**: Headless UI, Heroicons
- **State Management**: React Hooks

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Database**: Turso (Remote SQLite)

## Project Structure

```
kuadrat/
├── api/                          # Express.js API
│   ├── config/
│   │   ├── database.js          # Turso database configuration
│   │   └── passport.js          # Passport.js strategies
│   ├── controllers/
│   │   ├── authController.js    # Authentication logic
│   │   ├── ordersController.js  # Order management
│   │   └── productsController.js # Product management
│   ├── middleware/
│   │   ├── authorization.js     # Role-based access control
│   │   └── errorHandler.js      # Centralized error handling
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── ordersRoutes.js
│   │   └── productsRoutes.js
│   ├── services/
│   │   └── emailService.js      # Email sending functionality
│   ├── tests/                   # API tests
│   ├── server.js                # Main server file
│   ├── package.json
│   ├── Dockerfile
│   └── .env
│
├── client/                       # Next.js Frontend
│   ├── app/
│   │   ├── gallery/             # Product gallery pages
│   │   ├── login/               # Login page
│   │   ├── register/            # Registration page
│   │   ├── orders/              # Order history pages
│   │   ├── seller/              # Seller-specific pages
│   │   ├── layout.js            # Root layout
│   │   ├── page.js              # Home page
│   │   └── globals.css          # Global styles
│   ├── components/
│   │   ├── Navbar.js            # Navigation component
│   │   └── Footer.js            # Footer component
│   ├── lib/
│   │   └── api.js               # API client utilities
│   ├── package.json
│   ├── Dockerfile
│   ├── next.config.js
│   └── tailwind.config.js
│
├── docker-compose.yml            # Docker Compose configuration
├── API_ENDPOINTS.md             # API documentation
├── DATABASE_SCHEMA.md           # Database schema
├── CLAUDE.md                    # Project specifications
└── README.md                    # This file
```

## Getting Started

### Prerequisites

- Docker (v28.5.0 or later)
- Docker Compose (v2.39.4 or later)
- Node.js 20+ (for local development without Docker)

### Installation

1. **Clone the repository**
   ```bash
   cd /home/axgalache/projects/kuadrat
   ```

2. **Configure environment variables**

   The API `.env` file is already configured with your Turso database credentials. Update the SMTP settings for email functionality:

   ```bash
   # Edit api/.env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_app_password
   EMAIL_FROM=noreply@kuadrat.com
   ```

3. **Install dependencies**

   ```bash
   # Install API dependencies
   cd api
   npm install

   # Install Client dependencies
   cd ../client
   npm install
   ```

### Running with Docker (Recommended)

```bash
# From the project root
docker-compose up --build
```

This will start:
- API server at http://localhost:3001
- Client application at http://localhost:3000

### Running Locally (Without Docker)

**Terminal 1 - API:**
```bash
cd api
npm run dev
```

**Terminal 2 - Client:**
```bash
cd client
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Products
- `GET /api/products` - Get all products (public)
- `GET /api/products/:id` - Get single product (public)
- `POST /api/products` - Create product (seller only)
- `DELETE /api/products/:id` - Delete product (seller only)
- `GET /api/products/seller/me` - Get seller's products (seller only)

### Orders
- `POST /api/orders` - Create order (authenticated)
- `GET /api/orders` - Get user's orders (authenticated)
- `GET /api/orders/:id` - Get order details (authenticated)

See [API_ENDPOINTS.md](./API_ENDPOINTS.md) for detailed API documentation.

## Database Schema

The application uses Turso (LibSQL) with the following tables:
- `users` - User accounts (buyers and sellers)
- `products` - Artwork listings
- `orders` - Purchase orders
- `order_items` - Order line items
- `auctions` - Auction events (for future use)
- `bids` - Auction bids (for future use)

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema details.

## Testing

Run the API test suite:

```bash
cd api
npm test
```

Run tests with coverage:

```bash
npm test -- --coverage
```

The test suite includes:
- Authentication tests
- Product CRUD tests
- Order management tests
- Authorization tests
- Placeholder tests for future auction functionality

## User Roles

### Buyer
- Browse art gallery
- Purchase artworks
- View order history
- View order details

### Seller
- All buyer capabilities
- Publish new artworks
- Manage own products
- Delete own products

## Future Features

The application is architected to support real-time auctions:
- Database schema includes `auctions` and `bids` tables
- Socket.IO is configured and ready
- Placeholder tests outline auction functionality
- Frontend can be extended to include auction pages

## Email Configuration

The application sends purchase confirmation emails. To enable this:

1. **Using Gmail:**
   - Enable 2-factor authentication
   - Generate an App Password
   - Use the App Password in `SMTP_PASS`

2. **Using other SMTP providers:**
   - Update `SMTP_HOST`, `SMTP_PORT`, and `SMTP_SECURE` accordingly

## Design Philosophy

Kuadrat follows an **extreme minimalist** design approach:
- Light theme only
- Single-column layouts
- Focus on artwork images
- Clean typography with Inter font
- No unnecessary UI elements

## Production Deployment

### Environment Variables

Before deploying, ensure you update:
- `JWT_SECRET` - Use a strong, random secret
- `SMTP_*` - Configure production email service
- `CLIENT_URL` - Set to production client URL

### Database Initialization

The database schema is automatically initialized when the API starts. The Turso database is already configured with your provided credentials.

## Troubleshooting

### Docker Issues

If containers fail to start:
```bash
docker-compose down
docker-compose up --build
```

### Database Connection Issues

Verify your Turso credentials in `api/.env` are correct.

### Port Conflicts

If ports 3000 or 3001 are already in use, update `docker-compose.yml` to use different ports.

## Contributing

This is a production application. Follow these guidelines:
1. Write tests for new features
2. Maintain the minimalist design philosophy
3. Update documentation
4. Follow existing code patterns

## License

All rights reserved © 2024 Kuadrat Gallery

## Support

For issues or questions, please contact the development team.

---

Built with ❤️ for art enthusiasts and artists
