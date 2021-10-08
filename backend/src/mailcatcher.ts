import * as axios from "axios";

export interface MailcatcherMessage {
    id: number;
    sender: string;
    recipients: string[];
    subject: string;
    size: string;
    created_at: string;
    source?: string;
    text?: string;
}

export class Mailcatcher {
    private readonly url: string;

    constructor(url: string) {
        this.url = url;
    }

    /**
     * Splits body on \r\n\r\n and returns the last line
     */
    private parseMessageBody(body: string): string {
        const lines = body.split("\r\n\r\n");
        return lines[lines.length - 1].trim();
    }

    public async getMessages(): Promise<MailcatcherMessage[]> {
        const response = await axios.default.get(`${this.url}/messages`);
        const messages: Array<MailcatcherMessage> = response.data;
        return await Promise.all(messages.map(msg => this.getMessage(msg.id)))
    }

    public async getMessage(id: number): Promise<MailcatcherMessage> {
        const response = await axios.default.get(`${this.url}/messages/${id}.json`);
        const message = response.data as MailcatcherMessage;
        message.text = this.parseMessageBody(message.source);
        return message;
    }

    public async deleteMessage(id: number): Promise<void> {
        await axios.default.delete(`${this.url}/messages/${id}`);
    }
}