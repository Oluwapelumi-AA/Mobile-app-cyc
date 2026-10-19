"""Domain errors raised by services and turned into HTTP responses in main.py.

Each error carries a stable ``code`` for clients and a human ``message``, the
same shape the profile and auth endpoints already return under ``detail``.
"""


class DomainError(Exception):
    status_code = 400

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class InvalidInput(DomainError):
    status_code = 400


class Forbidden(DomainError):
    status_code = 403


class NotFound(DomainError):
    status_code = 404


class Conflict(DomainError):
    status_code = 409


class ServiceUnavailable(DomainError):
    status_code = 503
