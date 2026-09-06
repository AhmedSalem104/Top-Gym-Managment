/* Phase 15: persistent Trainer Studio action center.

   Tasks are tenant-owned operational reminders. They are intentionally not
   Gym attendance tasks and do not change the shared member identity model.
   Dynamic SQL keeps the cold-schema batch safe on SQL Server.
*/
IF OBJECT_ID(N'dbo.gym_tenants', N'U') IS NULL
   OR OBJECT_ID(N'dbo.members', N'U') IS NULL
    THROW 51380, 'Trainer action center requires tenant and member tables.', 1;

IF OBJECT_ID(N'dbo.gym_trainer_tasks', N'U') IS NULL
BEGIN
    EXEC(N'CREATE TABLE dbo.gym_trainer_tasks (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_trainer_tasks PRIMARY KEY,
        tenant_id INT NOT NULL,
        member_id INT NULL,
        task_type VARCHAR(32) NOT NULL CONSTRAINT DF_gym_trainer_tasks_type DEFAULT (''custom''),
        title NVARCHAR(160) NOT NULL,
        notes NVARCHAR(1000) NULL,
        due_on DATE NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_trainer_tasks_status DEFAULT (''open''),
        created_by_user_id INT NULL,
        completed_at DATETIME2(0) NULL,
        idempotency_key_hash CHAR(64) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_trainer_tasks_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_trainer_tasks_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_trainer_tasks_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_trainer_tasks_member FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_trainer_tasks_type CHECK (task_type IN (''follow_up'',''measurement'',''program'',''payment'',''renewal'',''session'',''custom'')),
        CONSTRAINT CK_gym_trainer_tasks_status CHECK (status IN (''open'',''in_progress'',''completed'',''dismissed'')),
        CONSTRAINT CK_gym_trainer_tasks_completed_at CHECK ((status=''completed'' AND completed_at IS NOT NULL) OR (status<>''completed''))
    );');
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_trainer_tasks_tenant_status_due'
      AND object_id=OBJECT_ID(N'dbo.gym_trainer_tasks')
)
    EXEC(N'CREATE INDEX IX_gym_trainer_tasks_tenant_status_due
        ON dbo.gym_trainer_tasks(tenant_id, status, due_on, updated_at DESC, id DESC);');

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_trainer_tasks_tenant_member'
      AND object_id=OBJECT_ID(N'dbo.gym_trainer_tasks')
)
    EXEC(N'CREATE INDEX IX_gym_trainer_tasks_tenant_member
        ON dbo.gym_trainer_tasks(tenant_id, member_id, status, due_on, id DESC);');

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'UX_gym_trainer_tasks_idempotency'
      AND object_id=OBJECT_ID(N'dbo.gym_trainer_tasks')
)
    EXEC(N'CREATE UNIQUE INDEX UX_gym_trainer_tasks_idempotency
        ON dbo.gym_trainer_tasks(tenant_id, idempotency_key_hash)
        WHERE idempotency_key_hash IS NOT NULL;');
