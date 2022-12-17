
export const NOTIFICATION_IMAGE_UPDATED = "image_updated";
export const NOTIFICATION_IMAGE_DELETED = "image_deleted";
export const NOTIFICATION_PENDING_IMAGE = "pending_image";
export const NOTIFICATION_BOOST_UPDATED = "boost_updated";

export class ApiSocket {
    private client?: WebSocket;
    private accessToken?: string
    private messageListener?: (message: string) => void;

    updateToken(accessToken: string) {
        this.accessToken = accessToken;
    }

    onMessage(listener?: (message: string) => void) {
        this.messageListener = listener;
    }

    connect() {
        if (!this.accessToken) {
            throw new Error("unauthenticated");
        }
        if (this.client) {
            // will reconnect in one second automatically
            // this is called every time the auth refreshes
            this.client.close();
            return;
        }
        let host = window.location.host;
        let protocol = "wss";
        if (host.includes("localhost")) {
          host = "localhost:3000";
          protocol = "ws";
        }
        this.client = new WebSocket(`${protocol}://${host}`);
        this.client.onerror = err => console.error(err);
        this.client.onopen = () => {
            console.log("websocket connected");
            this.client!.send(this.accessToken!);
        }
        this.client.onmessage = evt => {
            console.log("server push", evt.data);
            if (this.messageListener) {
                this.messageListener(evt.data as string);
            }
        }
        this.client.onclose = () => {
          console.log("websocket closed");
          this.client = undefined;
          setTimeout(() => this.connect(), 1000);
        }
    }
}
