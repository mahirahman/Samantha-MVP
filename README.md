# Care GP MVP

A small TypeScript monorepo with independently deployable frontend and backend applications.

## Layout

- `frontend/`: Next.js App Router application, deployed to Vercel.
- `backend/`: NestJS API, packaged as a Docker image for AWS ECS Fargate.
- `infrastructure/aws/`: AWS CDK application for the Fargate service and public Application Load Balancer.

## Unit tests

Run the suites from the repository root (install dependencies in each application first):

```powershell
npm --prefix backend test
npm --prefix frontend test
```

Use `npm --prefix frontend run test:watch` or `npm --prefix backend run test:watch` while editing. Both applications also provide `test:cov` for coverage reports.

The lightweight tests cover backend health, authentication, upload validation, OCR/Gemini processing and errors; frontend login/signup and routing, patient/doctor matching, document persistence, duplicate uploads, bulk import, filing, recycle/restore, folder preferences, PDF split/merge and previews. Cloud SDKs, database requests and HTTP calls are mocked. PDF split/merge tests use real in-memory PDFs, and folder preference tests use an in-memory IndexedDB. No real patient data, credentials or paid services are needed. These are unit/component tests; they do not exercise live Supabase policies, external OCR accuracy or browser canvas rendering.

## Local development

Install dependencies in each application directory, then run its development server:

```powershell
cd frontend
npm install
npm run dev
```

In another terminal:

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run start:dev
```

The frontend is available at `http://localhost:3000`; the API health endpoint is `http://localhost:3001/api/health`.

## AI document processing

Auto Bulk Import sends each pending file to the authenticated `POST /api/documents/process` endpoint as multipart form data. The backend verifies the Supabase bearer token, runs Azure Document Intelligence `prebuilt-read`, then sends the OCR text to Gemini for structured filing metadata. OCR text and API credentials are not logged. The endpoint currently returns extraction results to the frontend; it does not yet upload the file or save extraction rows to Supabase Storage/database.

Copy `backend/.env.example` to `backend/.env` and set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`, and `GOOGLE_API_KEY`; `GOOGLE_GENAI_MODEL` defaults to `gemini-3.5-flash-lite`. Keep these keys out of source control; configure them as ECS Secrets Manager/Parameter Store values for deployment. The published Azure JavaScript SDK is `@azure/ai-form-recognizer` (the requested `@azure/ai-document-intelligence` package is not available in the configured npm registry); it is the official SDK for Azure Document Intelligence. The supplied Google API key uses the Gemini Developer API. To use Vertex AI instead, set `GOOGLE_GENAI_USE_VERTEXAI=true` and configure Google Cloud project/location plus Application Default Credentials; an API key alone does not authenticate Vertex AI.

## Supabase authentication

In Supabase, open **Authentication → URL Configuration** and set the Site URL to `http://localhost:3000`. Add `http://localhost:3000/**` to the Redirect URLs list. For deployment, add `https://YOUR_ACTUAL_VERCEL_DOMAIN/**` and use the exact Vercel domain; these allowlisted URLs are needed for email confirmation and password recovery redirects.

The repository includes a blank `frontend/.env.local`; fill in the Project URL and publishable key from **Project Settings → API**. To recreate it from the template, run:

```powershell
Copy-Item frontend/.env.example frontend/.env.local -Force
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local`. Never use the Supabase service-role key in a `NEXT_PUBLIC_` variable. The signup and login screens are available at `/signup` and `/login`; successful sign-in opens `/dashboard`.

The import folder preference is stored per user in `public.import_preferences`. Apply `supabase/migrations/20261104000000_create_import_preferences.sql` in the Supabase SQL Editor before using folder settings. Row-level security restricts the preference row to its owner. Browsers do not expose a local folder's absolute path or allow its file-system handle to be stored in Postgres, so the database stores the folder name while the browser keeps the user-scoped access handle locally; on another device the folder must be selected again.

## Frontend deployment (Vercel)

Create a Vercel project with the repository root directory set to `frontend`. Vercel detects Next.js and configures the build automatically. Add `NEXT_PUBLIC_API_URL` as a project environment variable with the deployed API base URL (for example, `https://api.example.com`), plus `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Set them separately for Preview and Production environments, and add your actual deployed URL to Supabase's Redirect URLs.

## Backend deployment (AWS)

The CDK stack builds the backend Docker image and creates an ECS Fargate service in private subnets, an internet-facing Application Load Balancer, CloudWatch logs, health checks, and CPU-based task scaling. The VPC includes one NAT gateway by default; review its cost and availability trade-offs before production deployment.

Prerequisites: AWS CLI credentials for the target account/region, Node.js 22+, and the AWS CDK CLI (`npm install --global aws-cdk`).

```powershell
cd backend
npm install
npm run build
cd ..\infrastructure\aws
npm install
npx cdk bootstrap aws://ACCOUNT_ID/REGION
npx cdk deploy -c frontendOrigin=https://YOUR_VERCEL_DOMAIN
```

Set `CORS_ORIGIN` to the exact Vercel origin. For production, use a stable custom domain, store secrets in AWS Secrets Manager or Parameter Store, and configure alarms, budgets, and an ACM certificate/custom domain for the load balancer before exposing customer traffic. Do not commit credentials or real `.env` files.
