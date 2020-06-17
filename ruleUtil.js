'use strict';

const AWS = require('aws-sdk');

/** Helper function used to validate input */
function checkDefined(reference, referenceName) {
    if (!reference) {
        throw new Error(`Error: ${referenceName} is not defined`);
    }
    return reference;
}

/** Check whether the message is OversizedConfigurationItemChangeNotification or not */
function isOverSizedChangeNotification(messageType) {
    checkDefined(messageType, 'messageType');
    return messageType === 'OversizedConfigurationItemChangeNotification';
}

/** Get configurationItem using getResourceConfigHistory API. */
function getConfiguration(resourceType, resourceId, configurationCaptureTime, callback) {
    const config = new AWS.ConfigService();
    config.getResourceConfigHistory({ resourceType, resourceId, laterTime: new Date(configurationCaptureTime), limit: 1 }, (err, data) => {
        if (err) {
            callback(err, null);
        } else {
	        const configurationItem = data.configurationItems[0];
	        callback(null, configurationItem);
        }
    });
}

/**  Convert from the API model to the original invocation model */
function convertApiConfiguration(apiConfiguration) {
    const convertedConfiguration = apiConfiguration;
    convertedConfiguration.awsAccountId = convertedConfiguration.accountId;
    convertedConfiguration.ARN = convertedConfiguration.arn;
    convertedConfiguration.configurationStateMd5Hash = convertedConfiguration.configurationItemMD5Hash;
    convertedConfiguration.configurationItemVersion = convertedConfiguration.version;
    convertedConfiguration.configuration = JSON.parse(convertedConfiguration.configuration);
    (convertedConfiguration.relationships || []).map(relationship => Object.assign({}, relationship, { name: relationship.relationshipName }));
    return convertedConfiguration;
}

/**
 * Based on the type of message get the configuration item either from configurationItem 
 * in the invoking event or using the getResourceConfigHistiry API in getConfiguration function.
 */ 
function getConfigurationItem(invokingEvent, callback) {
    checkDefined(invokingEvent, 'invokingEvent');
    if (isOverSizedChangeNotification(invokingEvent.messageType)) {
        const configurationItemSummary = checkDefined(invokingEvent.configurationItemSummary, 'configurationItemSummary');
        getConfiguration(configurationItemSummary.resourceType, configurationItemSummary.resourceId, configurationItemSummary.configurationItemCaptureTime, (err, apiConfigurationItem) => {
            if (err) {
                callback(err);
            } else {
            	const configurationItem = convertApiConfiguration(apiConfigurationItem);
            	callback(null, configurationItem);
            }	
        });
    } else {
        checkDefined(invokingEvent.configurationItem, 'configurationItem');
        callback(null, invokingEvent.configurationItem);
    }
}

/**  Check whether the resource has been deleted. If it has, then the evaluation is unnecessary. */
function isApplicable(configurationItem, event) {
    checkDefined(configurationItem, 'configurationItem');
    checkDefined(event, 'event');
    const status = configurationItem.configurationItemStatus;
    const eventLeftScope = event.eventLeftScope;
    return (status === 'OK' || status === 'ResourceDiscovered') && eventLeftScope === false;
}
/**
 * This is the handler that's invoked by Lambda
 * Most of this code is boilerplate; use as is
 */
exports.decorateHandler = (rule_handler) => (event, context, callback) => {
    const config = new AWS.ConfigService();
    checkDefined(event, 'event');
    const invokingEvent = JSON.parse(event.invokingEvent);
    const ruleParameters = JSON.parse(event.ruleParameters);
    getConfigurationItem(invokingEvent, (err, configurationItem) => {
        if (err) {
            callback(err);
            return;
        }
        let compliance = 'NOT_APPLICABLE';
        const putEvaluationsRequest = {};
        if (isApplicable(configurationItem, event)) {
            invokingEvent.configurationItem = configurationItem;
            event.invokingEvent = JSON.stringify(invokingEvent);
            rule_handler(event, context, (err, computedCompliance) => {
                if (err) {
                    callback(err);
                    return;
                }
                compliance = computedCompliance;
            });
        }
        // Put together the request that reports the evaluation status
        putEvaluationsRequest.Evaluations = [
            {
                ComplianceResourceType: configurationItem.resourceType,
                ComplianceResourceId: configurationItem.resourceId,
                ComplianceType: compliance,
                OrderingTimestamp: configurationItem.configurationItemCaptureTime,
            },
        ];
        putEvaluationsRequest.ResultToken = event.resultToken;

        // Invoke the Config API to report the result of the evaluation
        config.putEvaluations(putEvaluationsRequest, (error, data) => {
            if (error) {
                callback(error, null);
            } else if (data.FailedEvaluations.length > 0) {
                // Ends the function execution if any evaluation results are not successfully reported.
                callback(JSON.stringify(data), null);
            } else {
                callback(null, data);
            }
        });
    });
};