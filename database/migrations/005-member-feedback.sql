-- TOP GYM migration 005: member portal feedback.
-- Safe to run repeatedly. The application also runs this idempotently on demand
-- before a portal submission or an Owner feedback-list request.
IF OBJECT_ID(N'dbo.gym_member_feedback', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_member_feedback (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_member_feedback PRIMARY KEY,
        member_id INT NOT NULL,
        rating TINYINT NOT NULL,
        note_type VARCHAR(32) NOT NULL,
        message NVARCHAR(4000) NOT NULL,
        submitted_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_member_feedback_submitted DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_member_feedback_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_member_feedback_rating CHECK (rating BETWEEN 1 AND 5),
        CONSTRAINT CK_gym_member_feedback_note_type CHECK (note_type IN ('general', 'problem', 'complaint', 'suggestion', 'feature_request'))
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_member_feedback_submitted'
      AND object_id = OBJECT_ID(N'dbo.gym_member_feedback')
)
    CREATE INDEX IX_gym_member_feedback_submitted
        ON dbo.gym_member_feedback(submitted_at DESC, id DESC);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_member_feedback_member'
      AND object_id = OBJECT_ID(N'dbo.gym_member_feedback')
)
    CREATE INDEX IX_gym_member_feedback_member
        ON dbo.gym_member_feedback(member_id, submitted_at DESC, id DESC);
