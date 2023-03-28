"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackEnd = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_ecr_1 = require("aws-cdk-lib/aws-ecr");
const constructs_1 = require("constructs");
const waf_1 = require("./waf");
/**
 * Based on: https://github.com/aws-samples/http-api-aws-fargate-cdk/blob/master/cdk/singleAccount/lib/fargate-vpclink-stack.ts
 *
 * RDS config: https://docs.aws.amazon.com/cdk/api/latest/docs/aws-rds-readme.html
 */
class BackEnd extends constructs_1.Construct {
    constructor(scope, config) {
        super(scope, 'BackEnd');
        const name = config.name;
        // VPC Flow Logs
        const vpcFlowLogs = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'VpcFlowLogs', {
            logGroupName: '/medplum/flowlogs/' + name,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        });
        // VPC
        const vpc = new aws_cdk_lib_1.aws_ec2.Vpc(this, 'VPC', {
            maxAzs: config.maxAzs,
            flowLogs: {
                cloudwatch: {
                    destination: aws_cdk_lib_1.aws_ec2.FlowLogDestination.toCloudWatchLogs(vpcFlowLogs),
                    trafficType: aws_cdk_lib_1.aws_ec2.FlowLogTrafficType.ALL,
                },
            },
        });
        // Bot Lambda Role
        const botLambdaRole = new aws_cdk_lib_1.aws_iam.Role(this, 'BotLambdaRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
        });
        // RDS
        const rdsCluster = new aws_cdk_lib_1.aws_rds.DatabaseCluster(this, 'DatabaseCluster', {
            engine: aws_cdk_lib_1.aws_rds.DatabaseClusterEngine.auroraPostgres({
                version: aws_cdk_lib_1.aws_rds.AuroraPostgresEngineVersion.VER_12_9,
            }),
            credentials: aws_cdk_lib_1.aws_rds.Credentials.fromGeneratedSecret('clusteradmin'),
            defaultDatabaseName: 'medplum',
            storageEncrypted: true,
            instances: config.rdsInstances,
            instanceProps: {
                vpc: vpc,
                vpcSubnets: {
                    subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            },
            backup: {
                retention: aws_cdk_lib_1.Duration.days(7),
            },
            cloudwatchLogsExports: ['postgresql'],
        });
        // Redis
        // Important: For HIPAA compliance, you must specify TransitEncryptionEnabled as true, an AuthToken, and a CacheSubnetGroup.
        const redisSubnetGroup = new aws_cdk_lib_1.aws_elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
            description: 'Redis Subnet Group',
            subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
        });
        const redisSecurityGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'RedisSecurityGroup', {
            vpc,
            description: 'Redis Security Group',
            allowAllOutbound: false,
        });
        const redisPassword = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'RedisPassword', {
            generateSecretString: {
                secretStringTemplate: '{}',
                generateStringKey: 'password',
                excludeCharacters: '@%*()_+=`~{}|[]\\:";\'?,./',
            },
        });
        const redisCluster = new aws_cdk_lib_1.aws_elasticache.CfnReplicationGroup(this, 'RedisCluster', {
            engine: 'Redis',
            engineVersion: '6.x',
            cacheNodeType: 'cache.t2.medium',
            replicationGroupDescription: 'RedisReplicationGroup',
            authToken: redisPassword.secretValueFromJson('password').toString(),
            transitEncryptionEnabled: true,
            atRestEncryptionEnabled: true,
            multiAzEnabled: true,
            cacheSubnetGroupName: redisSubnetGroup.ref,
            numNodeGroups: 1,
            replicasPerNodeGroup: 1,
            securityGroupIds: [redisSecurityGroup.securityGroupId],
        });
        redisCluster.node.addDependency(redisPassword);
        const redisSecrets = new aws_cdk_lib_1.aws_secretsmanager.Secret(this, 'RedisSecrets', {
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    host: redisCluster.attrPrimaryEndPointAddress,
                    port: redisCluster.attrPrimaryEndPointPort,
                    password: redisPassword.secretValueFromJson('password').toString(),
                    tls: {},
                }),
                generateStringKey: 'unused',
            },
        });
        redisSecrets.node.addDependency(redisPassword);
        redisSecrets.node.addDependency(redisCluster);
        // ECS Cluster
        const cluster = new aws_cdk_lib_1.aws_ecs.Cluster(this, 'Cluster', {
            vpc: vpc,
        });
        // Task Policies
        const taskRolePolicies = new aws_cdk_lib_1.aws_iam.PolicyDocument({
            statements: [
                // CloudWatch Logs: Create streams and put events
                new aws_cdk_lib_1.aws_iam.PolicyStatement({
                    effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
                    actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                    resources: ['arn:aws:logs:*'],
                }),
                // Secrets Manager: Read only access to secrets
                // https://docs.aws.amazon.com/mediaconnect/latest/ug/iam-policy-examples-asm-secrets.html
                new aws_cdk_lib_1.aws_iam.PolicyStatement({
                    effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
                    actions: [
                        'secretsmanager:GetResourcePolicy',
                        'secretsmanager:GetSecretValue',
                        'secretsmanager:DescribeSecret',
                        'secretsmanager:ListSecrets',
                        'secretsmanager:ListSecretVersionIds',
                    ],
                    resources: ['arn:aws:secretsmanager:*'],
                }),
                // Parameter Store: Read only access
                // https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-access.html
                new aws_cdk_lib_1.aws_iam.PolicyStatement({
                    effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
                    actions: ['ssm:GetParametersByPath', 'ssm:GetParameters', 'ssm:GetParameter', 'ssm:DescribeParameters'],
                    resources: ['arn:aws:ssm:*'],
                }),
                // SES: Send emails
                // https://docs.aws.amazon.com/ses/latest/dg/sending-authorization-policy-examples.html
                new aws_cdk_lib_1.aws_iam.PolicyStatement({
                    effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
                    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
                    resources: ['arn:aws:ses:*'],
                }),
                // S3: Read and write access to buckets
                // https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazons3.html
                new aws_cdk_lib_1.aws_iam.PolicyStatement({
                    effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
                    actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
                    resources: ['arn:aws:s3:::*'],
                }),
                // IAM: Pass role to innvoke lambda functions
                // https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html
                new aws_cdk_lib_1.aws_iam.PolicyStatement({
                    effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
                    actions: ['iam:ListRoles', 'iam:GetRole', 'iam:PassRole'],
                    resources: [botLambdaRole.roleArn],
                }),
                // Lambda: Create, read, update, delete, and invoke functions
                // https://docs.aws.amazon.com/lambda/latest/dg/access-control-identity-based.html
                new aws_cdk_lib_1.aws_iam.PolicyStatement({
                    effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
                    actions: [
                        'lambda:CreateFunction',
                        'lambda:GetFunction',
                        'lambda:GetFunctionConfiguration',
                        'lambda:UpdateFunctionCode',
                        'lambda:UpdateFunctionConfiguration',
                        'lambda:ListLayerVersions',
                        'lambda:GetLayerVersion',
                        'lambda:InvokeFunction',
                    ],
                    resources: ['arn:aws:lambda:*'],
                }),
            ],
        });
        // Task Role
        const taskRole = new aws_cdk_lib_1.aws_iam.Role(this, 'TaskExecutionRole', {
            assumedBy: new aws_cdk_lib_1.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            description: 'Medplum Server Task Execution Role',
            inlinePolicies: {
                TaskExecutionPolicies: taskRolePolicies,
            },
        });
        // Task Definitions
        const taskDefinition = new aws_cdk_lib_1.aws_ecs.FargateTaskDefinition(this, 'TaskDefinition', {
            memoryLimitMiB: config.serverMemory,
            cpu: config.serverCpu,
            taskRole: taskRole,
        });
        // Log Groups
        const logGroup = new aws_cdk_lib_1.aws_logs.LogGroup(this, 'LogGroup', {
            logGroupName: '/ecs/medplum/' + name,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
        });
        const logDriver = new aws_cdk_lib_1.aws_ecs.AwsLogDriver({
            logGroup: logGroup,
            streamPrefix: 'Medplum',
        });
        // Task Containers
        let serverImage = undefined;
        // Pull out the image name and tag from the image URI if it's an ECR image
        const ecrImageUriRegex = new RegExp(`^${config.accountNumber}\\.dkr\\.ecr\\.${config.region}\\.amazonaws\\.com/(.*)[:@](.*)$`);
        const nameTagMatches = config.serverImage.match(ecrImageUriRegex);
        const serverImageName = nameTagMatches?.[1];
        const serverImageTag = nameTagMatches?.[2];
        if (serverImageName && serverImageTag) {
            // Creating an ecr repository image will automatically grant fine-grained permissions to ecs to access the image
            const ecrRepo = aws_ecr_1.Repository.fromRepositoryArn(this, 'ServerImageRepo', `arn:aws:ecr:${config.region}:${config.accountNumber}:repository/${serverImageName}`);
            serverImage = aws_cdk_lib_1.aws_ecs.ContainerImage.fromEcrRepository(ecrRepo, serverImageTag);
        }
        else {
            // Otherwise, use the standard container image
            serverImage = aws_cdk_lib_1.aws_ecs.ContainerImage.fromRegistry(config.serverImage);
        }
        const serviceContainer = taskDefinition.addContainer('MedplumTaskDefinition', {
            image: serverImage,
            command: [`aws:/medplum/${name}/`],
            logging: logDriver,
        });
        serviceContainer.addPortMappings({
            containerPort: config.apiPort,
            hostPort: config.apiPort,
        });
        // Security Groups
        const fargateSecurityGroup = new aws_cdk_lib_1.aws_ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
            allowAllOutbound: true,
            securityGroupName: 'MedplumSecurityGroup',
            vpc: vpc,
        });
        // Fargate Services
        const fargateService = new aws_cdk_lib_1.aws_ecs.FargateService(this, 'FargateService', {
            cluster: cluster,
            taskDefinition: taskDefinition,
            assignPublicIp: false,
            vpcSubnets: {
                subnetType: aws_cdk_lib_1.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            desiredCount: config.desiredServerCount,
            securityGroups: [fargateSecurityGroup],
        });
        // Load Balancer Target Group
        const targetGroup = new aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationTargetGroup(this, 'TargetGroup', {
            vpc: vpc,
            port: config.apiPort,
            protocol: aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
            healthCheck: {
                path: '/healthcheck',
                interval: aws_cdk_lib_1.Duration.seconds(30),
                timeout: aws_cdk_lib_1.Duration.seconds(3),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 5,
            },
            targets: [fargateService],
        });
        // Load Balancer
        const loadBalancer = new aws_cdk_lib_1.aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
            vpc: vpc,
            internetFacing: true,
            http2Enabled: true,
        });
        if (config.loadBalancerLoggingEnabled) {
            // Load Balancer logging
            loadBalancer.logAccessLogs(aws_cdk_lib_1.aws_s3.Bucket.fromBucketName(this, 'LoggingBucket', config.loadBalancerLoggingBucket), config.loadBalancerLoggingPrefix);
        }
        // HTTPS Listener
        // Forward to the target group
        loadBalancer.addListener('HttpsListener', {
            port: 443,
            certificates: [
                {
                    certificateArn: config.apiSslCertArn,
                },
            ],
            sslPolicy: aws_cdk_lib_1.aws_elasticloadbalancingv2.SslPolicy.FORWARD_SECRECY_TLS12_RES_GCM,
            defaultAction: aws_cdk_lib_1.aws_elasticloadbalancingv2.ListenerAction.forward([targetGroup]),
        });
        // WAF
        const waf = new aws_cdk_lib_1.aws_wafv2.CfnWebACL(this, 'BackEndWAF', {
            defaultAction: { allow: {} },
            scope: 'REGIONAL',
            name: `${config.stackName}-BackEndWAF`,
            rules: waf_1.awsManagedRules,
            visibilityConfig: {
                cloudWatchMetricsEnabled: true,
                metricName: `${config.stackName}-BackEndWAF-Metric`,
                sampledRequestsEnabled: false,
            },
        });
        // Create an association between the load balancer and the WAF
        const wafAssociation = new aws_cdk_lib_1.aws_wafv2.CfnWebACLAssociation(this, 'LoadBalancerAssociation', {
            resourceArn: loadBalancer.loadBalancerArn,
            webAclArn: waf.attrArn,
        });
        // Grant RDS access to the fargate group
        rdsCluster.connections.allowDefaultPortFrom(fargateSecurityGroup);
        // Grant Redis access to the fargate group
        redisSecurityGroup.addIngressRule(fargateSecurityGroup, aws_cdk_lib_1.aws_ec2.Port.tcp(6379));
        // Route 53
        const zone = aws_cdk_lib_1.aws_route53.HostedZone.fromLookup(this, 'Zone', {
            domainName: config.domainName,
        });
        // Route53 alias record for the load balancer
        const record = new aws_cdk_lib_1.aws_route53.ARecord(this, 'LoadBalancerAliasRecord', {
            recordName: config.apiDomainName,
            target: aws_cdk_lib_1.aws_route53.RecordTarget.fromAlias(new aws_cdk_lib_1.aws_route53_targets.LoadBalancerTarget(loadBalancer)),
            zone: zone,
        });
        // SSM Parameters
        const databaseSecrets = new aws_cdk_lib_1.aws_ssm.StringParameter(this, 'DatabaseSecretsParameter', {
            tier: aws_cdk_lib_1.aws_ssm.ParameterTier.STANDARD,
            parameterName: `/medplum/${name}/DatabaseSecrets`,
            description: 'Database secrets ARN',
            stringValue: rdsCluster.secret?.secretArn,
        });
        const redisSecretsParameter = new aws_cdk_lib_1.aws_ssm.StringParameter(this, 'RedisSecretsParameter', {
            tier: aws_cdk_lib_1.aws_ssm.ParameterTier.STANDARD,
            parameterName: `/medplum/${name}/RedisSecrets`,
            description: 'Redis secrets ARN',
            stringValue: redisSecrets.secretArn,
        });
        const botLambdaRoleParameter = new aws_cdk_lib_1.aws_ssm.StringParameter(this, 'BotLambdaRoleParameter', {
            tier: aws_cdk_lib_1.aws_ssm.ParameterTier.STANDARD,
            parameterName: `/medplum/${name}/botLambdaRoleArn`,
            description: 'Bot lambda execution role ARN',
            stringValue: botLambdaRole.roleArn,
        });
        // Debug
        console.log('ARecord', record.domainName);
        console.log('DatabaseSecretsParameter', databaseSecrets.parameterArn);
        console.log('RedisSecretsParameter', redisSecretsParameter.parameterArn);
        console.log('RedisCluster', redisCluster.attrPrimaryEndPointAddress);
        console.log('BotLambdaRole', botLambdaRoleParameter.stringValue);
        console.log('WAF', waf.attrArn);
        console.log('WAF Association', wafAssociation.node.id);
    }
}
exports.BackEnd = BackEnd;
//# sourceMappingURL=backend.js.map