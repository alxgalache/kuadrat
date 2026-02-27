const drawService = require('../services/drawService');

/**
 * POST /api/admin/draws
 */
const createDraw = async (req, res, next) => {
  try {
    const { name, description, product_id, product_type, price, units, max_participations, start_datetime, end_datetime, status } = req.body;

    if (!name || !product_id || !product_type || !price || !max_participations || !start_datetime || !end_datetime) {
      return res.status(400).json({
        success: false,
        title: 'Datos incompletos',
        message: 'Nombre, producto, precio, máximo de participaciones y fechas son obligatorios',
      });
    }

    if (new Date(start_datetime) >= new Date(end_datetime)) {
      return res.status(400).json({
        success: false,
        title: 'Fechas inválidas',
        message: 'La fecha de inicio debe ser anterior a la fecha de fin',
      });
    }

    const draw = await drawService.createDraw({
      name,
      description,
      product_id: parseInt(product_id, 10),
      product_type,
      price: parseFloat(price),
      units: units ? parseInt(units, 10) : 1,
      max_participations: parseInt(max_participations, 10),
      start_datetime,
      end_datetime,
      status,
    });

    const fullDraw = await drawService.getDrawById(draw.id);

    res.status(201).json({
      success: true,
      title: 'Sorteo creado',
      message: 'El sorteo se ha creado correctamente',
      draw: fullDraw,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/draws
 */
const listDraws = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filters = {};
    if (status) filters.status = status;

    const draws = await drawService.listDraws(filters);

    res.status(200).json({
      success: true,
      draws,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/draws/:id
 */
const getDraw = async (req, res, next) => {
  try {
    const draw = await drawService.getDrawById(req.params.id);

    if (!draw) {
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Sorteo no encontrado',
      });
    }

    res.status(200).json({
      success: true,
      draw,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/draws/:id
 */
const updateDraw = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, product_id, product_type, price, units, max_participations, start_datetime, end_datetime, status } = req.body;

    const fields = {};
    if (name !== undefined) fields.name = name;
    if (description !== undefined) fields.description = description;
    if (product_id !== undefined) fields.product_id = parseInt(product_id, 10);
    if (product_type !== undefined) fields.product_type = product_type;
    if (price !== undefined) fields.price = parseFloat(price);
    if (units !== undefined) fields.units = parseInt(units, 10);
    if (max_participations !== undefined) fields.max_participations = parseInt(max_participations, 10);
    if (start_datetime !== undefined) fields.start_datetime = start_datetime;
    if (end_datetime !== undefined) fields.end_datetime = end_datetime;
    if (status !== undefined) fields.status = status;

    const draw = await drawService.updateDraw(id, fields);

    if (!draw) {
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Sorteo no encontrado o no se puede modificar en su estado actual',
      });
    }

    const fullDraw = await drawService.getDrawById(id);

    res.status(200).json({
      success: true,
      title: 'Sorteo actualizado',
      message: 'El sorteo se ha actualizado correctamente',
      draw: fullDraw,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/draws/:id
 */
const deleteDraw = async (req, res, next) => {
  try {
    const result = await drawService.deleteDraw(req.params.id);

    if (!result) {
      return res.status(400).json({
        success: false,
        title: 'No se puede eliminar',
        message: 'Solo se pueden eliminar sorteos en estado borrador o cancelados',
      });
    }

    res.status(200).json({
      success: true,
      title: 'Sorteo eliminado',
      message: 'El sorteo se ha eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/draws/:id/start
 */
const startDraw = async (req, res, next) => {
  try {
    const draw = await drawService.startDraw(req.params.id);

    if (!draw) {
      return res.status(400).json({
        success: false,
        title: 'No se puede iniciar',
        message: 'Solo se pueden iniciar sorteos programados',
      });
    }

    res.status(200).json({
      success: true,
      title: 'Sorteo iniciado',
      message: 'El sorteo se ha iniciado correctamente',
      draw,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/draws/:id/cancel
 */
const cancelDraw = async (req, res, next) => {
  try {
    const draw = await drawService.cancelDraw(req.params.id);

    if (!draw) {
      return res.status(400).json({
        success: false,
        title: 'No se puede cancelar',
        message: 'No se pueden cancelar sorteos finalizados o no encontrados',
      });
    }

    res.status(200).json({
      success: true,
      title: 'Sorteo cancelado',
      message: 'El sorteo se ha cancelado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDraw,
  listDraws,
  getDraw,
  updateDraw,
  deleteDraw,
  startDraw,
  cancelDraw,
};
