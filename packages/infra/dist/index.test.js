"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const index_1 = require("./index");
describe('Infra', () => {
    test('Missing config', () => {
        expect(() => (0, index_1.main)()).not.toThrow();
    });
    test('Synth stack', () => {
        // Create a temp config file
        const filename = (0, path_1.resolve)('./medplum.test.config.json');
        (0, fs_1.writeFileSync)(filename, JSON.stringify({
            name: 'unittest',
            stackName: 'MedplumUnitTestStack',
            accountNumber: '647991932601',
            region: 'us-east-1',
            domainName: 'medplum.com',
            apiPort: 8103,
            apiDomainName: 'api.medplum.com',
            apiSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/08bf1daf-3a2b-4cbe-91a0-739b4364a1ec',
            appDomainName: 'app.medplum.com',
            appSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/fd21b628-b2c0-4a5d-b4f5-b5c9a6d63b1a',
            storageBucketName: 'medplum-storage',
            storageDomainName: 'storage.medplum.com',
            storageSslCertArn: 'arn:aws:acm:us-east-1:647991932601:certificate/19d85245-0a1d-4bf5-9789-23082b1a15fc',
            storagePublicKey: '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----',
            maxAzs: 2,
            rdsInstances: 1,
            desiredServerCount: 1,
            serverImage: 'medplum/medplum-server:staging',
            serverMemory: 512,
            serverCpu: 256,
            loadBalancerLoggingEnabled: true,
            loadBalancerLoggingBucket: 'medplum-logs-us-east-1',
            loadBalancerLoggingPrefix: 'elb',
            clamscanEnabled: true,
            clamscanLoggingBucket: 'medplum-logs-us-east-1',
            clamscanLoggingPrefix: 'clamscan',
        }), { encoding: 'utf-8' });
        expect(() => (0, index_1.main)({ config: filename })).not.toThrow();
        (0, fs_1.unlinkSync)(filename);
    });
});
//# sourceMappingURL=index.test.js.map