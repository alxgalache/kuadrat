const { z } = require('zod')

const pickupAddressSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  companyName: z.string().optional().default(''),
  addressLine1: z.string().min(1, 'La dirección es obligatoria'),
  addressLine2: z.string().optional().default(''),
  houseNumber: z.string().optional().default(''),
  city: z.string().min(1, 'La ciudad es obligatoria'),
  postalCode: z.string().min(1, 'El código postal es obligatorio'),
  countryCode: z.string().min(2).max(2, 'El código de país debe tener 2 caracteres'),
  phoneNumber: z.string().min(1, 'El teléfono es obligatorio'),
  email: z.string().email('El email no es válido'),
})

const pickupSchema = z.object({
  body: z.object({
    address: pickupAddressSchema,
    timeSlotStart: z.string().datetime({ message: 'La fecha de inicio debe ser una fecha válida ISO 8601' }),
    timeSlotEnd: z.string().datetime({ message: 'La fecha de fin debe ser una fecha válida ISO 8601' }),
    specialInstructions: z.string().max(500).optional().default(''),
  }).refine(
    (data) => new Date(data.timeSlotStart) < new Date(data.timeSlotEnd),
    { message: 'La fecha de inicio debe ser anterior a la fecha de fin', path: ['timeSlotStart'] }
  ).refine(
    (data) => {
      const diffMs = new Date(data.timeSlotEnd) - new Date(data.timeSlotStart)
      const maxMs = 48 * 60 * 60 * 1000 // 48 hours
      return diffMs <= maxMs
    },
    { message: 'El intervalo máximo de tiempo es de 2 días', path: ['timeSlotEnd'] }
  ),
})

const bulkPickupSchema = z.object({
  body: z.object({
    orderIds: z.array(z.number().int().positive()).min(1, 'Debe seleccionar al menos un pedido'),
    address: pickupAddressSchema,
    timeSlotStart: z.string().datetime({ message: 'La fecha de inicio debe ser una fecha válida ISO 8601' }),
    timeSlotEnd: z.string().datetime({ message: 'La fecha de fin debe ser una fecha válida ISO 8601' }),
    specialInstructions: z.string().max(500).optional().default(''),
  }).refine(
    (data) => new Date(data.timeSlotStart) < new Date(data.timeSlotEnd),
    { message: 'La fecha de inicio debe ser anterior a la fecha de fin', path: ['timeSlotStart'] }
  ).refine(
    (data) => {
      const diffMs = new Date(data.timeSlotEnd) - new Date(data.timeSlotStart)
      const maxMs = 48 * 60 * 60 * 1000 // 48 hours
      return diffMs <= maxMs
    },
    { message: 'El intervalo máximo de tiempo es de 2 días', path: ['timeSlotEnd'] }
  ),
})

module.exports = { pickupSchema, bulkPickupSchema }
