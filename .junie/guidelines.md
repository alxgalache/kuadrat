# Project Guidelines

# Monorepo Project: "Kuadrat" - A Minimalist Online Art Gallery

## Project Overview

You are an expert full-stack developer tasked with building a complete web application from scratch. The application, "Kuadrat," is a minimalist online marketplace for art, functioning as a virtual art gallery. It will allow artists (Sellers) to list their work and art enthusiasts (Buyers) to purchase it. I will act as the dealer, taking a commission on each sale. The project includes a RESTful API backend and NextJS frontend, all managed within a dockerized monorepo.

A critical future feature is real-time auctions. While the full real-time logic isn't required in this initial build, the database and API structure must be designed to fully support it later.

## Core Principles & Constraints

1.  **Technology Stack:**
    * **Backend:** Express.js running on Node.js.
    * **Database:** Turso
    * **Frontend:** NextJS project using Javascript (no Typescript), TailwindCSS and App Router.
    * **Styling:** Tailwind CSS. TailwindCSS will be installed and configured in the NextJS frontend project. It must be installed in the project using "npm install tailwindcss@latest", and Inter font family must be installed (following the official documentation of tailwindcss). You must also install headlessui and heoricons via "npm install @headlessui/react @heroicons/react". The project will include pre-written HTML snippets with Tailwind classes. You must use these.
    * **Containerization:** Docker and Docker Compose. Docker version 28.5.0 and docker compose version 2.39.4
    * **Real-time (for future auctions):** The API must include Socket.IO, configured and ready for the auction implementation.

2.  **Design Philosophy:**
    * **Extreme Minimalism:** The design is based on TailwindCSS components and UI Blocks. Please use these designs, without modifications
    * **Focus on Art:** The only images on the site are the artworks themselves.
    * **Layout:** A single-column, clean layout. On a product page, the single product image will occupy 50% of the viewport width on horizontal screens.
    * **Light Theme Only:** No dark mode.

3.  **User Roles:**
    * **Buyer:** Can browse and buy art, view their order history.
    * **Seller:** Can publish and manage their own art listings. They can also be buyers.

## Development Plan (Step-by-Step)

Please follow these steps in order. Think step-by-step before writing code for each part.

1.  **Project Scaffolding:** Create the complete monorepo directory structure in the way you see fit.
2.  **Docker Setup:** Create the `docker-compose.yml` file and the individual `Dockerfile` for both the `api` and `client` services as specified.
3.  **API Development (Express.js):**
    * Initialize the Node.js project in the `/api` directory.
    * Set up the Express server. Implement middleware for CORS, body-parsing, and logging.
    * **Database Integration:** Integrate Turso using the library you consider best for this use case. Create a database initialization script that sets up the tables as defined in `DATABASE_SCHEMA.md`.
    * **Authentication:** Implement a robust authentication system using **Passport.js**.
        * Use the `passport-local` strategy for email/password login (`/api/auth/register`, `/api/auth/login`).
        * Use the `passport-jwt` strategy to protect authenticated routes. The login route should return a JWT.
        * Other login options like SSO or sign in with Google or Apple will not be implemented. Please do not use any 3rd-party authentication libraries.
    * **Authorization:** Implement role-based authorization.
        * Sellers can create, read, update, and delete their own products.
        * Buyers can read all products.
        * Buyers can place bids on products.
        * Buyers can view their order history.
        * Sellers can view their order history.
    * **API Endpoints:** Implement all the API endpoints defined in `API_ENDPOINTS.md`. Ensure role-based authorization is correctly applied (e.g., only sellers can post products).
    * **Email Service:** Integrate **Nodemailer**. Create a generic email service that can be configured with SMTP credentials (from environment variables). Create a function to send a "Purchase Confirmation" email.
    * **WebSocket Setup:** Integrate **Socket.IO** into the Express server. For now, just set it up. No auction logic is needed yet.
4.  **Frontend Development (Vanilla JS):**
    * Create the HTML files for each page in the `/client` directory.
    * The `navbar` and `footer` will be consistent. You will use the HTML snippets from the `/client/components/` directory.
    * Write modular, clean Vanilla JavaScript in the `/client/js/` directory.
        * `auth.js`: Handles login, registration, storing JWT in localStorage, and logout.
        * `api.js`: A module to handle all fetch requests to the backend API. It should automatically attach the JWT from localStorage to the `Authorization` header.
        * `ui.js`: Functions to manipulate the DOM, render product lists, show/hide elements based on login status and user role.
        * Create separate JS files for each page's specific logic (e.g., `productList.js`, `productDetail.js`).
    * Use Tailwind CSS for all styling. A build step will be configured in the client Dockerfile to process the CSS.

5.  **Testing:**
    * For the API, set up a testing environment with **Jest** and **Supertest**.
    * Write unit/integration tests for all API endpoints, especially focusing on the authentication and authorization logic.
    * Write placeholder test files for the future auction WebSocket logic, outlining the tests that will be needed (e.g., "should allow a user to place a bid," "should broadcast new highest bid to all clients").

## Final Instructions

* Generate all file contents based on the provided specifications.
* Ensure all code is clean, well-commented, and follows best practices.
* Use environment variables for all sensitive information (database URLs, JWT secret, email credentials). Create a `.env.example` file in the `/api` directory.
