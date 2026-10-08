"""Mission IDs are M-001, M-002... zero-padded to 3 (§4.3). Unit/disaster IDs follow the same idea."""


class IdCounter:
    def __init__(self, prefix: str, width: int = 3):
        self.prefix = prefix
        self.width = width
        self._n = 0

    def next(self) -> str:
        self._n += 1
        return f"{self.prefix}-{str(self._n).zfill(self.width)}"


mission_ids = IdCounter("M")
disaster_ids = IdCounter("DIS")