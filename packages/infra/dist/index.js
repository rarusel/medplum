"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const fs_1 = require("fs");
const path_1 = require("path");
const backend_1 = require("./backend");
const frontend_1 = require("./frontend");
const storage_1 = require("./storage");
class MedplumStack extends aws_cdk_lib_1.Stack {
    constructor(scope, config) {
        super(scope, config.stackName, {
            env: {
                region: config.region,
                account: config.accountNumber,
            },
        });
        this.backEnd = new backend_1.BackEnd(this, config);
        this.frontEnd = new frontend_1.FrontEnd(this, config);
        this.storage = new storage_1.Storage(this, config);
    }
}
function main(context) {
    const app = new aws_cdk_lib_1.App({ context });
    const configFileName = app.node.tryGetContext('config');
    if (!configFileName) {
        console.log('Missing "config" context variable');
        console.log('Usage: cdk deploy -c config=my-config.json');
        return;
    }
    const config = JSON.parse((0, fs_1.readFileSync)((0, path_1.resolve)(configFileName), 'utf-8'));
    const stack = new MedplumStack(app, config);
    console.log('Stack', stack.stackId);
    console.log('BackEnd', stack.backEnd.node.id);
    console.log('FrontEnd', stack.frontEnd.node.id);
    console.log('Storage', stack.storage.node.id);
    app.synth();
}
exports.main = main;
if (process.argv[1].endsWith('index.ts')) {
    main();
}
//# sourceMappingURL=index.js.map