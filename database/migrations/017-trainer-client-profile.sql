/*
   Phase 4: additive client-profile metadata.

   A Trainer client is still a row in dbo.members. These nullable profile
   fields are an extension of that shared identity, not a second client
   table. Existing Gym member behavior and records are untouched.
*/
IF OBJECT_ID(N'dbo.members', N'U') IS NULL
    THROW 51040, 'members must exist before migration 017.', 1;

IF COL_LENGTH(N'dbo.members', N'primary_goal') IS NULL
    ALTER TABLE dbo.members ADD primary_goal NVARCHAR(200) NULL;

IF COL_LENGTH(N'dbo.members', N'profile_status') IS NULL
    ALTER TABLE dbo.members ADD profile_status VARCHAR(20) NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name=N'CK_members_profile_status'
      AND parent_object_id=OBJECT_ID(N'dbo.members')
)
    EXEC(N'ALTER TABLE dbo.members ADD CONSTRAINT CK_members_profile_status
        CHECK (profile_status IS NULL OR profile_status IN (''active'',''paused'',''archived''));');

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_members_profile_status'
      AND object_id=OBJECT_ID(N'dbo.members')
)
    EXEC(N'CREATE INDEX IX_members_profile_status
        ON dbo.members(profile_status, updated_at DESC, id DESC);');
