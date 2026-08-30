/*
   Logic Fit migration 010: private object-storage metadata.
   Additive and repeatable. Existing SQL-backed branding/payment-proof bytes
   are preserved; new uploads use the configured private object-storage
   provider and leave content NULL. No files are moved by this migration.
*/

IF OBJECT_ID(N'dbo.gym_branding_assets', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.gym_branding_assets', N'storage_key') IS NULL
        ALTER TABLE dbo.gym_branding_assets ADD storage_key NVARCHAR(512) NULL;
    IF COL_LENGTH(N'dbo.gym_branding_assets', N'storage_provider') IS NULL
        ALTER TABLE dbo.gym_branding_assets ADD storage_provider VARCHAR(40) NULL;
    IF COL_LENGTH(N'dbo.gym_branding_assets', N'storage_size_bytes') IS NULL
        ALTER TABLE dbo.gym_branding_assets ADD storage_size_bytes BIGINT NULL;
    IF COL_LENGTH(N'dbo.gym_branding_assets', N'storage_checksum_sha256') IS NULL
        ALTER TABLE dbo.gym_branding_assets ADD storage_checksum_sha256 CHAR(64) NULL;
    IF COL_LENGTH(N'dbo.gym_branding_assets', N'storage_verified_at') IS NULL
        ALTER TABLE dbo.gym_branding_assets ADD storage_verified_at DATETIME2(0) NULL;
    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id=OBJECT_ID(N'dbo.gym_branding_assets')
          AND name=N'content'
          AND is_nullable=0
    )
        EXEC(N'ALTER TABLE dbo.gym_branding_assets ALTER COLUMN content VARBINARY(MAX) NULL;');
END;

IF OBJECT_ID(N'dbo.saas_payment_proofs', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.saas_payment_proofs', N'storage_key') IS NULL
        ALTER TABLE dbo.saas_payment_proofs ADD storage_key NVARCHAR(512) NULL;
    IF COL_LENGTH(N'dbo.saas_payment_proofs', N'storage_provider') IS NULL
        ALTER TABLE dbo.saas_payment_proofs ADD storage_provider VARCHAR(40) NULL;
    IF COL_LENGTH(N'dbo.saas_payment_proofs', N'storage_verified_at') IS NULL
        ALTER TABLE dbo.saas_payment_proofs ADD storage_verified_at DATETIME2(0) NULL;
    IF EXISTS (
        SELECT 1 FROM sys.columns
        WHERE object_id=OBJECT_ID(N'dbo.saas_payment_proofs')
          AND name=N'content'
          AND is_nullable=0
    )
        EXEC(N'ALTER TABLE dbo.saas_payment_proofs ALTER COLUMN content VARBINARY(MAX) NULL;');
END;
