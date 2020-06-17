'use strict';

const AWS = require('aws-sdk-mock');
const AWS_SDK = require('aws-sdk')
const test = require('unit.js');
const rule = require('../ruleCode.js');

AWS.setSDKInstance(AWS_SDK);

const sampleInvokingEvent = {
    configurationItem: {
        configuration: {
            instanceType: "t3.micro",
        },
        configurationItemCaptureTime: "2018-01-01T00:00:00.007Z",
        configurationItemStatus: "ResourceDiscovered",
        resourceType: "AWS::EC2::Instance",
        resourceId: "resourceId",
    },
    messageType: "ConfigurationItemChangeNotification"
};

const sampleEvent = { 
    invokingEvent: JSON.stringify(sampleInvokingEvent),
    ruleParameters: '{"desiredInstanceType":"t3.micro"}',
    resultToken: 'result-token',
    eventLeftScope: false,
    executionRoleArn: 'arn:aws:iam::accountId:role/service-role/config-role',
    configRuleArn: 'arn:aws:config:region:accountId:config-rule/config-rule-id',
    configRuleName: 'configRuleName',
    configRuleId: 'configRuleId',
    accountId: 'accountId'
}

function evaluateConfiguration(testInvokingEvent, compliance, done) {
    let testEvent = JSON.parse(JSON.stringify(sampleEvent));
    testEvent.invokingEvent = JSON.stringify(testInvokingEvent);

    AWS.mock('ConfigService', 'putEvaluations', function(params, callback) {
        test.string(params.Evaluations[0].ComplianceType).isEqualTo(compliance);
        callback(null, { FailedEvaluations: [] });
    });  

    rule.lambdaHandler(testEvent, { /* context */ }, (err, result) => {
        try {
            test.number(result.FailedEvaluations.length).isEqualTo(0);
            done();
        } catch(error) {
            done(error);
        }
    });
    AWS.restore();
}

describe('Tests config rule compliance', function() {
    let testInvokingEvent;
    beforeEach(function(done) {
        testInvokingEvent = JSON.parse(JSON.stringify(sampleInvokingEvent));
        done();
    });
    it('verifies non-compliant resource', function(done) {
        testInvokingEvent.configurationItem.configuration.instanceType = 't3.small';
        evaluateConfiguration(testInvokingEvent, 'NON_COMPLIANT', done);
    });
    it('verifies compliant resource', function(done) {
        testInvokingEvent.configurationItem.configuration.instanceType = 't3.micro';
        evaluateConfiguration(testInvokingEvent, 'COMPLIANT', done);
    });
    it('verifies non applicable resource', function(done) {
        testInvokingEvent.configurationItem.resourceType = 'AWS::SNS::Topic';
        evaluateConfiguration(testInvokingEvent, 'NOT_APPLICABLE', done);
    });
});
