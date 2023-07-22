
export const NOTIFICATION_IMAGE_UPDATED = "image_updated";
export const NOTIFICATION_IMAGE_DELETED = "image_deleted";
export const NOTIFICATION_PENDING_IMAGE = "pending_image";
export const NOTIFICATION_CREDITS_UPDATED = "credits_updated";

type MessageListener = (message: string) => void;

export class ApiSocket {
    private client?: WebSocket;
    private accessToken?: string
    // private messageListener?: (message: string) => void;
    private messageListeners: MessageListener[] = [];

    updateToken(accessToken: string) {
        this.accessToken = accessToken;
    }

    // onMessage(listener?: (message: string) => void) {
    //     this.messageListener = listener;
    // }

    addMessageListener(listener: MessageListener) {
        this.messageListeners.push(listener);
    }

    removeMessageListener(listener: MessageListener) {
        this.messageListeners = this.messageListeners.filter(l => l !== listener);
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
        // let host = window.location.host;
        let host = "www.aibrush.art";
        let protocol = "wss";
        // if (host.includes("localhost")) {
        //   host = "localhost:3000";
        //   protocol = "ws";
        // }
        this.client = new WebSocket(`${protocol}://${host}`);
        this.client.onerror = err => console.error(err);
        this.client.onopen = () => {
            console.log("websocket connected");
            this.client!.send(this.accessToken!);
        }
        this.client.onmessage = evt => {
            console.log("server push", evt.data);
            for (const listener of this.messageListeners) {
                listener(evt.data as string);
            }
        }
        this.client.onclose = () => {
          console.log("websocket closed");
          this.client = undefined;
          setTimeout(() => this.connect(), 500);
        }
    }
}
