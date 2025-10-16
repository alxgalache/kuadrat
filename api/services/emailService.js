const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify transporter configuration (optional, for development)
const verifyTransporter = async () => {
  try {
    await transporter.verify();
    console.log('✓ El servicio de correo está listo para enviar mensajes');
  } catch (error) {
    console.warn('⚠ Servicio de correo no configurado - no se enviarán correos');
    console.warn('  Configure los ajustes SMTP en .env para habilitar notificaciones por correo');
  }
};

// Send purchase confirmation email
const sendPurchaseConfirmation = async (to, orderDetails) => {
  const { orderId, items, totalPrice, buyerEmail } = orderDetails;

  const itemsList = items
    .map(
      (item) =>
        `- ${item.name} (${item.type}) - €${item.price_at_purchase.toFixed(2)}`
    )
    .join('\n');

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: to,
    subject: `Confirmación de pedido - Kuadrat Gallery #${orderId}`,
    text: `
Estimado amante del arte,

¡Gracias por tu compra en Kuadrat Gallery!

Pedido #${orderId}
Fecha: ${new Date().toLocaleDateString('es-ES')}

Artículos adquiridos:
${itemsList}

Total: €${totalPrice.toFixed(2)}

Procesaremos tu pedido en breve y te enviaremos información de seguimiento una vez que tus artículos sean enviados.

Para artículos digitales, recibirás enlaces de descarga en un plazo de 24 horas.

¡Gracias por apoyar a los artistas a través de Kuadrat Gallery!

Saludos cordiales,
El equipo de Kuadrat
    `,
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #4F46E5; padding-bottom: 20px; margin-bottom: 20px; }
    .order-details { background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .total { font-size: 1.2em; font-weight: bold; margin-top: 20px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 0.9em; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="color: #4F46E5; margin: 0;">Kuadrat Gallery</h1>
      <p style="margin: 5px 0 0 0;">Tu Arte, Nuestra Pasión</p>
    </div>

    <h2>Confirmación de pedido</h2>
    <p>Estimado amante del arte,</p>
    <p>¡Gracias por tu compra en Kuadrat Gallery!</p>

    <div class="order-details">
      <p><strong>Pedido #${orderId}</strong></p>
      <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>

      <h3>Artículos adquiridos:</h3>
      ${items
        .map(
          (item) =>
            `<div class="item">
            <strong>${item.name}</strong><br>
            Tipo: ${item.type}<br>
            Precio: €${item.price_at_purchase.toFixed(2)}
          </div>`
        )
        .join('')}

      <div class="total">
        Total: €${totalPrice.toFixed(2)}
      </div>
    </div>

    <p>Procesaremos tu pedido en breve y te enviaremos información de seguimiento una vez que tus artículos sean enviados.</p>
    <p>Para artículos digitales, recibirás enlaces de descarga en un plazo de 24 horas.</p>

    <p>¡Gracias por apoyar a los artistas a través de Kuadrat Gallery!</p>

    <div class="footer">
      <p>Saludos cordiales,<br>El equipo de Kuadrat</p>
      <p style="font-size: 0.8em;">Este es un correo automático. Por favor no responder.</p>
    </div>
  </div>
</body>
</html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Correo de confirmación de compra enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error al enviar el correo de confirmación de compra:', error);
    return { success: false, error: error.message };
  }
};

// Send registration request notification email
const sendRegistrationRequest = async (userEmail) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: process.env.REGISTRATION_EMAIL,
    subject: 'Nueva solicitud de registro',
    text: `
Hola,

Se ha recibido una nueva solicitud de registro de artista en Kuadrat Gallery.

Correo electrónico del solicitante: ${userEmail}

Por favor, revisa esta solicitud y contacta al usuario para completar el proceso de registro.

Saludos,
Sistema Kuadrat Gallery
    `,
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #000000; padding-bottom: 20px; margin-bottom: 20px; }
    .content { background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .email-highlight { font-size: 1.1em; font-weight: bold; color: #000000; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 0.9em; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="color: #000000; margin: 0;">Kuadrat Gallery</h1>
      <p style="margin: 5px 0 0 0;">Nueva Solicitud de Registro</p>
    </div>

    <h2>Solicitud de Registro de Artista</h2>
    <p>Se ha recibido una nueva solicitud de registro en Kuadrat Gallery.</p>

    <div class="content">
      <p><strong>Correo electrónico del solicitante:</strong></p>
      <p class="email-highlight">${userEmail}</p>
    </div>

    <p>Por favor, revisa esta solicitud y contacta al usuario para completar el proceso de registro.</p>

    <div class="footer">
      <p>Saludos,<br>Sistema Kuadrat Gallery</p>
      <p style="font-size: 0.8em;">Este es un correo automático. Por favor no responder.</p>
    </div>
  </div>
</body>
</html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Correo de solicitud de registro enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error al enviar el correo de solicitud de registro:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  verifyTransporter,
  sendPurchaseConfirmation,
  sendRegistrationRequest,
};
