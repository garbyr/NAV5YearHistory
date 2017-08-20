// dependencies
const aws = require('aws-sdk');
aws.config.update({ region: 'eu-west-1' });

//globals
var error = false;
var errorMessage = [];
var functionName;

exports.handler = (event, context, callback) => {
    //parse the event from SNS
    var dateSequence = new Date().getTime().toString();
    var dateTime = new Date().toUTCString();
    functionName = context.functionName;
    //execute function 
    mainProcess(context, event, event.requestUUID, event.ISIN, event.NAV, event.sequence, event.category, event.frequency, event.description, event.user, callback);
}


mainProcess = function (context, input, requestUUID, ISIN, NAV, sequence, category, frequency, description, user, callback) {
    //write to the database
    var dynamo = new aws.DynamoDB();
    var sequenceFloor = (parseInt(sequence) - 500);
    var dateSequence = new Date().getTime().toString();
    var dateTime = new Date().toUTCString();

    console.log("sequence in " + sequence);
    console.log("sequence floor " + sequenceFloor);
    var params = {
        TableName: 'NAVHistory',
        // IndexName: 'index_name', // optional (if querying an index)

        // Expression to filter on indexed attributes
        KeyConditionExpression: '#hashkey = :hk_val AND #rangekey > :rk_val',
        ExpressionAttributeNames: {
            '#hashkey': 'ISIN',
            '#rangekey': 'Sequence',
        },
        ExpressionAttributeValues: {
            ':hk_val': { "S": ISIN },
            ':rk_val': { "S": sequenceFloor.toString() },
        }
    };

    //may want to add additional filter here that includes frequency - just in case a single ISIN has two frequencies
    dynamo.query(params, function (err, data) {
        if (err) {
            console.log("ERROR", err);
            error = true;
            errorMessage.push("failed to retrieve NAV history - calculation aborted");
            console.log("ERROR: failed to retrieve NAV history.  Calculation request aborted");
            raiseError(ISIN, sequence, requestUUID, user, callback);
        }
        else {
            console.log("SUCCESS", data);
            //sort out the array
            var navArray = data.Items;
            //check if NAVArray should be adjusted to add new
            if (NAV) {
                navArray = augmentNAVArray(navArray, sequence, NAV);
            }
            //publish to SNS
            var response = {
                requestUUID: requestUUID,
                ISIN: ISIN,
                sequence: sequence,
                category: category,
                frequency: frequency,
                description: description,
                user: user,
                navArray: navArray
            };
            var output = {
                status: "200",
                response: response
            }
            callback(null, { response });
        }
    });
}

RaiseError = function (ISIN, sequence, requestUUID, user, callback) {
    //write to the database
    var errorObj = {
        requestUUID: requestUUID,
        ISIN:ISIN,
        sequence: sequence,
        user: user,
        function: functionName,
        messages: errorMessage,

    }
    //reset error details just in case container is reused!!
    error = false;
    errorMessage = [];
    callback(errorObj);
}

getExpectedLastSequence = function (sequence) {
    var expectedLastSequence;
    var week = parseInt(sequence.substr(4, 2));
    if (week > 1) {
        week = week - 1;
        if (week < 9) {
            expectedLastSequence = (sequence.substr(0, 4) + "0" + week.toString());
        } else {
            expectedLastSequence = (sequence.substr(0, 4) + week.toString());
        }
    } else {
        var year = parseInt(sequence.substr(0, 4));
        var expectedYear = (year - 1).toString();
        var weeksInYear = new DV.getWeeksInYearForYear(expectedYear);
        expectedLastSequence = expectedYear + weeksInYear;
    }
    return expectedLastSequence;
}

augmentNAVArray = function (navArray, sequence, NAV) {
    var expectedLastSequence = getExpectedLastSequence(sequence);
    console.log("INFO: sequence In: " + sequence);
    console.log("INFO: last sequence on database: " + navArray[(navArray.length - 1)]);
    console.log("INFO: expected last sequence: " + expectedLastSequence);
    //do the check and augmentation :-)     
    return navArray;
}