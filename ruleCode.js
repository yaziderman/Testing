/**
 * RULE DESCRIPTION
 * This example rule checks that EC2 instances are of the desired instance type
 * The desired instance type is specified in the rule parameters.

 * RULE DETAILS
 * Trigger Type (Change Triggered or Periodic: Change Triggered)

 * Required Parameters: desiredInstanceType - t3.micro
 * Rule parameters are defined in template.yml
 */

'use strict';

const ruleUtil = require('./ruleUtil');

/** Add Scope of Changes e.g. ["AWS::EC2::Instance"] or ["AWS::EC2::Instance","AWS::EC2::InternetGateway"] */
const APPLICABLE_RESOURCE_TYPES = ['AWS::EC2::Instance']
/**
 * This is where it's determined whether the resource is compliant or not.
 * In this example, we simply decide that the resource is compliant if it is an instance and its type matches the type specified as the desired type.
 * If the resource is not an EC2 instance, then we deem this resource to be not applicable. (If the scope of the rule is specified to include only
 * instances, this rule would never have been invoked.)
 */ 
function evaluateCompliance(configurationItem, ruleParameters) {
    if (!APPLICABLE_RESOURCE_TYPES.includes(configurationItem.resourceType)) {
        return 'NOT_APPLICABLE';
    }
    if (ruleParameters.desiredInstanceType === configurationItem.configuration.instanceType) {
        return 'COMPLIANT';
    }
    return 'NON_COMPLIANT';
}

function ruleHandler(event, context, callback) {
    const invokingEvent = JSON.parse(event.invokingEvent);
    const configItem = invokingEvent.configurationItem;
    const ruleParameters = JSON.parse(event.ruleParameters);
    callback(null, evaluateCompliance(configItem, ruleParameters));
}

exports.lambdaHandler = (event, context, callback) => {
    ruleUtil.decorateHandler(ruleHandler)(event, context, callback);
}