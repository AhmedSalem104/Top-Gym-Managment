IF OBJECT_ID(N'dbo.members', N'U') IS NULL
    THROW 51042, 'Members table is required before allowing optional member phones.', 1;

IF COL_LENGTH(N'dbo.members', N'phone') IS NULL
    THROW 51043, 'Members phone column is required before allowing optional member phones.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id=OBJECT_ID(N'dbo.members')
      AND name=N'phone'
      AND is_nullable=0
)
    ALTER TABLE dbo.members ALTER COLUMN phone NVARCHAR(30) NULL;
