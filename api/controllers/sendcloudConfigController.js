const { db } = require('../config/database')
const logger = require('../config/logger')
const { ApiError } = require('../middleware/errorHandler')
const { sendSuccess, sendCreated } = require('../utils/response')

/**
 * GET /api/admin/authors/:id/sendcloud-config
 */
const getSendcloudConfig = async (req, res, next) => {
  try {
    const { id } = req.params

    const result = await db.execute({
      sql: 'SELECT * FROM user_sendcloud_configuration WHERE user_id = ?',
      args: [id],
    })

    if (result.rows.length === 0) {
      throw new ApiError(404, 'Configuración de Sendcloud no encontrada', 'No encontrada')
    }

    sendSuccess(res, result.rows[0])
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/admin/authors/:id/sendcloud-config
 */
const createSendcloudConfig = async (req, res, next) => {
  try {
    const { id } = req.params

    // Verify user exists and is a seller
    const user = await db.execute({
      sql: 'SELECT id, role FROM users WHERE id = ?',
      args: [id],
    })

    if (user.rows.length === 0) {
      throw new ApiError(404, 'Usuario no encontrado', 'No encontrado')
    }

    if (user.rows[0].role !== 'seller') {
      throw new ApiError(400, 'Solo los vendedores pueden tener configuración de Sendcloud', 'Rol inválido')
    }

    // Check if config already exists
    const existing = await db.execute({
      sql: 'SELECT id FROM user_sendcloud_configuration WHERE user_id = ?',
      args: [id],
    })

    if (existing.rows.length > 0) {
      throw new ApiError(409, 'Ya existe una configuración de Sendcloud para este vendedor', 'Ya existe')
    }

    const body = req.body
    const preferredCarriers = Array.isArray(body.preferred_carriers)
      ? JSON.stringify(body.preferred_carriers)
      : body.preferred_carriers || null
    const excludedCarriers = Array.isArray(body.excluded_carriers)
      ? JSON.stringify(body.excluded_carriers)
      : body.excluded_carriers || null

    await db.execute({
      sql: `INSERT INTO user_sendcloud_configuration (
        user_id, sender_name, sender_company_name, sender_address_1, sender_address_2,
        sender_house_number, sender_city, sender_postal_code, sender_country,
        sender_phone, sender_email, require_signature, fragile_goods,
        insurance_type, insurance_fixed_amount, first_mile,
        preferred_carriers, excluded_carriers,
        default_hs_code, origin_country, vat_number, eori_number, self_packs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        body.sender_name || null,
        body.sender_company_name || null,
        body.sender_address_1 || null,
        body.sender_address_2 || null,
        body.sender_house_number || null,
        body.sender_city || null,
        body.sender_postal_code || null,
        body.sender_country || 'ES',
        body.sender_phone || null,
        body.sender_email || null,
        body.require_signature ? 1 : 0,
        body.fragile_goods ? 1 : 0,
        body.insurance_type || 'none',
        body.insurance_fixed_amount || null,
        body.first_mile || 'dropoff',
        preferredCarriers,
        excludedCarriers,
        body.default_hs_code || null,
        body.origin_country || 'ES',
        body.vat_number || null,
        body.eori_number || null,
        body.self_packs !== undefined ? (body.self_packs ? 1 : 0) : 1,
      ],
    })

    const created = await db.execute({
      sql: 'SELECT * FROM user_sendcloud_configuration WHERE user_id = ?',
      args: [id],
    })

    logger.info({ userId: id }, 'Sendcloud configuration created for seller')
    sendCreated(res, created.rows[0])
  } catch (error) {
    next(error)
  }
}

/**
 * PUT /api/admin/authors/:id/sendcloud-config
 */
const updateSendcloudConfig = async (req, res, next) => {
  try {
    const { id } = req.params

    const existing = await db.execute({
      sql: 'SELECT id FROM user_sendcloud_configuration WHERE user_id = ?',
      args: [id],
    })

    if (existing.rows.length === 0) {
      throw new ApiError(404, 'Configuración de Sendcloud no encontrada', 'No encontrada')
    }

    const body = req.body
    const preferredCarriers = Array.isArray(body.preferred_carriers)
      ? JSON.stringify(body.preferred_carriers)
      : body.preferred_carriers
    const excludedCarriers = Array.isArray(body.excluded_carriers)
      ? JSON.stringify(body.excluded_carriers)
      : body.excluded_carriers

    const fields = []
    const args = []

    const mapping = {
      sender_name: body.sender_name,
      sender_company_name: body.sender_company_name,
      sender_address_1: body.sender_address_1,
      sender_address_2: body.sender_address_2,
      sender_house_number: body.sender_house_number,
      sender_city: body.sender_city,
      sender_postal_code: body.sender_postal_code,
      sender_country: body.sender_country,
      sender_phone: body.sender_phone,
      sender_email: body.sender_email,
      require_signature: body.require_signature !== undefined ? (body.require_signature ? 1 : 0) : undefined,
      fragile_goods: body.fragile_goods !== undefined ? (body.fragile_goods ? 1 : 0) : undefined,
      insurance_type: body.insurance_type,
      insurance_fixed_amount: body.insurance_fixed_amount,
      first_mile: body.first_mile,
      preferred_carriers: preferredCarriers,
      excluded_carriers: excludedCarriers,
      default_hs_code: body.default_hs_code,
      origin_country: body.origin_country,
      vat_number: body.vat_number,
      eori_number: body.eori_number,
      self_packs: body.self_packs !== undefined ? (body.self_packs ? 1 : 0) : undefined,
    }

    for (const [key, value] of Object.entries(mapping)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`)
        args.push(value)
      }
    }

    if (fields.length === 0) {
      throw new ApiError(400, 'No se proporcionaron campos para actualizar', 'Sin cambios')
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    args.push(id)

    await db.execute({
      sql: `UPDATE user_sendcloud_configuration SET ${fields.join(', ')} WHERE user_id = ?`,
      args,
    })

    const updated = await db.execute({
      sql: 'SELECT * FROM user_sendcloud_configuration WHERE user_id = ?',
      args: [id],
    })

    logger.info({ userId: id }, 'Sendcloud configuration updated for seller')
    sendSuccess(res, updated.rows[0])
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/admin/shipping-methods
 * Fetches all available shipping methods from Sendcloud for ES→ES.
 */
const getShippingMethods = async (req, res, next) => {
  try {
    const sendcloudApi = require('../services/shipping/sendcloudApiClient')

    const result = await sendcloudApi.post('shipping-options', {
      body: { from_country_code: 'ES', to_country_code: 'ES' },
    })

    const methods = (result.data || []).map(item => ({
      code: item.code,
      name: item.name,
    }))

    sendSuccess(res, { data: methods })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  getSendcloudConfig,
  createSendcloudConfig,
  updateSendcloudConfig,
  getShippingMethods,
}
