
# the error kill switch keeps a cache of errors for a period of time, then forgets them
# if the number of errors exceeds a threshold, it will kill the worker
# Configurable options:
#  error_ttl: how long to keep errors in the cache
#  error_max_count: how many errors to allow before killing the worker

import time
from collections import deque
import os


class ErrorKillSwitch(object):
    def __init__(self, error_ttl=60, error_max_count=10):
        self.error_ttl = error_ttl
        self.error_max_count = error_max_count
        self.errors = deque()
        self.kill_listeners = []

    def on_kill(self, listener):
        self.kill_listeners.append(listener)

    def add_error(self):
        self.errors.append(time.time())
        if self.should_kill():
            print("ErrorKillSwitch: too many errors, killing worker")
            for listener in self.kill_listeners:
                listener()
            os.system('kill %d' % os.getpid())

    def should_kill(self):
        self.errors = deque([e for e in self.errors if time.time() - e < self.error_ttl])
        return len(self.errors) > self.error_max_count

    def __repr__(self):
        return "ErrorKillSwitch(error_ttl=%s, error_max_count=%s)" % (self.error_ttl, self.error_max_count)

if __name__ == "__main__":
    # test
    e = ErrorKillSwitch()
    for i in range(100):
        e.add_error()
        time.sleep(0.1)
    print("completed without being killed")