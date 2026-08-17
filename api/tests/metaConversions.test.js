/**
 * Garantías de la integración con la Conversions API de Meta.
 *
 * Las tres primeras suites cubren fallos que NO producen ningún error visible:
 * una normalización mal hecha o un evento enviado desde preproducción se ven
 * exactamente igual que el funcionamiento correcto, y solo se detectan semanas
 * después mirando por qué las campañas rinden peor de lo esperado.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const metaConversions = require('../services/metaConversionsService');

const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

describe('metaConversionsService — normalización y hashing', () => {
  test('el correo se normaliza antes de hashear (minúsculas y sin espacios)', () => {
    // Si no se normalizara, ' Ale@140D.art ' y 'ale@140d.art' darían hashes
    // distintos: Meta no daría error, simplemente no emparejaría a nadie.
    expect(metaConversions.hashField('  Ale@140D.art  ')).toBe(sha256('ale@140d.art'));
  });

  test('el teléfono conserva solo dígitos', () => {
    expect(metaConversions.hashPhone('+34 600 123 456')).toBe(sha256('34600123456'));
    expect(metaConversions.hashPhone('(+34) 600-123-456')).toBe(sha256('34600123456'));
  });

  test('nombres y ciudades pierden espacios y puntuación', () => {
    expect(metaConversions.hashName('  Alejandro  ')).toBe(sha256('alejandro'));
    expect(metaConversions.hashName("O'Donnell")).toBe(sha256('odonnell'));
    expect(metaConversions.hashName('San Sebastián')).toBe(sha256('sansebastián'));
  });

  test('los valores vacíos producen null, nunca el hash de la cadena vacía', () => {
    // El hash de '' es un valor perfectamente válido para Meta y emparejaría a
    // todos los usuarios sin dato entre sí. Tiene que quedar fuera del payload.
    for (const empty of ['', '   ', null, undefined]) {
      expect(metaConversions.hashField(empty)).toBeNull();
      expect(metaConversions.hashPhone(empty)).toBeNull();
      expect(metaConversions.hashName(empty)).toBeNull();
    }
  });
});

describe('metaConversionsService — user_data', () => {
  test('los datos personales viajan hasheados y la IP en claro', () => {
    const userData = metaConversions.buildUserData({
      email: 'Comprador@Example.com',
      phone: '+34600123456',
      firstName: 'Ana',
      lastName: 'García',
      city: 'Madrid',
      postalCode: '28001',
      country: 'ES',
      ip: '203.0.113.9',
      userAgent: 'Mozilla/5.0',
      fbp: 'fb.1.1700000000000.1234567890',
      fbc: 'fb.1.1700000000000.ABCDEF',
    });

    expect(userData.em).toEqual([sha256('comprador@example.com')]);
    expect(userData.ph).toEqual([sha256('34600123456')]);
    expect(userData.ct).toEqual([sha256('madrid')]);
    expect(userData.zp).toEqual([sha256('28001')]);
    expect(userData.country).toEqual([sha256('es')]);

    // Meta empareja con estos tal cual: hashearlos los invalidaría.
    expect(userData.client_ip_address).toBe('203.0.113.9');
    expect(userData.client_user_agent).toBe('Mozilla/5.0');
    expect(userData.fbp).toBe('fb.1.1700000000000.1234567890');
    expect(userData.fbc).toBe('fb.1.1700000000000.ABCDEF');
  });

  test('ningún dato personal aparece en claro en el payload serializado', () => {
    const userData = metaConversions.buildUserData({
      email: 'comprador@example.com',
      phone: '+34600123456',
      firstName: 'Ana',
      lastName: 'García',
      city: 'Madrid',
    });

    const serialized = JSON.stringify(userData);
    for (const secret of ['comprador@example.com', '600123456', 'Ana', 'García', 'Madrid']) {
      expect(serialized).not.toContain(secret);
    }
  });

  test('los campos ausentes se omiten en lugar de enviarse vacíos', () => {
    const userData = metaConversions.buildUserData({ ip: '203.0.113.9' });
    expect(userData).not.toHaveProperty('em');
    expect(userData).not.toHaveProperty('ph');
    expect(userData).not.toHaveProperty('fbp');
  });
});

describe('metaConversionsService — construcción del evento', () => {
  test('event_time va en segundos, no en milisegundos', () => {
    // Meta rechaza los eventos con marca de tiempo en milisegundos: quedarían
    // ~50 000 años en el futuro.
    const event = metaConversions.buildEvent({ eventName: 'Purchase', eventId: 'order_1' });
    const now = Math.floor(Date.now() / 1000);
    expect(event.event_time).toBeGreaterThan(now - 5);
    expect(event.event_time).toBeLessThanOrEqual(now + 1);
  });

  test('conserva el event_id, que es lo que evita el doble conteo', () => {
    const event = metaConversions.buildEvent({ eventName: 'Purchase', eventId: 'order_1042' });
    expect(event.event_id).toBe('order_1042');
    expect(event.action_source).toBe('website');
  });

  test('custom_data se omite cuando está vacío', () => {
    const event = metaConversions.buildEvent({ eventName: 'PageView', eventId: 'x', customData: {} });
    expect(event).not.toHaveProperty('custom_data');
  });
});

describe('metaConversionsService — activación', () => {
  test('está desactivado bajo NODE_ENV=test', () => {
    // Los tests corren con NODE_ENV=test: ni un solo evento puede salir hacia
    // Meta desde una suite, igual que ningún correo sale del proceso.
    expect(process.env.NODE_ENV).toBe('test');
    expect(metaConversions.isEnabled()).toBe(false);
  });

  test('sendEvents no contacta con nadie cuando está desactivado', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await metaConversions.sendEvents([{ event_name: 'Purchase' }]);
    expect(result).toEqual({ sent: false, reason: 'disabled' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('la lista blanca de eventos es cerrada', () => {
    // El endpoint que la usa es público. Sin lista blanca, cualquiera podría
    // inventar nombres de evento y ensuciar el conjunto de datos.
    expect(metaConversions.ALLOWED_EVENTS.has('Purchase')).toBe(true);
    expect(metaConversions.ALLOWED_EVENTS.has('Lead')).toBe(false);
    expect(metaConversions.ALLOWED_EVENTS.has('CustomEvent')).toBe(false);
  });
});

describe('metaConversionsService — formato de la petición a Meta', () => {
  // `config.meta` es un objeto plano, así que se puede activar en caliente para
  // inspeccionar la petición sin que salga de aquí: `fetch` está mockeado.
  const config = require('../config/env');
  let original;

  beforeEach(() => {
    original = { ...config.meta };
    config.meta.enabled = true;
    config.meta.pixelId = '1234567890';
    config.meta.accessToken = 'TOKEN_DE_PRUEBA';
    config.meta.apiVersion = 'v21.0';
    config.meta.testEventCode = '';
  });

  afterEach(() => {
    Object.assign(config.meta, original);
    jest.restoreAllMocks();
  });

  async function capturePayload() {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    });

    await metaConversions.sendEvents([
      metaConversions.buildEvent({ eventName: 'Purchase', eventId: 'order_7' }),
    ]);

    const [url, options] = fetchSpy.mock.calls[0];
    return { url, options, body: JSON.parse(options.body) };
  }

  test('llama al endpoint del conjunto de datos con la versión fijada', async () => {
    const { url, options } = await capturePayload();
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/events');
    expect(options.method).toBe('POST');
  });

  test('el token viaja en el cuerpo, nunca en la URL', async () => {
    // En la URL acabaría en los logs de acceso de cualquier proxy intermedio.
    const { url, body } = await capturePayload();
    expect(url).not.toContain('TOKEN_DE_PRUEBA');
    expect(body.access_token).toBe('TOKEN_DE_PRUEBA');
  });

  test('test_event_code solo se envía cuando está configurado', async () => {
    const sinCodigo = await capturePayload();
    expect(sinCodigo.body).not.toHaveProperty('test_event_code');

    jest.restoreAllMocks();
    config.meta.testEventCode = 'TEST12345';
    const conCodigo = await capturePayload();
    expect(conCodigo.body.test_event_code).toBe('TEST12345');
  });

  test('un rechazo de Meta no lanza: devuelve el motivo', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid parameter', code: 100 } }),
    });

    await expect(metaConversions.sendEvents([{ event_name: 'Purchase' }]))
      .resolves.toEqual({ sent: false, reason: 'rejected' });
  });

  test('una caída de red no lanza: devuelve el motivo', async () => {
    // Es la garantía que impide que un problema de Meta se propague a la
    // respuesta que espera el comprador.
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));

    await expect(metaConversions.sendEvents([{ event_name: 'Purchase' }]))
      .resolves.toEqual({ sent: false, reason: 'unreachable' });
  });
});

describe('Conversions API — el token nunca se registra', () => {
  test('el servicio no pasa el token ni el cuerpo enviado al logger', () => {
    // Mismo criterio que sendcloudAuth.test.js: el cliente de Sendcloud llegó a
    // emitir un cURL con la credencial en cada petición, en producción.
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'metaConversionsService.js'),
      'utf8'
    );

    const loggerCalls = source.match(/logger\.\w+\([\s\S]*?\)/g) || [];
    expect(loggerCalls.length).toBeGreaterThan(0);

    for (const call of loggerCalls) {
      expect(call).not.toMatch(/accessToken/);
      expect(call).not.toMatch(/access_token/);
      // `body` es el payload con los hashes de datos personales.
      expect(call).not.toMatch(/\bbody\b/);
      expect(call).not.toMatch(/user_data/);
    }
  });
});
