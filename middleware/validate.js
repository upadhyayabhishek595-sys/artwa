const Joi = require('joi');

const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors:  error.details.map((d) => d.message),
        });
    }
    next();
};

const fields = {
    email:    Joi.string().email().max(255).required(),
    password: Joi.string().min(6).max(128).required(),
    phone:    Joi.string().pattern(/^[0-9]{7,15}$/).required().messages({
        'string.pattern.base': 'Phone must be 7–15 digits, no spaces or symbols',
    }),
    phoneOptional: Joi.string().pattern(/^[0-9]{7,15}$/).optional().allow('', null),
    name:     Joi.string().min(1).max(100).required(),
    nameOpt:  Joi.string().min(1).max(100).optional().allow('', null),
};

const flowTrigger = Joi.object({
    type:       Joi.string().valid('keyword').required(),
    keywords:   Joi.array().items(Joi.string().max(50)).min(1).required(),
    match_type: Joi.string().valid('exact', 'contains').default('contains'),
});

const flowStep = Joi.object({
    action: Joi.string()
        .valid('send_text', 'send_template', 'assign_to_agent', 'add_tag')
        .required(),
    text:          Joi.string().max(4096).optional(),
    template_name: Joi.string().max(100).optional(),
    language:      Joi.string().max(10).optional(),
    components:    Joi.array().optional(),
    agent_id:      Joi.number().integer().positive().optional().allow(null),
    tag:           Joi.string().max(50).optional(),
});

const schemas = {

    adminLogin: Joi.object({
        email:    fields.email,
        password: fields.password,
    }),

    clientLogin: Joi.object({
        email:    fields.email,
        password: fields.password,
    }),

    agentLogin: Joi.object({
        email:    fields.email,
        password: fields.password,
    }),

    resellerLogin: Joi.object({
        email:    fields.email,
        password: fields.password,
    }),

    acceptInvite: Joi.object({
        token:    Joi.string().required(),
        password: Joi.string().min(8).max(128).required(),
        name:     fields.nameOpt,
    }),

    changePassword: Joi.object({
        current_password: Joi.string().required(),
        new_password:     Joi.string().min(8).max(128).required().messages({
            'string.min': 'New password must be at least 8 characters',
        }),
    }),

    createClient: Joi.object({
        name:          fields.name,
        business_name: Joi.string().max(150).optional().allow('', null),
        email:         fields.email,
        password:      Joi.string().min(6).max(128).optional(),
        phone:         fields.phoneOptional,
        plan_id:       Joi.number().integer().positive().optional().allow(null),
        reseller_id:   Joi.number().integer().positive().optional().allow(null),
        send_invite:   Joi.boolean().optional(),
    }),

    createContact: Joi.object({
        phone: fields.phone,
        name:  fields.nameOpt,
        email: Joi.string().email().optional().allow('', null),
        tags:  Joi.array().items(Joi.string().max(50)).optional(),
        notes: Joi.string().max(1000).optional().allow('', null),
    }),

    updateContact: Joi.object({
        name:     fields.nameOpt,
        email:    Joi.string().email().optional().allow('', null),
        tags:     Joi.array().items(Joi.string().max(50)).optional(),
        notes:    Joi.string().max(1000).optional().allow('', null),
        opted_in: Joi.number().valid(0, 1).optional(),
        is_blocked: Joi.number().valid(0, 1).optional(),
    }),

    sendMessage: Joi.object({
        conversation_id: Joi.number().integer().positive().required(),
        type: Joi.string()
            .valid('text', 'image', 'video', 'audio', 'document', 'template', 'location', 'interactive')
            .default('text'),
        body:          Joi.string().max(4096).optional().allow('', null),
        media_url:     Joi.string().uri().optional().allow('', null),
        media_id:      Joi.string().max(255).optional().allow('', null),
        caption:       Joi.string().max(1024).optional().allow('', null),
        template_name: Joi.string().max(100).optional(),
        template_data: Joi.object().optional(),
        location_lat:  Joi.number().optional(),
        location_lng:  Joi.number().optional(),
        location_name: Joi.string().max(255).optional(),
        interactive_data: Joi.object({
            type: Joi.string().valid('button', 'list').required(),
            body: Joi.object({ text: Joi.string().max(1024).required() }).required(),
            action: Joi.object().required(),
            header: Joi.object().optional(),
            footer: Joi.object().optional(),
        }).optional(),
    }),

    createBroadcast: Joi.object({
        name:            Joi.string().max(150).required(),
        template_id:     Joi.number().integer().positive().required(),
        phone_number_id: Joi.number().integer().positive().required(),
        contact_ids:     Joi.array().items(Joi.number().integer().positive()).optional(),
        tag:             Joi.string().max(50).optional(),
        scheduled_at:    Joi.date().iso().optional().allow(null),
    }),

    topupCredits: Joi.object({
        amount: Joi.number().min(0.0001).max(1000000).required(),
        note:   Joi.string().max(500).optional().allow('', null),
    }),

    addCredits: Joi.object({
        amount: Joi.number().min(0.0001).max(1000000).required(),
        note:   Joi.string().max(500).optional().allow('', null),
    }),

    createReseller: Joi.object({
        name:           fields.name,
        email:          fields.email,
        password:       Joi.string().min(8).max(128).required(),
        markup_percent: Joi.number().min(0).max(100).default(20),
    }),

    updateReseller: Joi.object({
        name:           fields.nameOpt,
        markup_percent: Joi.number().min(0).max(100).optional(),
        status:         Joi.string().valid('active', 'inactive', 'suspended').optional(),
    }),

    assignPlan: Joi.object({
        plan_id: Joi.number().integer().positive().required(),
    }),

    addPhoneNumber: Joi.object({
        phone_number_id: Joi.string().max(50).required(),
        phone_number:    Joi.string().max(20).required(),
        access_token:    Joi.string().min(10).required(),
        display_name:    Joi.string().max(100).optional().allow('', null),
        waba_id:         Joi.string().max(50).optional().allow('', null),
    }),

    createTemplate: Joi.object({
        name: Joi.string().pattern(/^[a-z0-9_]+$/).max(100).required().messages({
            'string.pattern.base': 'Template name: lowercase letters, numbers, underscores only',
        }),
        category:   Joi.string().valid('MARKETING', 'UTILITY', 'AUTHENTICATION').required(),
        language:   Joi.string().max(10).default('en_US'),
        components: Joi.array().min(1).required(),
    }),

    updateSettings: Joi.object({
        business_hours_enabled: Joi.number().valid(0, 1).optional(),
        business_hours:         Joi.object().optional(),
        timezone:               Joi.string().max(50).optional(),
        auto_reply_enabled:     Joi.number().valid(0, 1).optional(),
        auto_reply_message:     Joi.string().max(2000).optional().allow('', null),
        away_message_enabled:   Joi.number().valid(0, 1).optional(),
        away_message:           Joi.string().max(2000).optional().allow('', null),
        assignment_mode:        Joi.string().valid('manual', 'auto', 'round_robin').optional(),
        email_notifications:    Joi.number().valid(0, 1).optional(),
        language:               Joi.string().max(10).optional(),
    }),

    createFlow: Joi.object({
        name:        fields.name,
        description: Joi.string().max(500).optional().allow('', null),
        trigger:     flowTrigger.required(),
        steps:       Joi.array().items(flowStep).min(1).required(),
        priority:    Joi.number().integer().min(0).max(1000).optional(),
        active:      Joi.boolean().optional(),
    }),

    updateFlow: Joi.object({
        name:        fields.nameOpt,
        description: Joi.string().max(500).optional().allow('', null),
        trigger:     flowTrigger.optional(),
        steps:       Joi.array().items(flowStep).min(1).optional(),
        priority:    Joi.number().integer().min(0).max(1000).optional(),
        active:      Joi.boolean().optional(),
    }),

    createGroup: Joi.object({
        name:        fields.name,
        description: Joi.string().max(500).optional().allow('', null),
        color:       Joi.string().max(10).optional().allow('', null),
    }),

    updateGroup: Joi.object({
        name:        fields.nameOpt,
        description: Joi.string().max(500).optional().allow('', null),
        color:       Joi.string().max(10).optional().allow('', null),
    }),

    groupMembers: Joi.object({
        contact_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
    }),

    createInvoice: Joi.object({
        client_id:       Joi.number().integer().positive().required(),
        amount:          Joi.number().min(0.01).required(),
        tax:             Joi.number().min(0).optional(),
        notes:           Joi.string().max(1000).optional().allow('', null),
        due_date:        Joi.date().iso().optional().allow(null),
        subscription_id: Joi.number().integer().positive().optional().allow(null),
    }),

    platformSetting: Joi.object({
        value: Joi.string().max(5000).required(),
    }),

    updateBusinessProfile: Joi.object({
        phone_number_id: Joi.number().integer().positive().required(),
        about:           Joi.string().max(139).optional().allow('', null),
        address:         Joi.string().max(256).optional().allow('', null),
        description:     Joi.string().max(512).optional().allow('', null),
        email:           Joi.string().email().max(255).optional().allow('', null),
        vertical:        Joi.string().max(50).optional().allow('', null),
        websites:        Joi.array().items(Joi.string().uri().max(500)).max(2).optional(),
    }),

    embeddedSignupComplete: Joi.object({
        code:            Joi.string().required(),
        waba_id:         Joi.string().max(50).required(),
        phone_number_id: Joi.string().max(50).required(),
        phone_number:    Joi.string().max(20).required(),
        display_name:    Joi.string().max(100).optional().allow('', null),
    }),
};

module.exports = { validate, schemas };
