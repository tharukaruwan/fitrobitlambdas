import https from "https";

export const handler = async (event) => {
  console.log("Received SNS event:", JSON.stringify(event, null, 2));

  try {
    const record = event.Records?.[0];
    if (!record || !record.Sns || !record.Sns.Message) {
      throw new Error("No SNS message found in event");
    }

    const messageId = record.Sns.MessageId;

    // check DB
    // const alreadyProcessed = await checkIfExists(messageId);

    // if (alreadyProcessed) {
    //   console.log("Duplicate message detected, skipping...");
    //   return;
    // }

    // Parse the SNS payload
    const payload = JSON.parse(record.Sns.Message);

    const postData = JSON.stringify({
      recipient: payload.phoneNumber,
      sender_id: payload.senderId, // dynamic sender from payload
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

    // save messageId
    // await saveMessageId(messageId);

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
