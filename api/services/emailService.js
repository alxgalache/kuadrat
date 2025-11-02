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

// SVG Logo - embedded for email compatibility
const LOGO_SVG = `
<svg width="200" height="55" viewBox="0 0 494.243 135.467" xmlns="http://www.w3.org/2000/svg">
  <path fill="#000000" d="m 25.4,0 h 84.66667 Q 120.5744,0 128.02054,7.4461313 135.46667,14.892262 135.46667,25.4 v 84.66667 q 0,10.50773 -7.44613,17.95387 -7.44614,7.44613 -17.95387,7.44613 H 25.4 q -10.50773,0 -17.9538599,-7.44613 Q 0,120.5744 0,110.06667 V 25.4 Q 0,14.892262 7.4461401,7.4461313 14.89227,0 25.4,0 Z m 53.59703,29.255357 q 0,-3.628571 -1.28512,-5.140476 Q 76.42679,22.602976 73.025,22.602976 H 56.46965 q -1.43631,3.628572 -5.78304,8.353274 -4.34672,4.724702 -7.74851,5.934226 -1.36071,0.453572 -2.53244,2.267857 -1.17173,1.814286 -1.17173,3.401786 v 7.408333 q 0,2.267858 1.6631,3.930953 1.66309,1.663095 4.00655,1.663095 1.5119,0 2.91041,-0.377976 1.39851,-0.377976 2.30566,-0.79375 0.90714,-0.415774 2.04107,-1.43631 1.13393,-1.020535 1.5497,-1.436309 0.41577,-0.415774 1.51191,-1.776488 1.09613,-1.360715 1.24732,-1.511905 V 90.336308 H 44.67679 q -2.26786,0 -3.93095,1.6253 -1.6631,1.6253 -1.6631,3.96875 v 11.263692 q 0,2.34345 1.6631,4.00655 1.66309,1.66309 3.93095,1.66309 h 46.037498 q 2.34345,0 4.006551,-1.66309 1.66309,-1.6631 1.66309,-4.00655 V 95.930358 q 0,-2.34345 -1.66309,-3.96875 -1.663101,-1.6253 -4.006551,-1.6253 H 78.99703 Z" />
  <path fill="#000000" d="m 229.65866,0 q 10.50773,0 17.95387,7.4083337 7.44613,7.4083333 7.44613,17.9160713 v 84.666665 q 0,10.50773 -7.44613,17.95387 -7.44614,7.44613 -17.95387,7.44613 h -84.66667 q -10.50773,0 -17.95386,-7.44613 -7.44614,-7.44614 -7.44614,-17.95387 V 25.324405 q 0,-10.507738 7.44614,-17.9160713 Q 134.48426,0 144.99199,0 Z m -81.03809,69.925595 q -1.13393,1.28512 -1.85209,2.834822 -0.71815,1.549702 -1.13393,2.608036 -0.41577,1.058333 -0.60476,3.099404 -0.18899,2.041072 -0.22678,2.834822 -0.0378,0.79375 0,3.439583 0.0378,2.645833 0.0378,3.326191 0,2.343448 1.5497,4.006548 1.5497,1.66309 3.74196,1.66309 h 43.54286 v 13.455949 q 0,2.26786 1.70089,3.93096 1.7009,1.66309 3.96875,1.66309 h 9.6006 q 2.34345,0 4.00655,-1.6253 1.66309,-1.62529 1.66309,-3.96875 V 93.738091 h 9.97857 q 2.19226,0 3.74196,-1.66309 1.5497,-1.6631 1.5497,-4.006548 v -7.9375 q 0,-2.343453 -1.5497,-4.006548 -1.5497,-1.663095 -3.74196,-1.663095 h -9.97857 V 28.121429 q 0,-2.267857 -1.6631,-3.930953 -1.66309,-1.663095 -4.00654,-1.663095 h -9.6006 q -11.26369,0 -12.92679,1.889881 z m 19.35238,4.535715 q 8.01309,-9.298215 25.70238,-30.313691 V 74.46131 Z" />
  <path fill="#000000" d="m 264.58398,0 h 84.66667 q 10.50773,0 17.95387,7.4461313 7.44613,7.4461307 7.44613,17.9538687 v 84.66667 q 0,10.50773 -7.44613,17.95387 -7.44614,7.44613 -17.95387,7.44613 h -84.66667 q -10.50773,0 -17.95386,-7.44613 -7.44614,-7.44614 -7.44614,-17.95387 V 25.4 q 0,-10.507738 7.44614,-17.9538687 Q 254.07625,0 264.58398,0 Z m 42.33334,112.86369 q 11.33928,0 20.90208,-6.04762 9.5628,-6.04762 15.15684,-16.441962 5.59405,-10.394346 5.59405,-22.640775 0,-12.246428 -5.59405,-22.640773 -5.59404,-10.394346 -15.15684,-16.441965 -9.5628,-6.047619 -20.90208,-6.047619 -11.33929,0 -20.90209,6.047619 -9.56279,6.047619 -15.15684,16.441965 -5.59405,10.394345 -5.59405,22.640773 0,12.246429 5.59405,22.640775 5.59405,10.394342 15.15684,16.441962 9.5628,6.04762 20.90209,6.04762 z m -5.82084,-20.486312 q 3.02381,0.75595 5.66965,0.75595 9.60059,0 16.36637,-7.332733 6.76577,-7.332738 6.76577,-18.067262 0,-8.08869 -4.23333,-14.741071 z m 11.64167,-49.288092 q -3.02381,-0.755953 -5.66964,-0.755953 -9.67619,0.0756 -16.40417,7.370536 -6.72797,7.294941 -6.72797,18.029464 0,8.088691 4.23333,14.741072 z" />
  <path fill="#000000" d="m 384.17597,0 h 84.66667 q 10.50773,0 17.95387,7.4461313 7.44613,7.4461307 7.44613,17.9538687 v 84.66667 q 0,10.50773 -7.44613,17.95387 -7.44614,7.44613 -17.95387,7.44613 h -84.66667 q -10.50773,0 -17.95386,-7.44613 -7.44614,-7.44614 -7.44614,-17.95387 V 25.4 q 0,-10.507738 7.44614,-17.9538687 Q 373.66824,0 384.17597,0 Z m 25.62679,41.728571 q 15.72381,0 18.67202,0.226786 11.94405,0.831548 16.93334,5.972024 5.74524,5.896429 5.74524,19.503571 0,4.913691 -0.71816,8.769048 -0.71815,3.855357 -2.07887,6.576786 -1.36071,2.721428 -3.32619,4.686904 -1.96548,1.965477 -4.42232,3.137198 -2.45685,1.17173 -5.36726,1.88989 -2.91042,0.71815 -6.23661,0.94494 -3.32619,0.22678 -6.99256,0.34017 -3.66637,0.1134 -7.59732,-0.0378 h -4.61131 z M 391.13074,28.272619 v 78.921431 q 0,2.34345 1.66309,4.00655 1.6631,1.66309 3.93095,1.66309 h 30.69167 q 21.16667,0 31.97678,-11.33929 10.81012,-11.339281 10.81012,-34.017852 0,-44.903572 -43.16488,-44.903572 h -30.31369 q -2.26785,0 -3.93095,1.663095 -1.66309,1.663096 -1.66309,4.006548 z" />
</svg>
`.trim();

// Generate buyer email HTML
const generateBuyerEmailHTML = (orderDetails) => {
  const { orderId, items, totalPrice } = orderDetails;

  const itemsHTML = items.map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${item.name}</div>
        ${item.variant_key ? `<div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">${item.variant_key}</div>` : ''}
        ${item.type ? `<div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Soporte: ${item.type}</div>` : ''}
        <div style="font-size: 14px; color: #6b7280;">Precio: €${item.price_at_purchase.toFixed(2)}</div>
        ${item.shipping_method_name ? `
          <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
            Envío: ${item.shipping_method_name}${item.shipping_method_type === 'pickup' ? ' (Recogida)' : ''} - €${(item.shipping_cost || 0).toFixed(2)}
          </div>
        ` : ''}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación de pedido</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
          <!-- Logo Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 2px solid #000000;">
              ${LOGO_SVG}
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #111827;">Confirmación de pedido</h1>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #374151;">
                Hemos recibido tu pedido y estamos procesándolo.
              </p>

              <!-- Order Details -->
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom: 8px;">
                      <strong style="color: #111827;">Número de pedido:</strong> #${orderId}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 8px;">
                      <strong style="color: #111827;">Fecha:</strong> ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Items -->
              <h2 style="margin: 30px 0 15px; font-size: 18px; font-weight: 600; color: #111827;">Artículos</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${itemsHTML}
                <tr>
                  <td style="padding: 20px 0 0; text-align: right;">
                    <div style="font-size: 18px; font-weight: 700; color: #111827;">
                      Total: €${totalPrice.toFixed(2)}
                    </div>
                  </td>
                </tr>
              </table>

              ${items.some(item => item.shipping_method_type === 'delivery') ? `
                <p style="margin: 30px 0 0; font-size: 14px; line-height: 1.5; color: #6b7280;">
                  Te enviaremos información de seguimiento una vez que tus artículos sean enviados.
                </p>
              ` : ''}
              ${items.some(item => item.shipping_method_type === 'pickup') ? `
                <p style="margin: 30px 0 0; font-size: 14px; line-height: 1.5; color: #6b7280;">
                  <strong>Recogida en tienda:</strong> Te contactaremos pronto para coordinar la recogida de tus artículos.
                </p>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                Este es un correo automático. Por favor no responder.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

// Generate seller email HTML
const generateSellerEmailHTML = (orderDetails, sellerItems) => {
  const { orderId, buyerEmail } = orderDetails;

  const itemsHTML = sellerItems.map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${item.name}</div>
        ${item.variant_key ? `<div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">${item.variant_key}</div>` : ''}
        ${item.type ? `<div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Soporte: ${item.type}</div>` : ''}
        <div style="font-size: 14px; color: #6b7280;">Precio: €${item.price_at_purchase.toFixed(2)}</div>
        ${item.shipping_method_name ? `
          <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
            Envío: ${item.shipping_method_name}${item.shipping_method_type === 'pickup' ? ' (Recogida)' : ''} - €${(item.shipping_cost || 0).toFixed(2)}
          </div>
        ` : ''}
      </td>
    </tr>
  `).join('');

  const sellerTotal = sellerItems.reduce((sum, item) => sum + item.price_at_purchase + (item.shipping_cost || 0), 0);

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuevo pedido recibido</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
          <!-- Logo Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 2px solid #000000;">
              ${LOGO_SVG}
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #111827;">Nuevo pedido recibido</h1>

              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #374151;">
                Has recibido un nuevo pedido con tus productos.
              </p>

              <!-- Order Details -->
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom: 8px;">
                      <strong style="color: #111827;">Número de pedido:</strong> #${orderId}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 8px;">
                      <strong style="color: #111827;">Fecha:</strong> ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 8px;">
                      <strong style="color: #111827;">Comprador:</strong> ${buyerEmail || 'Comprador invitado'}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Items -->
              <h2 style="margin: 30px 0 15px; font-size: 18px; font-weight: 600; color: #111827;">Tus productos vendidos</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${itemsHTML}
                <tr>
                  <td style="padding: 20px 0 0; text-align: right;">
                    <div style="font-size: 18px; font-weight: 700; color: #111827;">
                      Total: €${sellerTotal.toFixed(2)}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; font-size: 14px; line-height: 1.5; color: #6b7280;">
                Por favor, prepara los productos para su envío o recogida según el método seleccionado.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                Este es un correo automático. Por favor no responder.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

// Generate admin email HTML
const generateAdminEmailHTML = (orderDetails) => {
  const { orderId, items, totalPrice, buyerEmail, buyerContact, contactType, sellers } = orderDetails;

  const itemsHTML = items.map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px;">${item.name}</div>
        ${item.variant_key ? `<div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">${item.variant_key}</div>` : ''}
        ${item.type ? `<div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Soporte: ${item.type}</div>` : ''}
        <div style="font-size: 14px; color: #6b7280;">Precio: €${item.price_at_purchase.toFixed(2)}</div>
        ${item.shipping_method_name ? `
          <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
            Envío: ${item.shipping_method_name}${item.shipping_method_type === 'pickup' ? ' (Recogida)' : ''} - €${(item.shipping_cost || 0).toFixed(2)}
          </div>
        ` : ''}
      </td>
    </tr>
  `).join('');

  const sellersHTML = sellers.map(seller => `
    <tr>
      <td style="padding: 8px 0;">
        <div style="font-weight: 600; color: #111827;">${seller.name || 'N/A'}</div>
        <div style="font-size: 14px; color: #6b7280;">${seller.email}</div>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nuevo pedido - Admin</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
          <!-- Logo Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 2px solid #000000;">
              ${LOGO_SVG}
              <div style="margin-top: 12px; font-size: 14px; color: #6b7280; font-weight: 600;">ADMINISTRACIÓN</div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #111827;">Nuevo pedido registrado</h1>

              <!-- Order Details -->
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom: 8px;">
                      <strong style="color: #111827;">Número de pedido:</strong> #${orderId}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 8px;">
                      <strong style="color: #111827;">Fecha:</strong> ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 8px;">
                      <strong style="color: #111827;">Comprador:</strong> ${buyerEmail || 'Comprador invitado'}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 8px;">
                      <strong style="color: #111827;">Contacto:</strong> ${buyerContact} (${contactType === 'email' ? 'Email' : 'WhatsApp'})
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Sellers -->
              <h2 style="margin: 30px 0 15px; font-size: 18px; font-weight: 600; color: #111827;">Vendedores involucrados</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                ${sellersHTML}
              </table>

              <!-- Items -->
              <h2 style="margin: 30px 0 15px; font-size: 18px; font-weight: 600; color: #111827;">Artículos del pedido</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${itemsHTML}
                <tr>
                  <td style="padding: 20px 0 0; text-align: right;">
                    <div style="font-size: 18px; font-weight: 700; color: #111827;">
                      Total: €${totalPrice.toFixed(2)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                Panel de administración - Notificación automática
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

// Send purchase confirmation email to buyer, sellers, and admin
const sendPurchaseConfirmation = async (orderDetails) => {
  const { orderId, items, totalPrice, buyerEmail, sellers } = orderDetails;
  const results = [];

  // 1. Send email to buyer
  if (buyerEmail) {
    const buyerMailOptions = {
      from: process.env.EMAIL_FROM,
      to: buyerEmail,
      subject: `Confirmación de pedido #${orderId}`,
      html: generateBuyerEmailHTML(orderDetails),
    };

    try {
      const info = await transporter.sendMail(buyerMailOptions);
      console.log(`✓ Email de confirmación enviado al comprador (${buyerEmail}):`, info.messageId);
      results.push({ recipient: 'buyer', success: true, messageId: info.messageId });
    } catch (error) {
      console.error(`✗ Error enviando email al comprador (${buyerEmail}):`, error);
      results.push({ recipient: 'buyer', success: false, error: error.message });
    }
  }

  // 2. Send emails to each seller with their items
  for (const seller of sellers) {
    // Filter items that belong to this seller
    const sellerItems = items.filter(item => item.seller_id === seller.id);

    const sellerMailOptions = {
      from: process.env.EMAIL_FROM,
      to: seller.email,
      subject: `Nuevo pedido #${orderId} - Productos vendidos`,
      html: generateSellerEmailHTML(orderDetails, sellerItems),
    };

    try {
      const info = await transporter.sendMail(sellerMailOptions);
      console.log(`✓ Email enviado al vendedor (${seller.email}):`, info.messageId);
      results.push({ recipient: `seller:${seller.email}`, success: true, messageId: info.messageId });
    } catch (error) {
      console.error(`✗ Error enviando email al vendedor (${seller.email}):`, error);
      results.push({ recipient: `seller:${seller.email}`, success: false, error: error.message });
    }
  }

  // 3. Send email to admin
  const adminEmail = process.env.REGISTRATION_EMAIL;
  if (adminEmail) {
    const adminMailOptions = {
      from: process.env.EMAIL_FROM,
      to: adminEmail,
      subject: `[ADMIN] Nuevo pedido #${orderId} - Total: €${totalPrice.toFixed(2)}`,
      html: generateAdminEmailHTML(orderDetails),
    };

    try {
      const info = await transporter.sendMail(adminMailOptions);
      console.log(`✓ Email enviado al administrador (${adminEmail}):`, info.messageId);
      results.push({ recipient: 'admin', success: true, messageId: info.messageId });
    } catch (error) {
      console.error(`✗ Error enviando email al administrador (${adminEmail}):`, error);
      results.push({ recipient: 'admin', success: false, error: error.message });
    }
  }

  return {
    success: results.every(r => r.success),
    results,
  };
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
