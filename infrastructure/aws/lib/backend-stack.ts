import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface BackendStackProps extends cdk.StackProps {
  frontendOrigin: string;
}

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
    });
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });
    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "ApiService",
      {
        cluster,
        cpu: 512,
        memoryLimitMiB: 1024,
        desiredCount: 2,
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
        publicLoadBalancer: true,
        assignPublicIp: false,
        taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        taskImageOptions: {
          image: ecs.ContainerImage.fromAsset(
            path.resolve(__dirname, "../../../backend"),
          ),
          containerPort: 3000,
          environment: {
            NODE_ENV: "production",
            PORT: "3000",
            CORS_ORIGIN: props.frontendOrigin,
          },
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: "backend",
            logRetention: logs.RetentionDays.ONE_MONTH,
          }),
        },
        circuitBreaker: { rollback: true },
      },
    );

    service.targetGroup.configureHealthCheck({
      path: "/api/health",
      healthyHttpCodes: "200",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    const scaling = service.service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 6,
    });
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 60,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: `http://${service.loadBalancer.loadBalancerDnsName}`,
      description: "API endpoint; configure a custom domain and HTTPS for production.",
    });
  }
}
