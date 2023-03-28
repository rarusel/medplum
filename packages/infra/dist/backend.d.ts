import { Construct } from 'constructs';
import { MedplumInfraConfig } from './config';
/**
 * Based on: https://github.com/aws-samples/http-api-aws-fargate-cdk/blob/master/cdk/singleAccount/lib/fargate-vpclink-stack.ts
 *
 * RDS config: https://docs.aws.amazon.com/cdk/api/latest/docs/aws-rds-readme.html
 */
export declare class BackEnd extends Construct {
    constructor(scope: Construct, config: MedplumInfraConfig);
}
