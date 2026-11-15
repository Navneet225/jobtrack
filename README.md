# JobTrack - Job Application Tracker (React + Node/Express + SQLite)

A full-stack app to track job applications through a pipeline (applied, interview, offer, rejected), with secure per-user accounts.

## Features
- Register / log in with JWT authentication; passwords hashed with bcrypt
- Create, update, delete applications; change status inline
- Server-side pagination, status filter, and company/role search
- Dashboard counts per status
- Every query is scoped to the logged-in user (users cannot read or modify each other's data)
- Input validation on all write endpoints (zod) with clear error messages

## Tech stack
- **Frontend:** React 18, Vite
- **Backend:** Node.js, Express, better-sqlite3 (SQLite), JWT, bcryptjs, zod
- **Tests:** Jest + Supertest (10 API tests)

## Project structure
```
server/   Express REST API (src/app.js, src/db.js, src/server.js) + tests/
client/   React app (Vite)
```

## Run locally
Requirements: Node.js 18+.

```bash
# 1) API (port 4000)
cd server
npm install
JWT_SECRET=change-me npm start        # Windows PowerShell: $env:JWT_SECRET="change-me"; npm start

# 2) Frontend (new terminal)
cd client
npm install
npm run dev                            # opens on http://localhost:5173, proxies /api to :4000
```

## Run the tests
```bash
cd server && npm test
```
The tests cover registration/login, duplicate emails, weak passwords, token checks, password hashing, CRUD with validation, partial updates (PATCH keeps unsent fields), pagination/filter/search, per-user data isolation, and stats.

## API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account, returns JWT |
| POST | `/api/auth/login` | Log in, returns JWT |
| GET | `/api/applications?page&limit&status&q` | List (paginated, filterable) |
| POST | `/api/applications` | Create |
| PATCH | `/api/applications/:id` | Update fields |
| DELETE | `/api/applications/:id` | Delete |
| GET | `/api/stats` | Counts by status |

All `/api/applications` and `/api/stats` routes need `Authorization: Bearer <token>`.

## Limitations
- SQLite, single-server setup (no horizontal scaling)
- No refresh tokens, password reset, or rate limiting
- The React UI is not covered by automated tests
- Not deployed yet

## Possible improvements
- Rate limiting on auth routes, refresh tokens
- Frontend tests (React Testing Library)
- Docker setup and deployment
- Reminders for follow-ups

## Author
Navneet Singh Yadav - [LinkedIn](https://www.linkedin.com/in/navneet-singh-yadav-439886281/)
