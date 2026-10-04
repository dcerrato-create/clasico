"""errors.py - one small error class shared by the whole backend."""


class ApiError(Exception):
    """Raise this anywhere to send {"error": message} with a status code."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status
