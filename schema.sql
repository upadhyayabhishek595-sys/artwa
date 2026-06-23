-- =============================================
-- WHATSAPP OMNICHANNEL PLATFORM
-- Complete Database Schema
-- =============================================

CREATE DATABASE IF NOT EXISTS whatsapp_omnichannel;
USE whatsapp_omnichannel;

-- =============================================
-- 1. ADMIN MANAGEMENT
-- =============================================

-- Platform Admins (You)
CREATE TABLE admins (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(100) UNIQUE NOT NULL,
    password        VARCHAR(255) NOT NULL,
    role            ENUM('superadmin', 'admin', 'support') DEFAULT 'admin',
    status          ENUM('active', 'inactive') DEFAULT 'active',
    last_login      DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =============================================
-- 2. PLANS & BILLING
-- =============================================

-- Subscription Plans
CREATE TABLE plans (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,           -- Starter, Business, Enterprise
    description         TEXT,
    price               DECIMAL(10,2) NOT NULL,          -- Monthly price in INR
    message_limit       INT DEFAULT 1000,                -- Messages per month
    contact_limit       INT DEFAULT 500,                 -- Max contacts
    agent_limit         INT DEFAULT 2,                   -- Max agents per client
    api_access          TINYINT(1) DEFAULT 0,            -- API access yes/no
    webhook_access      TINYINT(1) DEFAULT 0,            -- Custom webhook yes/no
    chatbot_access      TINYINT(1) DEFAULT 0,            -- Chatbot builder yes/no
    broadcast_access    TINYINT(1) DEFAULT 0,            -- Broadcast campaigns yes/no
    template_limit      INT DEFAULT 5,                   -- Max templates
    phone_number_limit  INT DEFAULT 1,                   -- Max phone numbers
    support_level       ENUM('basic', 'priority', 'dedicated') DEFAULT 'basic',
    status              ENUM('active', 'inactive') DEFAULT 'active',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Plans
INSERT INTO plans (name, description, price, message_limit, contact_limit, agent_limit, api_access, webhook_access, chatbot_access, broadcast_access, template_limit, phone_number_limit, support_level) VALUES
('Starter',    'Basic WhatsApp inbox for small businesses',     999.00,  1000,  500,   2,  0, 0, 0, 0, 5,  1, 'basic'),
('Business',   'Full omnichannel with API access',             2999.00,  10000, 2000,  5,  1, 1, 1, 1, 20, 2, 'priority'),
('Enterprise', 'Unlimited platform with dedicated support',    9999.00,  0,     0,     20, 1, 1, 1, 1, 0,  5, 'dedicated');

-- =============================================
-- 3. CLIENT MANAGEMENT
-- =============================================

-- Clients (Your Customers)
CREATE TABLE clients (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    business_name       VARCHAR(150),
    email               VARCHAR(100) UNIQUE NOT NULL,
    password            VARCHAR(255) NOT NULL,
    phone               VARCHAR(20),
    address             TEXT,
    city                VARCHAR(100),
    state               VARCHAR(100),
    country             VARCHAR(100) DEFAULT 'India',
    gst_number          VARCHAR(20),
    plan_id             INT,
    status              ENUM('active', 'inactive', 'suspended', 'trial') DEFAULT 'trial',
    trial_ends_at       DATETIME,
    email_verified      TINYINT(1) DEFAULT 0,
    email_verify_token  VARCHAR(255),
    reset_token         VARCHAR(255),
    reset_token_expiry  DATETIME,
    last_login          DATETIME,
    created_by          INT,                             -- Admin who created
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id),
    FOREIGN KEY (created_by) REFERENCES admins(id)
);

-- Client Subscriptions
CREATE TABLE subscriptions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    client_id       INT NOT NULL,
    plan_id         INT NOT NULL,
    start_date      DATETIME NOT NULL,
    end_date        DATETIME NOT NULL,
    amount_paid     DECIMAL(10,2),
    payment_status  ENUM('paid', 'pending', 'failed') DEFAULT 'pending',
    status          ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- Invoices
CREATE TABLE invoices (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    client_id       INT NOT NULL,
    subscription_id INT,
    invoice_number  VARCHAR(50) UNIQUE NOT NULL,
    amount          DECIMAL(10,2) NOT NULL,
    tax             DECIMAL(10,2) DEFAULT 0,
    total           DECIMAL(10,2) NOT NULL,
    due_date        DATETIME,
    paid_at         DATETIME,
    status          ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
    payment_method  VARCHAR(50),
    transaction_id  VARCHAR(100),
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

-- =============================================
-- 4. WHATSAPP PHONE NUMBERS
-- =============================================

-- Phone Numbers (Assigned to Clients)
CREATE TABLE phone_numbers (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    client_id               INT NOT NULL,
    display_name            VARCHAR(100),                -- Business display name on WhatsApp
    phone_number            VARCHAR(20) NOT NULL,        -- Actual phone number
    phone_number_id         VARCHAR(100) NOT NULL,       -- Meta Phone Number ID
    waba_id                 VARCHAR(100) NOT NULL,       -- WhatsApp Business Account ID
    access_token            TEXT,                        -- Permanent access token
    quality_rating          ENUM('green', 'yellow', 'red') DEFAULT 'green',
    messaging_limit         ENUM('1K', '10K', '100K', 'unlimited') DEFAULT '1K',
    verified_name           VARCHAR(100),
    certificate             TEXT,
    status                  ENUM('active', 'inactive', 'banned', 'pending') DEFAULT 'pending',
    is_default              TINYINT(1) DEFAULT 0,
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- =============================================
-- 5. AGENTS (Client's Team Members)
-- =============================================

-- Agents
CREATE TABLE agents (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    client_id       INT NOT NULL,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(100) NOT NULL,
    password        VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    avatar          VARCHAR(255),
    role            ENUM('admin', 'agent', 'supervisor') DEFAULT 'agent',
    status          ENUM('active', 'inactive', 'online', 'offline', 'busy') DEFAULT 'offline',
    max_chats       INT DEFAULT 5,                       -- Max simultaneous chats
    last_login      DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    UNIQUE KEY unique_agent_email (client_id, email)
);

-- =============================================
-- 6. CONTACTS
-- =============================================

-- Contacts (Customer's Customers)
CREATE TABLE contacts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    client_id       INT NOT NULL,
    phone           VARCHAR(20) NOT NULL,
    name            VARCHAR(100),
    email           VARCHAR(100),
    avatar          VARCHAR(255),
    city            VARCHAR(100),
    country         VARCHAR(100),
    language        VARCHAR(10) DEFAULT 'en',
    tags            JSON,                                -- ["vip", "lead", "customer"]
    custom_fields   JSON,                                -- Extra fields per client
    opted_in        TINYINT(1) DEFAULT 1,               -- WhatsApp opt-in status
    opted_out_at    DATETIME,
    is_blocked      TINYINT(1) DEFAULT 0,
    notes           TEXT,
    source          VARCHAR(50),                         -- How they came in
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    UNIQUE KEY unique_contact (client_id, phone)
);

-- Contact Groups
CREATE TABLE contact_groups (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    client_id   INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    color       VARCHAR(10),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Contact Group Members
CREATE TABLE contact_group_members (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    group_id    INT NOT NULL,
    contact_id  INT NOT NULL,
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES contact_groups(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    UNIQUE KEY unique_member (group_id, contact_id)
);

-- =============================================
-- 7. CONVERSATIONS & MESSAGES
-- =============================================

-- Conversations
CREATE TABLE conversations (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    client_id           INT NOT NULL,
    contact_id          INT NOT NULL,
    phone_number_id     INT NOT NULL,
    agent_id            INT,
    status              ENUM('open', 'resolved', 'pending', 'bot') DEFAULT 'open',
    channel             VARCHAR(20) DEFAULT 'whatsapp',
    last_message        TEXT,
    last_message_at     DATETIME,
    unread_count        INT DEFAULT 0,
    assigned_at         DATETIME,
    resolved_at         DATETIME,
    first_response_at   DATETIME,
    labels              JSON,                            -- ["urgent", "sales", "support"]
    notes               TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (phone_number_id) REFERENCES phone_numbers(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Messages
CREATE TABLE messages (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id     INT NOT NULL,
    client_id           INT NOT NULL,
    wamid               VARCHAR(255),                    -- Meta Message ID
    direction           ENUM('inbound', 'outbound') NOT NULL,
    type                ENUM('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'sticker', 'template', 'interactive', 'reaction', 'button') DEFAULT 'text',
    body                TEXT,
    media_url           VARCHAR(500),
    media_id            VARCHAR(255),
    media_mime_type     VARCHAR(100),
    media_filename      VARCHAR(255),
    media_size          INT,
    caption             TEXT,
    location_lat        DECIMAL(10,8),
    location_lng        DECIMAL(11,8),
    location_name       VARCHAR(255),
    template_name       VARCHAR(100),
    template_data       JSON,
    interactive_data    JSON,
    status              ENUM('sending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'sending',
    error_code          VARCHAR(50),
    error_message       TEXT,
    sent_by_agent_id    INT,
    sent_by_api         TINYINT(1) DEFAULT 0,
    sent_by_bot         TINYINT(1) DEFAULT 0,
    timestamp           DATETIME,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (sent_by_agent_id) REFERENCES agents(id)
);

-- Message Status Updates (from Meta Webhooks)
CREATE TABLE message_status_updates (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    wamid           VARCHAR(255) NOT NULL,
    status          ENUM('sent', 'delivered', 'read', 'failed') NOT NULL,
    timestamp       DATETIME,
    error_code      VARCHAR(50),
    error_message   TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 8. MESSAGE TEMPLATES
-- =============================================

-- Templates
CREATE TABLE templates (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    client_id           INT NOT NULL,
    phone_number_id     INT NOT NULL,
    name                VARCHAR(100) NOT NULL,
    category            ENUM('marketing', 'utility', 'authentication') NOT NULL,
    language            VARCHAR(10) DEFAULT 'en',
    status              ENUM('pending', 'approved', 'rejected', 'paused') DEFAULT 'pending',
    header_type         ENUM('text', 'image', 'video', 'document', 'location'),
    header_content      TEXT,
    body                TEXT NOT NULL,
    footer              TEXT,
    buttons             JSON,                            -- CTA/Quick reply buttons
    variables           JSON,                            -- Template variables
    meta_template_id    VARCHAR(100),                   -- Meta's template ID
    rejection_reason    TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (phone_number_id) REFERENCES phone_numbers(id)
);

-- =============================================
-- 9. BROADCAST CAMPAIGNS
-- =============================================

-- Campaigns
CREATE TABLE campaigns (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    client_id           INT NOT NULL,
    phone_number_id     INT NOT NULL,
    name                VARCHAR(150) NOT NULL,
    description         TEXT,
    type                ENUM('template', 'text', 'media') DEFAULT 'template',
    template_id         INT,
    message_body        TEXT,
    media_url           VARCHAR(500),
    target_type         ENUM('all', 'group', 'custom') DEFAULT 'all',
    group_id            INT,
    scheduled_at        DATETIME,
    started_at          DATETIME,
    completed_at        DATETIME,
    status              ENUM('draft', 'scheduled', 'running', 'completed', 'paused', 'cancelled', 'failed') DEFAULT 'draft',
    total_contacts      INT DEFAULT 0,
    sent_count          INT DEFAULT 0,
    delivered_count     INT DEFAULT 0,
    read_count          INT DEFAULT 0,
    failed_count        INT DEFAULT 0,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (phone_number_id) REFERENCES phone_numbers(id),
    FOREIGN KEY (template_id) REFERENCES templates(id),
    FOREIGN KEY (group_id) REFERENCES contact_groups(id)
);

-- Campaign Recipients
CREATE TABLE campaign_recipients (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    campaign_id     INT NOT NULL,
    contact_id      INT NOT NULL,
    wamid           VARCHAR(255),
    status          ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
    error_message   TEXT,
    sent_at         DATETIME,
    delivered_at    DATETIME,
    read_at         DATETIME,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

-- =============================================
-- 10. CHATBOT
-- =============================================

-- Chatbot Flows
CREATE TABLE chatbot_flows (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    client_id   INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    `trigger`   VARCHAR(100),                            -- Keyword or event that triggers this flow
    is_default  TINYINT(1) DEFAULT 0,                  -- Default flow for all messages
    status      ENUM('active', 'inactive') DEFAULT 'active',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Chatbot Nodes (Steps in a flow)
CREATE TABLE chatbot_nodes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    flow_id         INT NOT NULL,
    parent_id       INT,                                 -- Previous node
    type            ENUM('message', 'question', 'condition', 'action', 'end') DEFAULT 'message',
    message         TEXT,
    message_type    ENUM('text', 'image', 'video', 'document', 'template', 'interactive') DEFAULT 'text',
    options         JSON,                                -- Reply options/buttons
    conditions      JSON,                                -- Conditions to check
    actions         JSON,                                -- Actions to perform
    next_node_id    INT,
    position_x      INT,
    position_y      INT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (flow_id) REFERENCES chatbot_flows(id)
);

-- =============================================
-- 11. API PLATFORM
-- =============================================

-- API Keys (For Clients)
CREATE TABLE api_keys (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    client_id       INT NOT NULL,
    name            VARCHAR(100),                        -- Key label e.g. "Production", "Testing"
    api_key         VARCHAR(64) UNIQUE NOT NULL,         -- The actual API key
    api_secret      VARCHAR(64),                         -- Optional secret
    permissions     JSON,                                -- ["send_message", "get_contacts", ...]
    ip_whitelist    JSON,                                -- Allowed IPs
    rate_limit      INT DEFAULT 100,                     -- Requests per minute
    status          ENUM('active', 'inactive', 'revoked') DEFAULT 'active',
    last_used_at    DATETIME,
    expires_at      DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- API Logs
CREATE TABLE api_logs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    client_id       INT NOT NULL,
    api_key_id      INT,
    method          VARCHAR(10),                         -- GET, POST, PUT, DELETE
    endpoint        VARCHAR(255),
    request_body    JSON,
    response_code   INT,
    response_body   JSON,
    ip_address      VARCHAR(50),
    duration_ms     INT,                                 -- Response time in ms
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- API Usage Tracking
CREATE TABLE api_usage (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    client_id       INT NOT NULL,
    year            INT NOT NULL,
    month           INT NOT NULL,
    message_count   INT DEFAULT 0,
    api_calls       INT DEFAULT 0,
    broadcast_count INT DEFAULT 0,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    UNIQUE KEY unique_usage (client_id, year, month)
);

-- Client Webhooks (Client's own webhook to receive events)
CREATE TABLE client_webhooks (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    client_id       INT NOT NULL,
    name            VARCHAR(100),
    url             VARCHAR(500) NOT NULL,
    secret          VARCHAR(100),                        -- To verify webhook signature
    events          JSON,                                -- Events to subscribe to
    status          ENUM('active', 'inactive') DEFAULT 'active',
    last_triggered  DATETIME,
    failure_count   INT DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Webhook Delivery Logs
CREATE TABLE webhook_logs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    webhook_id      INT NOT NULL,
    event           VARCHAR(100),
    payload         JSON,
    response_code   INT,
    response_body   TEXT,
    attempts        INT DEFAULT 1,
    status          ENUM('success', 'failed', 'pending') DEFAULT 'pending',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES client_webhooks(id)
);

-- =============================================
-- 12. NOTIFICATIONS & ALERTS
-- =============================================

-- Notifications
CREATE TABLE notifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_type   ENUM('admin', 'client', 'agent') NOT NULL,
    user_id     INT NOT NULL,
    title       VARCHAR(255),
    body        TEXT,
    type        VARCHAR(50),                             -- new_message, campaign_done, etc.
    data        JSON,
    is_read     TINYINT(1) DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- 13. SETTINGS
-- =============================================

-- Client Settings
CREATE TABLE client_settings (
    id                          INT AUTO_INCREMENT PRIMARY KEY,
    client_id                   INT UNIQUE NOT NULL,
    business_hours_enabled      TINYINT(1) DEFAULT 0,
    business_hours              JSON,                    -- Hours per day
    timezone                    VARCHAR(50) DEFAULT 'Asia/Kolkata',
    auto_reply_enabled          TINYINT(1) DEFAULT 0,
    auto_reply_message          TEXT,
    away_message_enabled        TINYINT(1) DEFAULT 0,
    away_message                TEXT,
    assignment_mode             ENUM('manual', 'auto', 'round_robin') DEFAULT 'manual',
    email_notifications         TINYINT(1) DEFAULT 1,
    language                    VARCHAR(10) DEFAULT 'en',
    updated_at                  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Platform Settings (Admin)
CREATE TABLE platform_settings (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    key_name    VARCHAR(100) UNIQUE NOT NULL,
    value       TEXT,
    description TEXT,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert Default Platform Settings
INSERT INTO platform_settings (key_name, value, description) VALUES
('platform_name',       'WhatsApp Omnichannel',  'Platform display name'),
('platform_url',        'https://yourplatform.com', 'Platform URL'),
('support_email',       'support@yourplatform.com', 'Support email'),
('trial_days',          '14',                    'Free trial days'),
('meta_api_version',    'v25.0',                 'Meta API version'),
('max_retry_attempts',  '3',                     'Webhook retry attempts'),
('rate_limit_per_min',  '100',                   'Default API rate limit');

-- =============================================
-- 14. ACTIVITY LOGS
-- =============================================

-- Activity Logs (Audit Trail)
CREATE TABLE activity_logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_type   ENUM('admin', 'client', 'agent') NOT NULL,
    user_id     INT NOT NULL,
    action      VARCHAR(100) NOT NULL,
    description TEXT,
    ip_address  VARCHAR(50),
    user_agent  TEXT,
    data        JSON,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Messages indexes
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_wamid ON messages(wamid);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_messages_direction ON messages(direction);

-- Conversations indexes
CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_agent ON conversations(agent_id);
CREATE INDEX idx_conversations_status ON conversations(status);

-- Contacts indexes
CREATE INDEX idx_contacts_client ON contacts(client_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);

-- API logs indexes
CREATE INDEX idx_api_logs_client ON api_logs(client_id);
CREATE INDEX idx_api_logs_created ON api_logs(created_at);

-- Campaign recipients indexes
CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_status ON campaign_recipients(status);

-- Activity logs indexes
CREATE INDEX idx_activity_logs_user ON activity_logs(user_type, user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);

-- =============================================
-- 15. RUNTIME TABLES (used by application code)
-- Run migrations/001_runtime_schema.sql on existing DBs
-- =============================================

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

ALTER TABLE clients
    MODIFY COLUMN status ENUM('active', 'inactive', 'suspended', 'trial', 'invited') DEFAULT 'trial';

ALTER TABLE clients ADD COLUMN reseller_id INT NULL AFTER plan_id;

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
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

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
    UNIQUE KEY unique_broadcast_contact (broadcast_id, contact_id)
);

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
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    token       VARCHAR(512) NOT NULL UNIQUE,
    user_id     INT NOT NULL,
    user_type   ENUM('admin', 'client', 'agent', 'reseller') NOT NULL,
    expires_at  DATETIME NOT NULL,
    revoked     TINYINT(1) DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    actor_id    INT NOT NULL,
    actor_type  ENUM('admin', 'reseller') NOT NULL,
    action      VARCHAR(100) NOT NULL,
    target      VARCHAR(255),
    payload     JSON,
    ip          VARCHAR(45),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
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
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_messages_wamid_unique ON messages(wamid);
