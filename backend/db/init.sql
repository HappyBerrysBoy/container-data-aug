CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,

    title TEXT NOT NULL,
    description TEXT,

    source_folder_path TEXT NOT NULL,
    target_spec TEXT,

    file_count INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0,
    has_labels BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT projects_title_not_empty_check
        CHECK (length(trim(title)) > 0),

    CONSTRAINT projects_source_folder_path_not_empty_check
        CHECK (length(trim(source_folder_path)) > 0),

    CONSTRAINT projects_file_count_check
        CHECK (file_count >= 0),

    CONSTRAINT projects_total_size_bytes_check
        CHECK (total_size_bytes >= 0)
);

CREATE TABLE IF NOT EXISTS augmentation_tasks (
    id BIGSERIAL PRIMARY KEY,

    project_id BIGINT NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'PENDING',
    progress INTEGER NOT NULL DEFAULT 0,

    worker_count INTEGER NOT NULL DEFAULT 1,
    run_ocr_labeling BOOLEAN NOT NULL DEFAULT false,
    variants_per_image INTEGER NOT NULL DEFAULT 1,

    output_folder_name TEXT NOT NULL,
    output_folder_path TEXT NOT NULL,

    processed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    total_image_count INTEGER NOT NULL DEFAULT 0,
    generated_image_count INTEGER NOT NULL DEFAULT 0,

    resource_usage JSONB,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT augmentation_tasks_status_check
        CHECK (status IN ('PENDING', 'RUNNING', 'STOPPED', 'FAILED', 'DONE')),

    CONSTRAINT augmentation_tasks_progress_check
        CHECK (progress >= 0 AND progress <= 100),

    CONSTRAINT augmentation_tasks_worker_count_check
        CHECK (worker_count >= 1),

    CONSTRAINT augmentation_tasks_variants_per_image_check
        CHECK (variants_per_image >= 1),

    CONSTRAINT augmentation_tasks_output_folder_name_not_empty_check
        CHECK (length(trim(output_folder_name)) > 0),

    CONSTRAINT augmentation_tasks_output_folder_path_not_empty_check
        CHECK (length(trim(output_folder_path)) > 0),

    CONSTRAINT augmentation_tasks_counts_check
        CHECK (
            processed_count >= 0
            AND failed_count >= 0
            AND total_image_count >= 0
            AND generated_image_count >= 0
            AND failed_count <= processed_count
            AND processed_count <= total_image_count
        )
);

CREATE INDEX IF NOT EXISTS idx_projects_created_at
    ON projects(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_augmentation_tasks_project_id_created_at
    ON augmentation_tasks(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_augmentation_tasks_status
    ON augmentation_tasks(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_only_one_active_augmentation_task
    ON augmentation_tasks ((true))
    WHERE status IN ('PENDING', 'RUNNING');