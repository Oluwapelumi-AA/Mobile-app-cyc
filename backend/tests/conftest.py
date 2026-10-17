import os

# Auth needs a signing key, and a fresh checkout has no .env. A SECRET_KEY
# already set in the environment is kept.
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-not-for-production-use")
