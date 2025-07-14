const ACTIONS = {
    JOIN: 'join',
    JOINED: 'joined',
    DISCONNECTED: 'disconnected',
    CODE_CHANGE: 'code-change',
    SYNC_CODE: 'sync-code',
    REQUEST_WRITE_ACCESS: 'request-write-access',
    WRITE_ACCESS_REQUEST: 'write-access-request',
    WRITE_ACCESS_RESPONSE: 'write-access-response',
    WRITE_ACCESS_GRANTED: 'write-access-granted',
    WRITE_ACCESS_DENIED: 'write-access-denied',
    WRITE_ACCESS_REVOKED: 'write-access-revoked',
    WRITE_ACCESS_CHANGED: 'write-access-changed',
    WRITE_ACCESS_CLEARED: 'write-access-cleared',
    NEW_HOST: 'new-host',
    REQUEST_CODE_SYNC: 'request-code-sync',
    REVOKE_WRITE_ACCESS: 'revoke_write_access',
};

module.exports = ACTIONS;