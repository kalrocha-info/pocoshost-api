import { pool } from '../db/pool.js';
import { sendServerError } from '../utils/http.js';

const PROPERTY_TYPE_LABELS = {
  casa: 'casa',
  apartamento: 'apartamento',
  chale: 'chalé',
  pousada: 'pousada',
  sitio: 'sítio',
  hotel: 'hotel',
  outro: 'imóvel',
};
const MANAGEMENT_INTEREST_LABELS = {
  complete_management: 'gestão completa',
  direct_listing: 'anúncio/reserva direta',
  maintenance_only: 'manutenção e preparação',
  unsure: 'avaliação inicial',
};
const PROPERTY_STATUS_LABELS = {
  ready: 'pronto para receber hóspedes',
  needs_adjustments: 'precisa de ajustes',
  under_renovation: 'em reforma',
  planning: 'em planejamento',
  unknown: 'status não informado',
};
const PRIVACY_POLICY_VERSION = '2.1';

function normalizePhone(value) {
  return value ? value.replace(/\D/g, '') : null;
}

function formatBedrooms(bedrooms) {
  if (bedrooms === null || bedrooms === undefined) return null;
  if (bedrooms === 0) return 'sem quarto informado';
  if (bedrooms === 1) return '1 quarto';
  return `${bedrooms} quartos`;
}

function buildSummary({
  propertyType,
  city,
  neighborhood,
  bedrooms,
  managementInterest,
  propertyStatus,
}) {
  const label = PROPERTY_TYPE_LABELS[propertyType] ?? 'imóvel';
  const location = neighborhood ? `${neighborhood}, ${city}` : city;
  const interest = MANAGEMENT_INTEREST_LABELS[managementInterest] ?? 'gestão completa';
  const details = [formatBedrooms(bedrooms), PROPERTY_STATUS_LABELS[propertyStatus]]
    .filter(Boolean)
    .join('; ');
  const suffix = details ? ` (${details})` : '';
  return `Interesse em ${interest} para ${label} em ${location}${suffix}.`;
}

function buildActivity({
  propertyType,
  city,
  neighborhood,
  bedrooms,
  managementInterest,
  propertyStatus,
  acceptsMaintenanceCoordination,
  notes,
  landingPage,
  marketingConsent,
}) {
  const summary = buildSummary({
    propertyType,
    city,
    neighborhood,
    bedrooms,
    managementInterest,
    propertyStatus,
  });
  const origin = landingPage
    ? `${summary} Formulário enviado em ${landingPage}.`
    : `${summary} Formulário público enviado.`;
  const maintenance = acceptsMaintenanceCoordination
    ? 'aceita coordenação de manutenção'
    : 'não marcou coordenação de manutenção';
  const observation = notes ? ` Observações: ${notes}.` : '';
  return `${origin} ${maintenance}. Política de Privacidade v${PRIVACY_POLICY_VERSION} aceita; contato autorizado; marketing: ${marketingConsent ? 'sim' : 'não'}.${observation}`;
}

export async function createHostLead(req, res) {
  // Honeypot: confirma o recebimento sem persistir ou revelar o bloqueio ao bot.
  if (req.body.website) {
    return res.status(202).json({
      success: true,
      message: 'Recebemos seus dados e entraremos em contato.',
    });
  }

  const {
    full_name: fullName,
    email,
    phone,
    property_type: propertyType,
    city,
    neighborhood,
    bedrooms,
    management_interest: managementInterest,
    property_status: propertyStatus,
    accepts_maintenance_coordination: acceptsMaintenanceCoordination,
    notes,
    marketing_consent: marketingConsent,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
    utm_term: utmTerm,
    landing_page: landingPage,
    referrer,
  } = req.body;
  const normalizedEmail = email?.toLowerCase() ?? null;
  const normalizedPhone = normalizePhone(phone);
  const summary = buildSummary({
    propertyType,
    city,
    neighborhood,
    bedrooms,
    managementInterest,
    propertyStatus,
  });
  const activityContent = buildActivity({
    propertyType,
    city,
    neighborhood,
    bedrooms,
    managementInterest,
    propertyStatus,
    acceptsMaintenanceCoordination,
    notes,
    landingPage,
    marketingConsent,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, user_id
         FROM crm_contacts
        WHERE ($1::text IS NOT NULL AND LOWER(email) = $1)
           OR ($2::text IS NOT NULL
               AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
        ORDER BY CASE WHEN user_id IS NOT NULL THEN 0 ELSE 1 END, updated_date DESC
        LIMIT 1
        FOR UPDATE`,
      [normalizedEmail, normalizedPhone],
    );

    let contactId;
    if (existing.rows[0]) {
      contactId = existing.rows[0].id;
      await client.query(
        `UPDATE crm_contacts
            SET full_name = CASE WHEN user_id IS NULL THEN $1 ELSE full_name END,
                email = COALESCE(email, $2),
                phone = COALESCE(phone, $3),
                contact_type = 'host',
                stage = CASE
                  WHEN user_id IS NULL AND stage = 'inactive' THEN 'lead'
                  ELSE stage
                END,
                stage_changed_at = CASE
                  WHEN user_id IS NULL AND stage = 'inactive' THEN NOW()
                  ELSE stage_changed_at
                END,
                source = COALESCE(source, 'website_host_landing'),
                summary = $4,
                next_action_at = COALESCE(next_action_at, NOW()),
                utm_source = COALESCE($5, utm_source),
                utm_medium = COALESCE($6, utm_medium),
                utm_campaign = COALESCE($7, utm_campaign),
                utm_content = COALESCE($8, utm_content),
                utm_term = COALESCE($9, utm_term),
                landing_page = COALESCE($10, landing_page),
                referrer = COALESCE($11, referrer),
                privacy_accepted_at = COALESCE(privacy_accepted_at, NOW()),
                contact_consent_at = NOW(),
                marketing_consent = marketing_consent OR $12,
                marketing_consent_at = CASE
                  WHEN $12 THEN COALESCE(marketing_consent_at, NOW())
                  ELSE marketing_consent_at
                END,
                updated_date = NOW()
          WHERE id = $13`,
        [
          fullName,
          normalizedEmail,
          phone ?? null,
          summary,
          utmSource ?? null,
          utmMedium ?? null,
          utmCampaign ?? null,
          utmContent ?? null,
          utmTerm ?? null,
          landingPage ?? null,
          referrer ?? null,
          marketingConsent,
          contactId,
        ],
      );
    } else {
      const created = await client.query(
        `INSERT INTO crm_contacts (
           full_name, email, phone, contact_type, stage, source, summary,
           next_action_at, utm_source, utm_medium, utm_campaign, utm_content,
           utm_term, landing_page, referrer, privacy_accepted_at,
           contact_consent_at, marketing_consent, marketing_consent_at
         )
         VALUES (
           $1,$2,$3,'host','lead','website_host_landing',$4,
           NOW(),$5,$6,$7,$8,$9,$10,$11,NOW(),NOW(),$12,
           CASE WHEN $12 THEN NOW() ELSE NULL END
         )
         RETURNING id`,
        [
          fullName,
          normalizedEmail,
          phone ?? null,
          summary,
          utmSource ?? null,
          utmMedium ?? null,
          utmCampaign ?? null,
          utmContent ?? null,
          utmTerm ?? null,
          landingPage ?? null,
          referrer ?? null,
          marketingConsent,
        ],
      );
      contactId = created.rows[0].id;
    }

    await client.query(
      `INSERT INTO host_lead_profiles (
         contact_id, property_type, city, neighborhood, bedrooms,
         management_interest, property_status, accepts_maintenance_coordination, notes
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (contact_id) DO UPDATE
         SET property_type = EXCLUDED.property_type,
             city = EXCLUDED.city,
             neighborhood = EXCLUDED.neighborhood,
             bedrooms = EXCLUDED.bedrooms,
             management_interest = EXCLUDED.management_interest,
             property_status = EXCLUDED.property_status,
             accepts_maintenance_coordination = EXCLUDED.accepts_maintenance_coordination,
             notes = EXCLUDED.notes,
             updated_date = NOW()`,
      [
        contactId,
        propertyType,
        city,
        neighborhood ?? null,
        bedrooms ?? null,
        managementInterest,
        propertyStatus,
        acceptsMaintenanceCoordination,
        notes ?? null,
      ],
    );

    await client.query(
      `INSERT INTO crm_activities (contact_id, activity_type, content)
       VALUES ($1, 'note', $2)`,
      [contactId, activityContent],
    );
    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Recebemos seus dados e entraremos em contato.',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return sendServerError(res, err);
  } finally {
    client.release();
  }
}
