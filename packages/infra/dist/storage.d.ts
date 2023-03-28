import { Construct } from 'constructs';
import { MedplumInfraConfig } from './config';
/**
 * Binary storage bucket and CloudFront distribution.
 */
export declare class Storage extends Construct {
    constructor(parent: Construct, config: MedplumInfraConfig);
}
