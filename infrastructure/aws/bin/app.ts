#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { BackendStack } from "../lib/backend-stack";

const app = new cdk.App();
const frontendOrigin = app.node.tryGetContext("frontendOrigin") ?? "http://localhost:3000";

new BackendStack(app, "Care GPMvpBackend", { frontendOrigin });
