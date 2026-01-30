# BookNest Backend

**BookNest Backend** is a MERN stack backend API server that powers the BookNest online book platform.  
It handles user management, book management, order processing, wishlist, reviews, and Stripe-based payments.

---

## Project Purpose

The backend is responsible for:

- Managing **users, librarians, and admins** with role-based access control
- CRUD operations for books and orders
- Managing **wishlists** and **book reviews**
- Processing **secure payments using Stripe**
- Providing **analytics data** for dashboards
- Authenticating users via **Firebase Admin SDK**

---

---

## Tech Stack

- **Node.js**
- **Express.js**
- **MongoDB** (via `mongodb` driver)
- **Firebase Admin SDK** (for authentication)
- **Stripe** (for payments)
- **CORS** and **dotenv**

---

## NPM Packages Used

- `express`
- `cors`
- `mongodb`
- `firebase-admin`
- `stripe`
- `dotenv`

---

## Authentication & Authorization

1. **Firebase Token Verification**

   - Users send `Authorization: Bearer <token>` header
   - Verified via Firebase Admin SDK
   - Stores decoded email in `req.decoded_email`

2. **Role-Based Middleware**
   - `verifyAdmin` → Only admin can access
   - `verifyLibrian` → Only librarian can access
   - Default role is `user` for regular users

---

## MongoDB Collections

1. **users** – Stores user data, roles, profile info
2. **books** – Stores book details, status, and reviews
3. **orders** – Stores user orders with status and payment info
4. **payments** – Stores Stripe payment records
5. **wishlists** – Stores user wishlist books

---

## API Endpoints

### Public Routes

- `GET /` → Hello message
- `GET /books` → Get all books (supports `search`, `status`, `sort` query params)
- `GET /books/latest` → Get latest published books
- `GET /book/:id` → Get particular book info

---

### User Routes

- `POST /users` → Register user
- `GET /users/:email/role` → Get user role
- `PATCH /users/profile/:email` → Update profile
- `POST /orders` → Place an order
- `GET /orders/:email` → Get user orders
- `PATCH /orders/cancel/:id` → Cancel an order
- `POST /wishlist` → Add book to wishlist
- `GET /wishlist/:userEmail` → Get wishlist
- `DELETE /wishlist/:userEmail/:bookId` → Remove book from wishlist
- `POST /books/:id/review` → Add a review (only if user ordered the book)

---

### Librarian Routes

- `POST /books` → Add a new book
- `GET /my-books/:email` → Get books added by librarian
- `PATCH /update-book/:id` → Update book details
- `PATCH /update-book-status/:id` → Update book status
- `GET /librarian/orders/:email` → Get librarian orders
- `PATCH /librian/update-status/:id` → Update order status

---

### Admin Routes

- `GET /users` → Get all users (supports search)
- `PATCH /users/:id/role` → Update user role
- `PATCH /admin/books/status/:id` → Update book status
- `DELETE /admin/books/:id` → Delete book (also deletes related orders)

---

### Payment Routes (Stripe)

- `POST /payment-checkout-session` → Create Stripe checkout session
- `PATCH /payment-success?session_id=<id>` → Handle Stripe payment success
- `GET /payments/:email` → Get user payments

---

### Analytics Routes

- `GET /books-stats` → Get book statistics (total/published/unpublished)
- `GET /order-status-stats` → Get order statistics (pending/shipped/delivered/cancelled)

---

## Environment Variables

### Server `.env`

```env
PORT=3000
DB_USER=your_db_user
DB_PASS=your_db_password
ACCESS_TOKEN_SECRET=your_jwt_secret
STRIPE_SECRET=your_stripe_secret_key
SITE_DOMAIN=https://your-frontend-domain.com
FB_SERVICE_KEY=<base64_encoded_firebase_service_account_json>
```
