import https from "https";
import AWS from "aws-sdk";

const dynamo = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.IDEMPOTENCY_TABLE || "FitrobitProcessedMessages";

// ✅ Check if message already processed
async function checkIfExists(messageId) {
  const result = await dynamo
    .get({
      TableName: TABLE_NAME,
      Key: { messageId },
    })
    .promise();

  return !!result.Item;
}

// ✅ Save processed messageId with TTL (24 hours)
async function saveMessageId(messageId) {
  const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24 hours

  await dynamo
    .put({
      TableName: TABLE_NAME,
      Item: {
        messageId,
        expiresAt: ttl,
      },
    })
    .promise();
}

export const handler = async (event) => {
  console.log("Received SNS event:", JSON.stringify(event, null, 2));

  try {
    const record = event.Records?.[0];
    if (!record || !record.Sns || !record.Sns.Message) {
      throw new Error("No SNS message found in event");
    }

    const messageId = record.Sns.MessageId;

    // Check idempotency
    const alreadyProcessed = await checkIfExists(messageId);

    if (alreadyProcessed) {
      console.log("Duplicate message detected, skipping...");
      return {
        statusCode: 200,
        body: "Duplicate message skipped",
      };
    }

    const payload = JSON.parse(record.Sns.Message);

    const postData = JSON.stringify({
      recipient: payload.phoneNumber,
      sender_id: payload.senderId,
      type: "plain",
      message: payload.text,
    });

    const options = {
      hostname: "app.text.lk",
      path: "/api/v3/sms/send",
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SMS_TOKEN}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    // Send SMS via Text.lk API
    await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log("SMS API response:", data);
          resolve();
        });
      });

      req.on("error", (err) => reject(err));
      req.write(postData);
      req.end();
    });

    console.log(`SMS sent to ${payload.phoneNumber}`);

    // Save messageId AFTER successful SMS
    await saveMessageId(messageId);

    return {
      statusCode: 200,
      body: JSON.stringify("SNS processed and SMS sent successfully"),
    };
  } catch (error) {
    console.error("Error processing SNS event:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error processing SNS event",
        error: error.message,
      }),
    };
  }
};
