import sharp from "sharp";

export function mergeImage(baseImage: Buffer, overlayImage: Buffer, x: number, y: number): Promise<Buffer> {
  return sharp(baseImage)
    .composite([{ input: overlayImage, left: x, top: y }])
    .toBuffer();
}

// TODO: merge images by filename by invoking lambda function
// it's not really any faster but might scale better

// var AWS = require('aws-sdk');
// AWS.config.region = 'eu-west-1';
// var lambda = new AWS.Lambda();

// exports.handler = function(event, context) {
//   var params = {
//     FunctionName: 'Lambda_B', // the lambda function we are going to invoke
//     InvocationType: 'RequestResponse',
//     LogType: 'Tail',
//     Payload: '{ "name" : "Alex" }'
//   };

//   lambda.invoke(params, function(err, data) {
//     if (err) {
//       context.fail(err);
//     } else {
//       context.succeed('Lambda_B said '+ data.Payload);
//     }
//   })
// };