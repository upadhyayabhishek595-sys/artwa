-- =============================================
-- RUNTIME SCHEMA — tables/columns used by code
-- Run after schema.sql on existing databases
-- =============================================

USE whatsapp_omnichannel;

-- ─── Resellers ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resellers (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(100) UNIQUE NOT NULL,
    password        VARCHAR(255) NOT NULL,
    markup_percent  DECIMAL(5,2) DEFAULT 20.00,
    credit_balance  DECIMAL(12,4) DEFAULT 0,
    status          ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    last_login      DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── Client extensions ────────────────────────────────────────────────────────

ALTER TABLE clients
    MODIFY COLUMN status ENUM('active', 'inactive', 'suspended', 'trial', 'invited') DEFAULT 'trial';

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS reseller_id INT NULL AFTER plan_id;

-- ─── Credits ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_credits (
    client_id   INT PRIMARY KEY,
    balance     DECIMAL(12,4) DEFAULT 0,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS credit_transactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    client_id   INT NOT NULL,
    type        ENUM('topup', 'deduction', 'refund', 'transfer') NOT NULL,
    amount      DECIMAL(12,4) NOT NULL,
    description VARCHAR(500),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_credit_tx_client (client_id, created_at)
);

-- ─── Broadcasts (runtime naming) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS broadcasts (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    client_id           INT NOT NULL,
    phone_number_id     INT NOT NULL,
    template_id         INT,
    name                VARCHAR(150) NOT NULL,
    status              ENUM('draft', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled') DEFAULT 'draft',
    total_contacts      INT DEFAULT 0,
    sent_count          INT DEFAULT 0,
    delivered_count     INT DEFAULT 0,
    read_count          INT DEFAULT 0,
    failed_count        INT DEFAULT 0,
    scheduled_at        DATETIME,
    started_at          DATETIME,
    completed_at        DATETIME,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (phone_number_id) REFERENCES phone_numbers(id),
    FOREIGN KEY (template_id) REFERENCES templates(id)
);

CREATE TABLE IF NOT EXISTS broadcast_contacts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    broadcast_id    INT NOT NULL,
    contact_id      INT NOT NULL,
    wamid           VARCHAR(255),
    status          ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
    error_message   TEXT,
    sent_at         DATETIME,
    retry_count     INT DEFAULT 0,
    FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    UNIQUE KEY unique_broadcast_contact (broadcast_id, contact_id),
    INDEX idx_bc_wamid (wamid)
);

-- ─── Flow builder (flat JSON model used by webhook.js) ────────────────────────

CREATE TABLE IF NOT EXISTS flows (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    client_id   INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    `trigger`   JSON NOT NULL,
    steps       JSON NOT NULL,
    priority    INT DEFAULT 0,
    active      TINYINT(1) DEFAULT 1,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_flows_client (client_id, active, priority)
);

-- ─── Auth tokens ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    token       VARCHAR(512) NOT NULL UNIQUE,
    user_id     INT NOT NULL,
    user_type   ENUM('admin', 'client', 'agent', 'reseller') NOT NULL,
    expires_at  DATETIME NOT NULL,
    revoked     TINYINT(1) DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_refresh_user (user_id, user_type)
);

-- ─── Audit & compliance ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    actor_id    INT NOT NULL,
    actor_type  ENUM('admin', 'reseller') NOT NULL,
    action      VARCHAR(100) NOT NULL,
    target      VARCHAR(255),
    payload     JSON,
    ip          VARCHAR(45),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_actor (actor_id, actor_type)
);

CREATE TABLE IF NOT EXISTS opt_out_log (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    client_id   INT NOT NULL,
    contact_id  INT NOT NULL,
    phone       VARCHAR(20) NOT NULL,
    keyword     VARCHAR(50),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS webhook_events (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    event_id        VARCHAR(255) NOT NULL,
    event_type      VARCHAR(50) NOT NULL,
    payload_hash    VARCHAR(64),
    processed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_event (event_id)
);

-- ─── Media library ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS media_files (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    client_id       INT NOT NULL,
    phone_number_id INT,
    meta_media_id   VARCHAR(255),
    filename        VARCHAR(255),
    mime_type       VARCHAR(100),
    file_size       INT,
    storage_path    VARCHAR(500),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    INDEX idx_media_client (client_id)
);

-- ─── Message idempotency ───────────────────────────────────────────────────────

ALTER TABLE messages ADD UNIQUE INDEX IF NOT EXISTS idx_messages_wamid_unique (wamid);

-- ─── Template runtime columns ─────────────────────────────────────────────────

ALTER TABLE templates
    ADD COLUMN IF NOT EXISTS components JSON AFTER footer;

ALTER TABLE templates
    ADD COLUMN IF NOT EXISTS last_synced_at DATETIME NULL AFTER meta_template_id;

ALTER TABLE templates
    MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'paused', 'pending_meta', 'disabled') DEFAULT 'pending';

-- ─── Phone number runtime columns ─────────────────────────────────────────────

ALTER TABLE phone_numbers
    ADD COLUMN IF NOT EXISTS messaging_limit_tier VARCHAR(20) NULL AFTER messaging_limit;
