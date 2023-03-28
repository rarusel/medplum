"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Storage = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cdk_serverless_clamscan_1 = require("cdk-serverless-clamscan");
const constructs_1 = require("constructs");
const waf_1 = require("./waf");
/**
 * Binary storage bucket and CloudFront distribution.
 */
class Storage extends constructs_1.Construct {
    constructor(parent, config) {
        super(parent, 'Storage');
        const zone = aws_cdk_lib_1.aws_route53.HostedZone.fromLookup(this, 'Zone', {
            domainName: config.domainName,
        });
        // S3 bucket
        const storageBucket = new aws_cdk_lib_1.aws_s3.Bucket(this, 'StorageBucket', {
            bucketName: config.storageBucketName,
            publicReadAccess: false,
            blockPublicAccess: aws_cdk_lib_1.aws_s3.BlockPublicAccess.BLOCK_ALL,
            encryption: aws_cdk_lib_1.aws_s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
        });
        if (config.clamscanEnabled) {
            // ClamAV serverless scan
            const sc = new cdk_serverless_clamscan_1.ServerlessClamscan(this, 'ServerlessClamscan', {
                defsBucketAccessLogsConfig: {
                    logsBucket: aws_cdk_lib_1.aws_s3.Bucket.fromBucketName(this, 'LoggingBucket', config.clamscanLoggingBucket),
                    logsPrefix: config.clamscanLoggingPrefix,
                },
            });
            sc.addSourceBucket(storageBucket);
        }
        // Public key in PEM format
        const publicKey = new aws_cdk_lib_1.aws_cloudfront.PublicKey(this, 'StoragePublicKey', {
            encodedKey: config.storagePublicKey,
        });
        // Authorized key group for presigned URLs
        const keyGroup = new aws_cdk_lib_1.aws_cloudfront.KeyGroup(this, 'StorageKeyGroup', {
            items: [publicKey],
        });
        // HTTP response headers policy
        const responseHeadersPolicy = new aws_cdk_lib_1.aws_cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
            securityHeadersBehavior: {
                contentSecurityPolicy: {
                    contentSecurityPolicy: "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *.medplum.com;",
                    override: true,
                },
                contentTypeOptions: { override: true },
                frameOptions: { frameOption: aws_cdk_lib_1.aws_cloudfront.HeadersFrameOption.DENY, override: true },
                referrerPolicy: { referrerPolicy: aws_cdk_lib_1.aws_cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
                strictTransportSecurity: {
                    accessControlMaxAge: aws_cdk_lib_1.Duration.seconds(63072000),
                    includeSubdomains: true,
                    override: true,
                },
                xssProtection: {
                    protection: true,
                    modeBlock: true,
                    override: true,
                },
            },
        });
        // WAF
        const waf = new aws_cdk_lib_1.aws_wafv2.CfnWebACL(this, 'StorageWAF', {
            defaultAction: { allow: {} },
            scope: 'CLOUDFRONT',
            name: `${config.stackName}-StorageWAF`,
            rules: waf_1.awsManagedRules,
            visibilityConfig: {
                cloudWatchMetricsEnabled: true,
                metricName: `${config.stackName}-StorageWAF-Metric`,
                sampledRequestsEnabled: false,
            },
        });
        // CloudFront distribution
        const distribution = new aws_cdk_lib_1.aws_cloudfront.Distribution(this, 'StorageDistribution', {
            defaultBehavior: {
                origin: new aws_cdk_lib_1.aws_cloudfront_origins.S3Origin(storageBucket),
                responseHeadersPolicy,
                viewerProtocolPolicy: aws_cdk_lib_1.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                trustedKeyGroups: [keyGroup],
            },
            certificate: aws_cdk_lib_1.aws_certificatemanager.Certificate.fromCertificateArn(this, 'StorageCertificate', config.storageSslCertArn),
            domainNames: [config.storageDomainName],
            webAclId: waf.attrArn,
        });
        // Route53 alias record for the CloudFront distribution
        const record = new aws_cdk_lib_1.aws_route53.ARecord(this, 'StorageAliasRecord', {
            recordName: config.storageDomainName,
            target: aws_cdk_lib_1.aws_route53.RecordTarget.fromAlias(new aws_cdk_lib_1.aws_route53_targets.CloudFrontTarget(distribution)),
            zone,
        });
        // Debug
        console.log('ARecord', record.domainName);
    }
}
exports.Storage = Storage;
//# sourceMappingURL=storage.js.map