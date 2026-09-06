/* Phase 14: Trainer Studio V2 goals and templates.

   These are additive tenant-owned records. They deliberately do not alter
   shared Gym membership semantics or create a second member identity model.
   Dependent indexes are created through dynamic SQL so a cold SQL Server
   batch never binds a newly-created object in the same compile scope.
*/
IF OBJECT_ID(N'dbo.gym_tenants', N'U') IS NULL
   OR OBJECT_ID(N'dbo.members', N'U') IS NULL
   OR OBJECT_ID(N'dbo.workout_programs', N'U') IS NULL
   OR OBJECT_ID(N'dbo.diet_plans', N'U') IS NULL
    THROW 51370, 'Trainer Studio V2 requires tenant, member and coaching tables.', 1;

IF OBJECT_ID(N'dbo.gym_trainer_goals', N'U') IS NULL
BEGIN
    EXEC(N'CREATE TABLE dbo.gym_trainer_goals (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_trainer_goals PRIMARY KEY,
        tenant_id INT NOT NULL,
        member_id INT NOT NULL,
        goal_type VARCHAR(32) NOT NULL,
        title NVARCHAR(160) NOT NULL,
        unit VARCHAR(24) NULL,
        start_value DECIMAL(12,3) NULL,
        target_value DECIMAL(12,3) NULL,
        current_value DECIMAL(12,3) NULL,
        starts_on DATE NOT NULL CONSTRAINT DF_gym_trainer_goals_starts_on DEFAULT (CONVERT(date,SYSUTCDATETIME())),
        deadline DATE NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_trainer_goals_status DEFAULT (''active''),
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_trainer_goals_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_trainer_goals_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_trainer_goals_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_trainer_goals_member FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_trainer_goals_type CHECK (goal_type IN (''weight_loss'',''muscle_gain'',''strength'',''fitness'',''performance'',''custom'')),
        CONSTRAINT CK_gym_trainer_goals_dates CHECK (deadline IS NULL OR deadline >= starts_on),
        CONSTRAINT CK_gym_trainer_goals_status CHECK (status IN (''active'',''completed'',''paused'',''archived''))
    );');
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_trainer_goals_tenant_member_status'
      AND object_id=OBJECT_ID(N'dbo.gym_trainer_goals')
)
    EXEC(N'CREATE INDEX IX_gym_trainer_goals_tenant_member_status
        ON dbo.gym_trainer_goals(tenant_id, member_id, status, deadline, id DESC);');

IF OBJECT_ID(N'dbo.gym_trainer_templates', N'U') IS NULL
BEGIN
    EXEC(N'CREATE TABLE dbo.gym_trainer_templates (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_trainer_templates PRIMARY KEY,
        tenant_id INT NOT NULL,
        template_type VARCHAR(24) NOT NULL,
        name NVARCHAR(160) NOT NULL,
        description NVARCHAR(1000) NULL,
        payload_json NVARCHAR(MAX) NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_trainer_templates_status DEFAULT (''active''),
        idempotency_key_hash CHAR(64) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_trainer_templates_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_trainer_templates_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_trainer_templates_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_trainer_templates_type CHECK (template_type IN (''training'',''nutrition'',''assessment'',''checkin'',''package'')),
        CONSTRAINT CK_gym_trainer_templates_status CHECK (status IN (''active'',''archived'')),
        CONSTRAINT CK_gym_trainer_templates_json CHECK (ISJSON(payload_json)=1)
    );');
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_trainer_templates_tenant_type_status'
      AND object_id=OBJECT_ID(N'dbo.gym_trainer_templates')
)
    EXEC(N'CREATE INDEX IX_gym_trainer_templates_tenant_type_status
        ON dbo.gym_trainer_templates(tenant_id, template_type, status, updated_at DESC, id DESC);');

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'UX_gym_trainer_templates_idempotency'
      AND object_id=OBJECT_ID(N'dbo.gym_trainer_templates')
)
    EXEC(N'CREATE UNIQUE INDEX UX_gym_trainer_templates_idempotency
        ON dbo.gym_trainer_templates(tenant_id, idempotency_key_hash)
        WHERE idempotency_key_hash IS NOT NULL;');
