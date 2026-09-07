/*
  Branch sections for server-side operational filtering.

  Sections belong to a Gym branch; they are not tenants and they never widen
  tenant scope. The migration is additive/idempotent. Existing branch data is
  preserved by creating one Mixed section per active branch and attributing
  existing branch-scoped membership/attendance rows to it.
*/

IF OBJECT_ID(N'dbo.gym_branch_sections', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_branch_sections (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_branch_sections PRIMARY KEY,
        tenant_id INT NOT NULL,
        branch_id INT NOT NULL,
        section_code VARCHAR(40) NOT NULL,
        name NVARCHAR(120) NOT NULL,
        section_type VARCHAR(10) NOT NULL CONSTRAINT DF_gym_branch_sections_type DEFAULT ('mixed'),
        is_active BIT NOT NULL CONSTRAINT DF_gym_branch_sections_active DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branch_sections_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branch_sections_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_branch_sections_tenant_code UNIQUE (tenant_id, branch_id, section_code),
        CONSTRAINT FK_gym_branch_sections_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_branch_sections_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_branch_sections_type CHECK (section_type IN ('men', 'women', 'mixed'))
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'UX_gym_branch_sections_tenant_branch_type'
      AND object_id=OBJECT_ID(N'dbo.gym_branch_sections')
)
    CREATE UNIQUE INDEX UX_gym_branch_sections_tenant_branch_type
        ON dbo.gym_branch_sections(tenant_id, branch_id, section_type);

IF COL_LENGTH(N'dbo.gym_attendance', N'section_id') IS NULL
    ALTER TABLE dbo.gym_attendance ADD section_id INT NULL;

IF OBJECT_ID(N'dbo.gym_membership_section_access', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_membership_section_access (
        tenant_id INT NOT NULL,
        membership_id INT NOT NULL,
        section_id INT NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_membership_section_access_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_gym_membership_section_access PRIMARY KEY (membership_id, section_id),
        CONSTRAINT FK_gym_membership_section_access_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_membership_section_access_membership FOREIGN KEY (membership_id) REFERENCES dbo.memberships(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_membership_section_access_section FOREIGN KEY (section_id) REFERENCES dbo.gym_branch_sections(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_membership_section_access_tenant_section'
      AND object_id=OBJECT_ID(N'dbo.gym_membership_section_access')
)
    CREATE INDEX IX_gym_membership_section_access_tenant_section
        ON dbo.gym_membership_section_access(tenant_id, section_id, membership_id);

-- The dependent statements run in a fresh compile scope because section_id is
-- an additive column on a cold schema.
EXEC sys.sp_executesql N'
    MERGE dbo.gym_branch_sections AS target
    USING (
        SELECT b.tenant_id, b.id AS branch_id, ''mixed'' AS section_code,
               N''Mixed'' AS name, ''mixed'' AS section_type
        FROM dbo.gym_branches AS b
        WHERE b.status <> ''archived''
    ) AS source
    ON target.tenant_id=source.tenant_id
       AND target.branch_id=source.branch_id
       AND target.section_type=source.section_type
    WHEN NOT MATCHED THEN
        INSERT (tenant_id,branch_id,section_code,name,section_type)
        VALUES (source.tenant_id,source.branch_id,source.section_code,source.name,source.section_type);

    MERGE dbo.gym_membership_section_access AS target
    USING (
        SELECT DISTINCT mba.tenant_id, mba.membership_id, s.id AS section_id
        FROM dbo.gym_membership_branch_access AS mba
        INNER JOIN dbo.gym_branch_sections AS s
                ON s.tenant_id=mba.tenant_id
               AND s.branch_id=mba.branch_id
               AND s.section_type=''mixed''
               AND s.is_active=1
    ) AS source
    ON target.membership_id=source.membership_id AND target.section_id=source.section_id
    WHEN NOT MATCHED THEN
        INSERT (tenant_id,membership_id,section_id)
        VALUES (source.tenant_id,source.membership_id,source.section_id);

    UPDATE attendance
       SET section_id = sections.id,
           updated_at = SYSUTCDATETIME()
    FROM dbo.gym_attendance AS attendance
    INNER JOIN dbo.gym_branch_sections AS sections
            ON sections.tenant_id=attendance.tenant_id
           AND sections.branch_id=attendance.branch_id
           AND sections.section_type=''mixed''
           AND sections.is_active=1
    WHERE attendance.section_id IS NULL;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name=N''FK_gym_attendance_section''
          AND parent_object_id=OBJECT_ID(N''dbo.gym_attendance'')
    )
        ALTER TABLE dbo.gym_attendance ADD CONSTRAINT FK_gym_attendance_section
            FOREIGN KEY (section_id) REFERENCES dbo.gym_branch_sections(id);

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name=N''IX_gym_attendance_tenant_branch_section_date''
          AND object_id=OBJECT_ID(N''dbo.gym_attendance'')
    )
        CREATE INDEX IX_gym_attendance_tenant_branch_section_date
            ON dbo.gym_attendance(tenant_id, branch_id, section_id, attendance_date DESC, check_in_at DESC, id DESC);
';
