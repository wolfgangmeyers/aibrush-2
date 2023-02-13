aws --endpoint-url=http://localhost:4566 \
lambda create-function --function-name horde-worker \
--zip-file fileb://task.zip \
--handler index.handler --runtime nodejs16.x \
--role arn:aws:iam::000000000000:role/lambda-role \
--region us-west-2

aws sqs create-queue --queue-name horde-images \
--endpoint-url http://localhost:4566 --region us-west-2

aws lambda create-event-source-mapping --function-name horde-worker \
--batch-size 1 --maximum-batching-window-in-seconds 60  \
--event-source-arn arn:aws:sqs:us-east-1:000000000000:horde-images \
--endpoint-url http://localhost:4566 --region us-west-2

# aws sqs send-message --queue-url  http://localhost:4566/000000000000/horde-images  --message-body "OMG" --endpoint-url http://localhost:4566 --region us-west-2