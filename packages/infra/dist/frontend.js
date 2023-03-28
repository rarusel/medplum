"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrontEnd = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
const waf_1 = require("./waf");
/**
 * Static app infrastructure, which deploys app content to an S3 bucket.
 *
 * The app redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
class FrontEnd extends constructs_1.Construct {
    constructor(parent, config) {
        super(parent, 'FrontEnd');
        const zone = aws_cdk_lib_1.aws_route53.HostedZone.fromLookup(this, 'Zone', {
            domainName: config.domainName,
        });
        // S3 bucket
        const appBucket = new aws_cdk_lib_1.aws_s3.Bucket(this, 'AppBucket', {
            bucketName: config.appDomainName,
            publicReadAccess: false,
            blockPublicAccess: aws_cdk_lib_1.aws_s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            encryption: aws_cdk_lib_1.aws_s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
        });
        // HTTP response headers policy
        const responseHeadersPolicy = new aws_cdk_lib_1.aws_cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
            securityHeadersBehavior: {
                contentSecurityPolicy: {
                    contentSecurityPolicy: [
                        `default-src 'none'`,
                        `base-uri 'self'`,
                        `child-src 'self'`,
                        `connect-src 'self' ${config.apiDomainName} *.google.com`,
                        `font-src 'self' fonts.gstatic.com`,
                        `form-action 'self' *.gstatic.com *.google.com`,
                        `frame-ancestors 'none'`,
                        `frame-src 'self' *.medplum.com *.gstatic.com *.google.com`,
                        `img-src 'self' data: ${config.storageDomainName} *.gstatic.com *.google.com *.googleapis.com`,
                        `manifest-src 'self'`,
                        `media-src 'self' ${config.storageDomainName}`,
                        `script-src 'self' *.medplum.com *.gstatic.com *.google.com`,
                        `style-src 'self' 'unsafe-inline' *.medplum.com *.gstatic.com *.google.com`,
                        `worker-src 'self' blob: *.gstatic.com *.google.com`,
                        `upgrade-insecure-requests`,
                    ].join('; '),
                    override: true,
                },
                contentTypeOptions: { override: true },
                frameOptions: { frameOption: aws_cdk_lib_1.aws_cloudfront.HeadersFrameOption.DENY, override: true },
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
        const waf = new aws_cdk_lib_1.aws_wafv2.CfnWebACL(this, 'FrontEndWAF', {
            defaultAction: { allow: {} },
            scope: 'CLOUDFRONT',
            name: `${config.stackName}-FrontEndWAF`,
            rules: waf_1.awsManagedRules,
            visibilityConfig: {
                cloudWatchMetricsEnabled: true,
                metricName: `${config.stackName}-FrontEndWAF-Metric`,
                sampledRequestsEnabled: false,
            },
        });
        // API Origin Cache Policy
        const apiOriginCachePolicy = new aws_cdk_lib_1.aws_cloudfront.CachePolicy(this, 'ApiOriginCachePolicy', {
            cachePolicyName: `${config.stackName}-ApiOriginCachePolicy`,
            cookieBehavior: aws_cdk_lib_1.aws_cloudfront.CacheCookieBehavior.all(),
            headerBehavior: aws_cdk_lib_1.aws_cloudfront.CacheHeaderBehavior.allowList('Authorization', 'Content-Encoding', 'Content-Type', 'If-None-Match', 'Origin', 'Referer', 'User-Agent', 'X-Medplum'),
            queryStringBehavior: aws_cdk_lib_1.aws_cloudfront.CacheQueryStringBehavior.all(),
        });
        // CloudFront distribution
        const distribution = new aws_cdk_lib_1.aws_cloudfront.Distribution(this, 'AppDistribution', {
            defaultRootObject: 'index.html',
            defaultBehavior: {
                origin: new aws_cdk_lib_1.aws_cloudfront_origins.S3Origin(appBucket),
                responseHeadersPolicy,
                viewerProtocolPolicy: aws_cdk_lib_1.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            additionalBehaviors: {
                '/api/*': {
                    origin: new aws_cdk_lib_1.aws_cloudfront_origins.HttpOrigin(config.apiDomainName),
                    allowedMethods: aws_cdk_lib_1.aws_cloudfront.AllowedMethods.ALLOW_ALL,
                    cachePolicy: apiOriginCachePolicy,
                    viewerProtocolPolicy: aws_cdk_lib_1.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                },
            },
            certificate: aws_cdk_lib_1.aws_certificatemanager.Certificate.fromCertificateArn(this, 'AppCertificate', config.appSslCertArn),
            domainNames: [config.appDomainName],
            errorResponses: [
                {
                    httpStatus: 403,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                },
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                },
            ],
            webAclId: waf.attrArn,
        });
        // Route53 alias record for the CloudFront distribution
        const record = new aws_cdk_lib_1.aws_route53.ARecord(this, 'AppAliasRecord', {
            recordName: config.appDomainName,
            target: aws_cdk_lib_1.aws_route53.RecordTarget.fromAlias(new aws_cdk_lib_1.aws_route53_targets.CloudFrontTarget(distribution)),
            zone,
        });
        // Debug
        console.log('ARecord', record.domainName);
    }
}
exports.FrontEnd = FrontEnd;
//# sourceMappingURL=frontend.js.map