import { Construct } from 'constructs';
import { MedplumInfraConfig } from './config';
/**
 * Static app infrastructure, which deploys app content to an S3 bucket.
 *
 * The app redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export declare class FrontEnd extends Construct {
    constructor(parent: Construct, config: MedplumInfraConfig);
}
