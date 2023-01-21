from queue import Queue, Full
import asyncio
import websockets
import time

import traceback

class ApiSocket:

    def __init__(self, api_url: str, access_token: str, websocket_queue: Queue):
        parts = api_url.split("://")
        protocol = parts[0]
        self.host = parts[1]
        if protocol == "http":
            self.protocol = "ws"
        else:
            self.protocol = "wss"
        self.access_token = access_token
        self.websocket_queue = websocket_queue
        self._kill = False

    def kill(self):
        print("kill called")
        self._kill = True

    async def run(self):
        websocket_url = f"{self.protocol}://{self.host}"
        print(f"api socket connecting to {websocket_url}")
        try:
            async for websocket in websockets.connect(websocket_url):
                start = time.time()
                try:
                    print("authenticating")
                    await websocket.send(self.access_token)
                    print("authenticated")
                    while time.time() - start < 5 * 60:
                        if self._kill:
                            print("killing websocket")
                            return
                        message = None
                        try:
                            message = await asyncio.wait_for(websocket.recv(), timeout=1)
                        except asyncio.TimeoutError:
                            pass
                        if message:
                            print("message received")
                            try:
                                self.websocket_queue.put(message, timeout=0.1)
                            except Full:
                                print("message ignored (queue full)")
                                pass
                except Exception as err:
                    print(f"Error in websocket loop: {err}")
                    traceback.print_exc()
        except Exception as err:
            print(f"Error in websocket connection: {err}")
            traceback.print_exc()
