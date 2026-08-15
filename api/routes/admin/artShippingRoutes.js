const express = require('express');
const router = express.Router();

const { validate } = require('../../middleware/validate');
const {
  artShippingListQuerySchema,
  artShippingPackagingSchema,
  artShippingQuoteSchema,
  artShippingZonesSchema,
} = require('../../validators/artShippingSchemas');
const {
  listArtProducts,
  savePackaging,
  saveAndQuote,
  applyZoneSelection,
} = require('../../controllers/artShippingCalculatorController');

// authenticate + adminAuth are already applied at the parent admin index.
router.get('/products', validate(artShippingListQuerySchema), listArtProducts);
router.patch('/:artId/packaging', validate(artShippingPackagingSchema), savePackaging);
router.post('/:artId/quote', validate(artShippingQuoteSchema), saveAndQuote);
router.post('/:artId/zones', validate(artShippingZonesSchema), applyZoneSelection);

module.exports = router;
