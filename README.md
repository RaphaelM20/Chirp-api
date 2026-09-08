# Chirp API

REST API for [Chirp](https://github.com/RaphaelM20/Chirp-api), a full-stack Twitter/X clone. [Live Demo](https://chirp-chirp.netlify.app/login)

## Tech Stack

- Node.js, Express
- PostgreSQL, Prisma ORM
- Passport.js (Local + JWT)
- bcryptjs

## Running Locally

```bash
git clone https://github.com/RaphaelM20/Chirp-api
cd Chirp-api
npm install
```

Create `.env`:

```
DATABASE_URL="your-postgresql-connection-string"
JWT_SECRET="any-random-string"
```

```bash
npx prisma migrate dev
npx prisma generate
npm run dev
```

API runs on `http://localhost:3000`.

## API Endpoints

| Method | Endpoint           | Description    |
| ------ | ------------------ | -------------- |
| POST   | /signup            | Register       |
| POST   | /login             | Log in         |
| GET    | /posts             | Get feed       |
| POST   | /posts             | Create post    |
| DELETE | /posts/:id         | Delete post    |
| POST   | /posts/:id/likes   | Like post      |
| DELETE | /posts/:id/likes   | Unlike post    |
| POST   | /posts/:id/comment | Comment        |
| POST   | /follow            | Follow user    |
| DELETE | /follow            | Unfollow user  |
| GET    | /:username         | Get profile    |
| PUT    | /user/me           | Update profile |
