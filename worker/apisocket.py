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

    async def run(self):
        async for websocket in websockets.connect(f"{self.protocol}://{self.host}"):
            start = time.time()
            try:
                await websocket.send(self.access_token)
                while time.time() - start < 5 * 60:
                    message = None
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1)
                    except asyncio.TimeoutError:
                        pass
                    if message:
                        try:
                            self.websocket_queue.put(message, timeout=0.1)
                        except Full:
                            pass
            except Exception as err:
                print(f"Error in websocket loop: {err}")
                traceback.print_exc()
