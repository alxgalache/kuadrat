const path = require('path');
const fs = require('fs');
const eventService = require('../services/eventService');
const livekitService = require('../services/livekitService');

// ---------------------------------------------------------------------------
// POST /api/admin/events
// ---------------------------------------------------------------------------
const createEvent = async (req, res, next) => {
  try {
    const {
      title, description, event_datetime, duration_minutes, host_user_id,
      cover_image_url, access_type, price, currency, format, content_type,
      category, video_url, max_attendees, status,
    } = req.body;

    if (!title || !event_datetime || !host_user_id || !category) {
      return res.status(400).json({
        success: false,
        title: 'Datos incompletos',
        message: 'Título, fecha, host y categoría son obligatorios',
      });
    }

    if (access_type === 'paid' && (!price || price <= 0)) {
      return res.status(400).json({
        success: false,
        title: 'Datos inválidos',
        message: 'Los eventos de pago requieren un precio válido',
      });
    }

    const event = await eventService.createEvent({
      title, description, event_datetime, duration_minutes, host_user_id,
      cover_image_url, access_type, price, currency, format, content_type,
      category, video_url, max_attendees, status,
    });

    res.status(201).json({
      success: true,
      title: 'Evento creado',
      message: 'El evento se ha creado correctamente',
      event,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/events
// ---------------------------------------------------------------------------
const listEvents = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filters = {};
    if (status) filters.status = status;

    const events = await eventService.listEvents(filters);

    res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/events/:id
// ---------------------------------------------------------------------------
const getEvent = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Evento no encontrado',
      });
    }

    const attendees = await eventService.listAttendees(event.id);

    res.status(200).json({
      success: true,
      event,
      attendees,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/admin/events/:id
// ---------------------------------------------------------------------------
const updateEvent = async (req, res, next) => {
  try {
    const current = await eventService.getEventById(req.params.id);
    if (!current) {
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Evento no encontrado',
      });
    }

    if (['active', 'finished'].includes(current.status)) {
      return res.status(400).json({
        success: false,
        title: 'No editable',
        message: 'No se puede editar un evento activo o finalizado',
      });
    }

    const event = await eventService.updateEvent(req.params.id, req.body);

    res.status(200).json({
      success: true,
      title: 'Evento actualizado',
      message: 'El evento se ha actualizado correctamente',
      event,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/admin/events/:id
// ---------------------------------------------------------------------------
const deleteEvent = async (req, res, next) => {
  try {
    const deleted = await eventService.deleteEvent(req.params.id);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        title: 'No se puede eliminar',
        message: 'Solo se pueden eliminar eventos en borrador o cancelados',
      });
    }

    res.status(200).json({
      success: true,
      title: 'Evento eliminado',
      message: 'El evento se ha eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/events/:id/start
// Start an event and create the LiveKit room
// ---------------------------------------------------------------------------
const startEvent = async (req, res, next) => {
  try {
    const current = await eventService.getEventById(req.params.id);
    if (!current) {
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Evento no encontrado',
      });
    }

    if (current.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        title: 'No se puede iniciar',
        message: 'Solo se pueden iniciar eventos programados',
      });
    }

    let event;

    if (current.format === 'video') {
      // Video format: store the start timestamp, no LiveKit room needed
      event = await eventService.startEvent(req.params.id, {
        videoStartedAt: new Date().toISOString(),
      });
    } else {
      // Live format: create LiveKit room
      const roomName = `event-${current.id}`;
      try {
        await livekitService.createRoom(roomName, {
          maxParticipants: current.max_attendees || 0,
        });
      } catch (lkError) {
        console.error('Error creating LiveKit room:', lkError);
        return res.status(500).json({
          success: false,
          title: 'Error de sala',
          message: 'No se pudo crear la sala de streaming',
        });
      }
      event = await eventService.startEvent(req.params.id, { livekitRoomName: roomName });
    }

    // Notify clients waiting on the event detail page
    const eventSocket = req.app.get('eventSocket');
    if (eventSocket) {
      eventSocket.broadcastEventStarted(req.params.id);
    }

    res.status(200).json({
      success: true,
      title: 'Evento iniciado',
      message: 'El evento se ha iniciado correctamente',
      event,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/events/:id/end
// End an event and clean up the LiveKit room
// ---------------------------------------------------------------------------
const endEvent = async (req, res, next) => {
  try {
    const current = await eventService.getEventById(req.params.id);
    if (!current) {
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Evento no encontrado',
      });
    }

    if (current.status !== 'active') {
      return res.status(400).json({
        success: false,
        title: 'No se puede finalizar',
        message: 'Solo se pueden finalizar eventos activos',
      });
    }

    // Delete LiveKit room (only for live format events)
    if (current.format !== 'video' && current.livekit_room_name) {
      try {
        await livekitService.deleteRoom(current.livekit_room_name);
      } catch (lkError) {
        console.error('Error deleting LiveKit room:', lkError);
        // Don't fail, continue ending the event
      }
    }

    const event = await eventService.endEvent(req.params.id);

    // Notify clients that the event has ended
    const eventSocket = req.app.get('eventSocket');
    if (eventSocket) {
      eventSocket.broadcastEventEnded(req.params.id);
    }

    res.status(200).json({
      success: true,
      title: 'Evento finalizado',
      message: 'El evento se ha finalizado correctamente',
      event,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/events/:id/attendees
// ---------------------------------------------------------------------------
const getAttendees = async (req, res, next) => {
  try {
    const attendees = await eventService.listAttendees(req.params.id);
    res.status(200).json({ success: true, attendees });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/events/:id/participants/:identity/promote
// Promote a viewer to speaker (can publish)
// ---------------------------------------------------------------------------
const promoteParticipant = async (req, res, next) => {
  try {
    const current = await eventService.getEventById(req.params.id);
    if (!current || !current.livekit_room_name) {
      return res.status(400).json({
        success: false,
        message: 'Sala no disponible',
      });
    }

    await livekitService.updateParticipantPermissions(
      current.livekit_room_name,
      req.params.identity,
      {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      }
    );

    res.status(200).json({ success: true, message: 'Participante promovido' });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/events/:id/participants/:identity/demote
// Demote a speaker back to viewer
// ---------------------------------------------------------------------------
const demoteParticipant = async (req, res, next) => {
  try {
    const current = await eventService.getEventById(req.params.id);
    if (!current || !current.livekit_room_name) {
      return res.status(400).json({
        success: false,
        message: 'Sala no disponible',
      });
    }

    await livekitService.updateParticipantPermissions(
      current.livekit_room_name,
      req.params.identity,
      {
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
      }
    );

    res.status(200).json({ success: true, message: 'Participante degradado a espectador' });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/events/:id/participants/:identity/mute
// ---------------------------------------------------------------------------
const muteParticipant = async (req, res, next) => {
  try {
    const { trackSid, muted } = req.body;
    const current = await eventService.getEventById(req.params.id);
    if (!current || !current.livekit_room_name) {
      return res.status(400).json({
        success: false,
        message: 'Sala no disponible',
      });
    }

    await livekitService.muteParticipantTrack(
      current.livekit_room_name,
      req.params.identity,
      trackSid,
      muted !== false
    );

    res.status(200).json({ success: true, message: muted !== false ? 'Silenciado' : 'Desmuteado' });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/events/:id/participants
// List LiveKit room participants
// ---------------------------------------------------------------------------
const listParticipants = async (req, res, next) => {
  try {
    const current = await eventService.getEventById(req.params.id);
    if (!current || !current.livekit_room_name) {
      return res.status(200).json({ success: true, participants: [] });
    }

    const participants = await livekitService.listParticipants(current.livekit_room_name);

    res.status(200).json({
      success: true,
      participants: participants.map(p => ({
        identity: p.identity,
        name: p.name,
        state: p.state,
        joinedAt: p.joinedAt,
        permission: p.permission,
        tracks: (p.tracks || []).map(t => ({
          sid: t.sid,
          type: t.type,
          source: t.source,
          muted: t.muted,
        })),
      })),
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/admin/events/:id/upload-video
// Upload a video file for a video-format event
// ---------------------------------------------------------------------------
const uploadVideo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        title: 'Error de validación',
        message: 'No se proporcionó ningún archivo de vídeo',
      });
    }

    const current = await eventService.getEventById(req.params.id);
    if (!current) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        title: 'No encontrado',
        message: 'Evento no encontrado',
      });
    }

    // Delete previous uploaded video if it exists
    if (current.video_url && current.video_url.startsWith('uploaded:')) {
      const oldFilename = current.video_url.replace('uploaded:', '');
      const oldPath = path.join(__dirname, '../uploads/events', oldFilename);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const videoUrl = `uploaded:${req.file.filename}`;
    await eventService.updateEvent(req.params.id, { video_url: videoUrl });

    res.status(200).json({
      success: true,
      title: 'Vídeo subido',
      message: 'El archivo de vídeo se ha subido correctamente',
      video_url: videoUrl,
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  startEvent,
  endEvent,
  getAttendees,
  uploadVideo,
  promoteParticipant,
  demoteParticipant,
  muteParticipant,
  listParticipants,
};
