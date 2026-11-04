# Samantha MVP

A small TypeScript monorepo with independently deployable frontend and backend applications.

## Layout

- `frontend/`: Next.js App Router application, deployed to Vercel.
- `backend/`: NestJS API, packaged as a Docker image for AWS ECS Fargate.
- `infrastructure/aws/`: AWS CDK application for the Fargate service and public Application Load Balancer.

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

## Frontend deployment (Vercel)

Create a Vercel project with the repository root directory set to `frontend`. Vercel detects Next.js and configures the build automatically. Add `NEXT_PUBLIC_API_URL` as a project environment variable with the deployed API base URL (for example, `https://api.example.com`). Set it separately for Preview and Production environments.

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
