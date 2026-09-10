'use strict';

// Interactive recovery utility. It deliberately has no HTTP surface and
// refuses to run without a real TTY so a password cannot arrive through an
// argument, pipe, environment variable, or CI log.
const readline = require('node:readline');

if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    process.stderr.write('Interactive TTY required.\n');
    process.exitCode = 2;
} else {
    const authService = require('../src/services/auth-service');
    const { closePool, sql } = require('../src/database/pool');
    const { withTransaction } = require('../src/database/transaction');
    const sessionRepository = require('../src/repositories/session.repository');
    const { runTenantContext } = require('../src/tenancy/tenant-context');

    const TARGETS = Object.freeze({
        '1': Object.freeze({ label: 'Gym Owner', role: 'Owner' }),
        '2': Object.freeze({ label: 'Platform Admin', role: 'PlatformAdmin' }),
        '3': Object.freeze({ label: 'Assistant / Team', role: 'Assistant' })
    });

    function promptVisible(prompt) {
        return new Promise((resolve) => {
            const input = readline.createInterface({ input: process.stdin, output: process.stdout });
            input.question(prompt, (answer) => {
                input.close();
                resolve(String(answer || '').trim());
            });
        });
    }

    function promptHidden(prompt) {
        const stdin = process.stdin;
        const stdout = process.stdout;
        return new Promise((resolve, reject) => {
            let value = '';
            const wasRaw = Boolean(stdin.isRaw);
            const finish = (error, result = '') => {
                stdin.removeListener('data', onData);
                try {
                    stdin.setRawMode(wasRaw);
                } catch (_) {
                    // The original error/result is more useful than cleanup noise.
                }
                stdout.write('\n');
                if (error) reject(error);
                else resolve(result);
            };
            const onData = (chunk) => {
                for (const character of String(chunk)) {
                    if (character === '\u0003' || character === '\u0004') {
                        finish(new Error('cancelled'));
                        return;
                    }
                    if (character === '\r' || character === '\n') {
                        finish(null, value);
                        return;
                    }
                    if (character === '\u007f' || character === '\b') {
                        value = value.slice(0, -1);
                        continue;
                    }
                    value += character;
                }
            };
            stdout.write(prompt);
            stdin.setRawMode(true);
            stdin.resume();
            stdin.setEncoding('utf8');
            stdin.on('data', onData);
        });
    }

    function normalizeIdentity(value) {
        return String(value || '').trim().toLowerCase();
    }

    async function findAccount(executor, identity) {
        const result = await executor.request()
            .input('identity', sql.NVarChar(254), normalizeIdentity(identity))
            .query(`SELECT TOP (2) id, role, status
                    FROM dbo.gym_users
                    WHERE email_normalized=@identity
                       OR LOWER(LTRIM(RTRIM(COALESCE(username, ''))))=@identity;`);
        if (result.recordset.length !== 1) return null;
        return result.recordset[0];
    }

    async function loadInvariantState(executor, userId) {
        const userResult = await executor.request()
            .input('userId', sql.Int, userId)
            .query(`SELECT TOP (1) id, role, status
                    FROM dbo.gym_users
                    WHERE id=@userId;`);
        const tenantResult = await executor.request()
            .input('userId', sql.Int, userId)
            .query(`SELECT tenant_id, role, status, is_primary
                    FROM dbo.gym_user_tenants
                    WHERE user_id=@userId
                    ORDER BY tenant_id;`);
        const permissionResult = await executor.request()
            .input('userId', sql.Int, userId)
            .query(`SELECT permission_code, is_granted
                    FROM dbo.gym_user_permissions
                    WHERE user_id=@userId
                    ORDER BY permission_code;`);
        const user = userResult.recordset[0];
        if (!user) return null;
        return {
            id: Number(user.id),
            role: String(user.role || ''),
            status: String(user.status || ''),
            tenantMemberships: tenantResult.recordset.map((row) => ({
                tenantId: Number(row.tenant_id),
                role: String(row.role || ''),
                status: String(row.status || ''),
                isPrimary: Boolean(row.is_primary)
            })),
            permissions: permissionResult.recordset.map((row) => ({
                code: String(row.permission_code || ''),
                granted: Boolean(row.is_granted)
            }))
        };
    }

    function sameInvariants(before, after) {
        return JSON.stringify(before) === JSON.stringify(after);
    }

    function assertTargetAccount(state, target) {
        if (!state || state.role !== target.role || state.status !== 'Active') {
            throw new Error('ACCOUNT_NOT_ACTIVE_OR_ROLE_MISMATCH');
        }
        if (target.role !== 'PlatformAdmin') {
            const activeMembership = state.tenantMemberships.some((item) =>
                item.status.toLowerCase() === 'active' && item.role === target.role
            );
            if (!activeMembership) throw new Error('ACTIVE_TENANT_MEMBERSHIP_REQUIRED');
        }
    }

    async function activeSessionCount(executor, userId) {
        const result = await executor.request()
            .input('userId', sql.Int, userId)
            .query(`SELECT COUNT_BIG(*) AS total
                    FROM dbo.gym_auth_sessions
                    WHERE user_id=@userId
                      AND revoked_at IS NULL
                      AND expires_at > SYSUTCDATETIME();`);
        return Number(result.recordset[0]?.total || 0);
    }

    async function resetAccount(target, identity, newPassword) {
        const passwordHash = await authService.hashPassword(newPassword);
        if (!(await authService.verifyPassword(newPassword, passwordHash))) {
            throw new Error('PASSWORD_HASH_VERIFICATION_FAILED');
        }

        return runTenantContext({ mode: 'platform', tenantId: null }, () => withTransaction(async (transaction) => {
            const account = await findAccount(transaction, identity);
            if (!account || String(account.role) !== target.role || String(account.status) !== 'Active') {
                throw new Error('ACCOUNT_NOT_ACTIVE_OR_ROLE_MISMATCH');
            }

            const before = await loadInvariantState(transaction, Number(account.id));
            assertTargetAccount(before, target);

            const updateResult = await transaction.request()
                .input('userId', sql.Int, Number(account.id))
                .input('role', sql.VarChar(20), target.role)
                .input('passwordHash', sql.NVarChar(512), passwordHash)
                .query(`UPDATE dbo.gym_users
                        SET password_hash=@passwordHash,
                            must_change_password=0,
                            password_changed_at=SYSUTCDATETIME(),
                            updated_at=SYSUTCDATETIME()
                        WHERE id=@userId AND role=@role AND status='Active';`);
            if (Number(updateResult.rowsAffected?.[0] || 0) !== 1) {
                throw new Error('PASSWORD_UPDATE_NOT_APPLIED');
            }

            await sessionRepository.revokeForUser(Number(account.id), transaction);
            if (await activeSessionCount(transaction, Number(account.id)) !== 0) {
                throw new Error('SESSION_INVALIDATION_NOT_CONFIRMED');
            }

            const after = await loadInvariantState(transaction, Number(account.id));
            if (!sameInvariants(before, after)) throw new Error('ACCOUNT_INVARIANT_CHANGED');

            return true;
        }));
    }

    async function main() {
        process.stdout.write('Select the existing account to reset (choose one, then repeat for another):\n');
        process.stdout.write('1) Gym Owner\n2) Platform Admin\n3) Assistant / Team\n0) Exit\n');
        const choice = await promptVisible('Choice: ');
        if (choice === '0') return;
        const target = TARGETS[choice];
        if (!target) throw new Error('INVALID_ACCOUNT_SELECTION');

        const identity = await promptVisible('Login email/username (visible input; not a secret): ');
        if (!normalizeIdentity(identity)) throw new Error('ACCOUNT_IDENTIFIER_REQUIRED');

        let newPassword = null;
        let confirmation = null;
        try {
            newPassword = await promptHidden('New password: ');
            confirmation = await promptHidden('Confirm password: ');
            const validated = authService.validatePassword(newPassword, { field: 'newPassword' });
            if (validated !== confirmation) throw new Error('PASSWORD_CONFIRMATION_MISMATCH');
            await resetAccount(target, identity, validated);
        } finally {
            newPassword = null;
            confirmation = null;
        }

        process.stdout.write('Password reset completed for the existing account; sessions were invalidated.\n');
        process.stdout.write('Run the command again for another account, or choose 0 to exit.\n');
    }

    main()
        .catch(() => {
            process.stderr.write('Password reset was not completed; no change was committed.\n');
            process.exitCode = 1;
        })
        .finally(async () => {
            await closePool().catch(() => {});
        });
}
