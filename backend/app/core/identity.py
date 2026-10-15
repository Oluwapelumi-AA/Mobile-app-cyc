"""Integration boundary between the profile domain and the auth workstream.

The shared ``User`` model is owned by the authentication workstream. Until the
shared identity contract is agreed, profile code refers to users only through
``UserId``. If the agreed primary key type differs, change it here only.
"""

import uuid

# Proposed, not yet agreed: UUID primary key on the shared User record.
UserId = uuid.UUID
