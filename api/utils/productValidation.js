const { imageSize } = require('image-size');
const { randomUUID } = require('crypto');
const { ApiError } = require('../middleware/errorHandler');

// Shared product field/image validation used by the public create endpoints
// (art/others) and the admin full-edit endpoints, so the rules cannot drift.

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// Validate the fields common to art and others products. `productType` is
// 'art' | 'other' and selects the Sendcloud toggle that makes weight mandatory.
// Returns an array of { field, message } validation errors.
const validateCommonProductFields = ({ name, description, price, weight, dimensions }, productType) => {
  const errors = [];

  // Validate name
  if (!name || typeof name !== 'string') {
    errors.push({ field: 'name', message: 'El nombre es obligatorio' });
  } else if (name.trim().length < 5) {
    errors.push({ field: 'name', message: 'El nombre debe tener al menos 5 caracteres' });
  } else if (name.trim().length > 200) {
    errors.push({ field: 'name', message: 'El nombre no debe exceder 200 caracteres' });
  }

  // Validate description
  if (!description || typeof description !== 'string') {
    errors.push({ field: 'description', message: 'La descripción es obligatoria' });
  } else if (description.trim().length < 100) {
    errors.push({ field: 'description', message: 'La descripción debe tener al menos 100 caracteres' });
  } else if (description.trim().length > 1000) {
    errors.push({ field: 'description', message: 'La descripción no debe exceder 1000 caracteres' });
  }

  // Validate price
  if (!price) {
    errors.push({ field: 'price', message: 'El precio es obligatorio' });
  } else {
    const priceNum = parseFloat(price);
    if (!Number.isFinite(priceNum)) {
      errors.push({ field: 'price', message: 'El precio debe ser un número válido' });
    } else if (priceNum < 10) {
      errors.push({ field: 'price', message: 'El precio debe ser al menos €10' });
    } else if (priceNum > 10000) {
      errors.push({ field: 'price', message: 'El precio no debe exceder €10,000' });
    }
  }

  // Validate weight (mandatory when Sendcloud is enabled, otherwise optional).
  // Lazy require to avoid loading the shipping factory at module init.
  const { isSendcloudEnabled } = require('../services/shipping/shippingProviderFactory');
  if (isSendcloudEnabled(productType)) {
    if (!weight || !weight.toString().trim()) {
      errors.push({ field: 'weight', message: 'El peso es obligatorio para poder calcular el envío' });
    } else {
      const weightNum = parseInt(weight, 10);
      if (!Number.isInteger(weightNum) || weightNum <= 0) {
        errors.push({ field: 'weight', message: 'El peso debe ser un número entero mayor que 0' });
      }
    }
  } else if (weight) {
    const weightNum = parseInt(weight, 10);
    if (!Number.isInteger(weightNum) || weightNum <= 0) {
      errors.push({ field: 'weight', message: 'El peso debe ser un número entero mayor que 0' });
    }
  }

  // Validate dimensions (optional, but if provided must follow format WxLxH)
  if (dimensions && typeof dimensions === 'string') {
    const dimensionsRegex = /^\d+x\d+x\d+$/;
    if (!dimensionsRegex.test(dimensions.trim())) {
      errors.push({ field: 'dimensions', message: 'Las dimensiones deben estar en formato "LxWxH" (ej: 30x20x10)' });
    }
  }

  return errors;
};

// Validate the art-only `type` field (soporte/media)
const validateArtType = (type) => {
  const errors = [];
  if (!type || typeof type !== 'string') {
    errors.push({ field: 'type', message: 'El soporte es obligatorio' });
  } else if (type.trim().length < 3) {
    errors.push({ field: 'type', message: 'El soporte debe tener al menos 3 caracteres' });
  } else if (type.trim().length > 100) {
    errors.push({ field: 'type', message: 'El soporte no debe exceder 100 caracteres' });
  }
  return errors;
};

// Validate a single uploaded image file (MIME type + minimum dimensions)
const validateImageFile = (file, fieldName) => {
  const errors = [];

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    errors.push({ field: fieldName, message: 'Solo se permiten imágenes PNG, JPG y WEBP' });
  }

  try {
    const dims = imageSize(file.buffer);
    if (!dims || dims.width < 600 || dims.height < 600) {
      errors.push({ field: fieldName, message: 'La imagen debe tener al menos 600x600 píxeles' });
    }
  } catch (e) {
    errors.push({ field: fieldName, message: 'Archivo de imagen inválido' });
  }

  return errors;
};

// Get file extension from mime type
const getFileExtension = (mimetype) => {
  switch (mimetype) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    default: return null;
  }
};

// Generate unique basename for an image file
const generateUniqueBasename = (mimetype) => {
  const ext = getFileExtension(mimetype);
  if (!ext) throw new ApiError(400, 'Formato de imagen no soportado', 'Imagen inválida');
  return `${randomUUID()}.${ext}`;
};

module.exports = {
  ALLOWED_MIME_TYPES,
  validateCommonProductFields,
  validateArtType,
  validateImageFile,
  getFileExtension,
  generateUniqueBasename,
};
