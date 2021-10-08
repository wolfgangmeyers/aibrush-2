import nodemailer from "nodemailer";
import { Mailcatcher } from "./mailcatcher";


async function sendMail(to: string, subject: string, text: string) {
    // send an email using nodemailer
    const transporter = nodemailer.createTransport({
        host: "localhost",
        port: 1025,
    });
    const mailOptions = {
        from: "noreply@test.aibrush.art",
        to,
        subject,
        text
    }
    await transporter.sendMail(mailOptions)
}

describe("Mailcatcher", () => {

    var mailcatcher: Mailcatcher;

    // get list of messages and delete each one before tests
    beforeEach(async () => {
        mailcatcher = new Mailcatcher("http://localhost:1080");
        const messages = await mailcatcher.getMessages();
        for (const message of messages) {
            await mailcatcher.deleteMessage(message.id);
        }
    });

    it("should have no messages by default", async () => {
        const messages = await mailcatcher.getMessages();
        expect(messages.length).toBe(0);
    })

    describe("after sending an email", () => {
        beforeEach(async () => {
            // send email
            // subject=test, recipients = ["test@test.test"], text="test email"
            await sendMail("test@test.test", "test", "test email");
        })

        it("should have one message", async () => {
            const messages = await mailcatcher.getMessages();
            expect(messages.length).toBe(1);
        })

        it("the message should match expected values", async () => {
            const messages = await mailcatcher.getMessages();
            const message = messages[0];
            expect(message.subject).toBe("test");
            expect(message.recipients).toEqual([
                "<test@test.test>"
            ])
            expect(message.text).toBe("test email");
        })

        describe("after deleting the email", () => {
            beforeEach(async () => {
                const messages = await mailcatcher.getMessages();
                const message = messages[0];
                await mailcatcher.deleteMessage(message.id);
            })

            it("should have no messages", async () => {
                const messages = await mailcatcher.getMessages();
                expect(messages.length).toBe(0);
            })
        })
    })
})